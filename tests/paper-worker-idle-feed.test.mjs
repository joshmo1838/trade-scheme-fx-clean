import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

// The actual child worker is exercised with a loopback-only PostgREST stub
// and a fake public Deriv feed; no user accounts or broker orders exist.
test("idle paper worker opens no socket; Start connects and Stop disconnects", {
  timeout: 45_000,
}, async () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  const state = { desired: null, observed: "stopped", polls: 0, commands: [], unknown: [] };
  let child;
  let output = "";
  const reply = (res, status, data) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(data));
  };
  const server = createServer(async (req, res) => {
    const path = new URL(req.url || "/", "http://127.0.0.1").pathname;
    let body = {};
    if (req.method === "POST") {
      const parts = [];
      for await (const part of req) parts.push(part);
      try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); }
      catch { return reply(res, 400, { message: "Invalid test request" }); }
    }
    if (req.method === "GET" && path === "/rest/v1/bot_execution_runs") {
      state.polls++;
      return reply(res, 200, !state.desired ||
        (state.desired === "stopped" && state.observed === "stopped") ? [] : [{
          id: runId, desired_state: state.desired,
          observed_state: state.observed, control_version: 1,
          updated_at: new Date().toISOString()
        }]);
    }
    if (req.method === "GET" && path === "/rest/v1/bot_execution_paper_positions") {
      return reply(res, 200, []);
    }
    if (req.method === "POST" && path === "/rest/v1/rpc/senfx_paper_worker_sync") {
      assert.equal(body.p_run_id, runId);
      state.commands.push(body.p_report);
      state.observed = state.desired === "running" ? body.p_report : state.desired;
      return reply(res, 200, {
        owned: true, runId, botId: "22222222-2222-4222-8222-222222222222",
        customerId: "33333333-3333-4333-8333-333333333333",
        botName: "SENFX Synthetic Pro", botMarket: "Synthetic Indices",
        isPublished: true, desiredState: state.desired,
        observedState: state.observed, version: 1, leaseSeconds: 20,
      });
    }
    if (req.method === "POST" && path === "/rest/v1/rpc/senfx_paper_worker_reserve") {
      return reply(res, 200, { allowed: false, reason: "Test risk gate closed" });
    }
    state.unknown.push(req.method + " " + path);
    return reply(res, 404, { error: "Unknown endpoint" });
  });

  const waitFor = async (label, predicate, ms = 9_000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (predicate()) return;
      if (child?.exitCode !== null) throw Error(label + ": child exited: " + output);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error("Timed out " + label + ". " + JSON.stringify(state) + "\n" + output);
  };
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");
    child = spawn(process.execPath, [
      "--experimental-strip-types", "--import",
      "./tests/fixtures/paper-worker-fake-feed.mjs",
      "worker/senfx-customer-paper-worker.mjs"
    ], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH || "", HOME: process.env.HOME || "",
        NODE_ENV: "test", SENFX_PAPER_WORKER_ENABLED: "true",
        SUPABASE_URL: "http://127.0.0.1:" + address.port,
        SUPABASE_SERVICE_ROLE_KEY: "only-local-test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", s => { output = (output + s).slice(-12_000); });
    child.stderr.on("data", s => { output = (output + s).slice(-12_000); });

    await waitFor("two empty database polls", () => state.polls >= 2);
    assert.doesNotMatch(output, /connected to PUBLIC market feed/,
      "No unused public connection should be opened while all runs are inactive");
    state.desired = "running";
    await waitFor("on-demand public feed connection", () =>
      output.includes("connected to PUBLIC market feed"), 10_000);
    assert.ok(state.commands.includes("starting"));
    state.desired = "stopped";
    await waitFor("Stop acknowledged", () => state.observed === "stopped", 9_000);
    const connectionsAtStop = output.match(/connected to PUBLIC market feed/g)?.length || 0;
    await new Promise(resolve => setTimeout(resolve, 4_500));
    assert.equal(output.match(/connected to PUBLIC market feed/g)?.length || 0, connectionsAtStop,
      "A stopped session must not reopen an idle market feed");
    assert.deepEqual(state.unknown, [], "Unexpected API request from paper-only worker");
    assert.doesNotMatch(output, /broker order placed|real-money order/i);
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 1500))]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
});
