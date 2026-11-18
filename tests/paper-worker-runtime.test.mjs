import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

/**
 * Run the REAL worker as a child process. The only substitutes are:
 * - local, in-memory PostgREST-shaped endpoints (no Supabase project touched)
 * - test-preloaded simulated public ticks (no external WebSocket)
 *
 * SQL semantics for reservations, ownership, worker leases, pause and stop
 * are independently exercised against PostgreSQL by the existing CI job.
 */
test("paper worker completes start, simulated settlement, pause, resume and stop", {
  timeout: 75_000,
}, async () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  const botId = "22222222-2222-4222-8222-222222222222";
  const customerId = "33333333-3333-4333-8333-333333333333";
  const state = {
    desired: "running",
    observed: "stopped",
    version: 1,
    open: false,
    positionId: "44444444-4444-4444-8444-444444444444",
    lastEpoch: 0,
    remaining: 0,
    reserved: 0,
    settled: 0,
    syncs: 0,
    pauses: 0,
    stops: 0,
    unexpectedRequests: [],
  };
  let child = null;
  let childOutput = "";
  const writeJson = (res, code, obj) => {
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(obj));
  };

  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    let body = {};
    if (req.method === "POST") {
      const bytes = [];
      for await (const chunk of req) bytes.push(chunk);
      try {
        body = JSON.parse(Buffer.concat(bytes).toString("utf8"));
      } catch {
        return writeJson(res, 400, {message:"Invalid test request"});
      }
    }

    if (req.method === "GET" && pathname === "/rest/v1/bot_execution_runs") {
      const visible = state.desired !== "stopped" || state.observed !== "stopped";
      return writeJson(res, 200, visible ? [{
        id: runId, bot_id: botId,
        desired_state: state.desired,
        observed_state: state.observed,
        control_version: state.version,
        updated_at: new Date().toISOString(),
      }] : []);
    }
    if (req.method === "GET" && pathname === "/rest/v1/bot_execution_paper_positions") {
      return writeJson(res, 200, state.open
        ? [{id:state.positionId,status:"open"}]
        : []);
    }
    if (req.method === "POST" && pathname === "/rest/v1/rpc/senfx_paper_worker_sync") {
      state.syncs++;
      const allowed = body.p_run_id === runId &&
        typeof body.p_worker_id === "string" &&
        body.p_worker_id.startsWith("senfxpaper_");
      if (!allowed) return writeJson(res, 200, {owned:false,reason:"Test owner denied"});

      if (state.desired === "running") {
        state.observed = body.p_report === "running" ? "running" : "starting";
      } else {
        state.observed = state.desired;
        if (state.desired === "paused") state.pauses++;
        if (state.desired === "stopped") state.stops++;
        state.open = false; // mirror reviewed DB's paper reservation cancellation
      }
      return writeJson(res, 200, {
        owned:true,
        runId,
        botId,
        customerId,
        botName:"SENFX Synthetic Pro",
        botMarket:"Synthetic Indices",
        isPublished:true,
        desiredState:state.desired,
        observedState:state.observed,
        version:state.version,
        leaseSeconds:state.desired==="stopped" ? 0 : 20,
      });
    }
    if (req.method === "POST" && pathname === "/rest/v1/rpc/senfx_paper_worker_reserve") {
      const authorized = body.p_run_id === runId &&
        body.p_version === state.version &&
        state.desired === "running" && state.observed === "running" &&
        body.p_symbol === "R_100" &&
        (body.p_direction === "CALL" || body.p_direction === "PUT") &&
        Number.isFinite(body.p_entry) && !state.open;
      if (!authorized) {
        return writeJson(res, 200, {allowed:false,reason:"Test server denied stale or duplicate paper reservation"});
      }
      state.open = true;
      state.remaining = 5;
      state.lastEpoch = body.p_tick_epoch;
      state.reserved++;
      return writeJson(res, 200, {
        allowed:true,positionId:state.positionId,
        reservationId:"55555555-5555-4555-8555-555555555555",
        remainingTicks:5,
      });
    }
    if (req.method === "POST" && pathname === "/rest/v1/rpc/senfx_paper_worker_tick") {
      if (!state.open || state.desired!=="running" || state.observed!=="running" ||
          body.p_version!==state.version || body.p_run_id!==runId) {
        return writeJson(res, 200, {accepted:false,reason:"Test ledger rejected stale tick"});
      }
      if (body.p_tick_epoch <= state.lastEpoch) {
        return writeJson(res, 200, {
          accepted:true,duplicateTick:true,remainingTicks:state.remaining,
        });
      }
      state.lastEpoch = body.p_tick_epoch;
      state.remaining--;
      if (state.remaining===0) {
        state.open=false;
        state.settled++;
        return writeJson(res, 200, {
          accepted:true,settled:true,remainingTicks:0, outcome:"WIN",
        });
      }
      return writeJson(res, 200, {
        accepted:true,settled:false,remainingTicks:state.remaining,
      });
    }
    state.unexpectedRequests.push(req.method + " " + pathname);
    return writeJson(res, 404, {message:"Unexpected mock endpoint"});
  });

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");

    child = spawn(process.execPath, [
      "--experimental-strip-types",
      "--import", "./tests/fixtures/paper-worker-fake-feed.mjs",
      "worker/senfx-customer-paper-worker.mjs",
    ], {
      cwd: process.cwd(),
      env: {
        PATH:process.env.PATH || "",
        HOME:process.env.HOME || "",
        NODE_ENV:"test",
        SENFX_PAPER_WORKER_ENABLED:"true",
        SUPABASE_URL:"http://127.0.0.1:" + address.port,
        SUPABASE_SERVICE_ROLE_KEY:"local-only-ci-placeholder",
      },
      stdio:["ignore","pipe","pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => {childOutput = (childOutput + chunk).slice(-8000);});
    child.stderr.on("data", chunk => {childOutput = (childOutput + chunk).slice(-8000);});

    const waitFor = async (description, predicate, timeoutMs=18_000) => {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (predicate()) return;
        if (child.exitCode !== null) {
          throw Error("Worker exited before " + description + ". Logs:\n" + childOutput);
        }
        await new Promise(resolve => setTimeout(resolve, 110));
      }
      throw Error("Timed out during " + description + ". State: " +
        JSON.stringify(state) + "\nLogs:\n" + childOutput);
    };

    await waitFor("first paper-only reserve and settlement",
      () => state.reserved >= 1 && state.settled >= 1, 25_000);
    const firstSettled = state.settled;
    assert.equal(state.observed, "running");

    // A persistent command change arrives from the customer control plane.
    state.desired = "paused";
    state.version++;
    await waitFor("Pause acknowledgement", () => state.observed==="paused", 7_000);
    assert.ok(state.pauses >= 1);
    const beforePause = state.reserved;
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(state.reserved, beforePause,
      "The worker must not reserve additional paper trades while paused.");

    state.desired = "running";
    state.version++;
    await waitFor("Resume acknowledgement", () => state.observed==="running", 7_000);
    await waitFor("paper-only settlement after Resume",
      () => state.settled > firstSettled, 22_000);

    state.desired = "stopped";
    state.version++;
    await waitFor("Stop acknowledgement", () => state.observed==="stopped", 7_000);
    assert.ok(state.stops >= 1);
    const beforeStop = state.reserved;
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(state.reserved, beforeStop);
    assert.equal(state.open,false);
    assert.deepEqual(state.unexpectedRequests,[],
      "A hermetic paper worker must never call a broker-order or unfamiliar API endpoint.");
    assert.match(childOutput,/paper trade recorded/);
    assert.doesNotMatch(childOutput,/broker order placed|real-money order/i);
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        once(child,"exit"),
        new Promise(resolve => setTimeout(resolve, 1500)),
      ]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
});
