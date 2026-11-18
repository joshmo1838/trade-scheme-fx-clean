/**
 * Intentionally fake PostgREST/Supabase adapter for local worker orchestration
 * testing. NEVER import in production or connect to real databases.
 */
if (process.env.SENFX_QA_OFFLINE !== "yes") {
  throw new Error("QA mock Supabase cannot run outside isolated tests.");
}

const runId = "11111111-1111-4111-8111-111111111111";
const botId = "22222222-2222-4222-8222-222222222222";
const customerId = "33333333-3333-4333-8333-333333333333";
const state = {
  desired: "running", observed: "stopped", version: 1,
  position: null, worker: null, reservations: 0, settlements: 0,
  emitted: new Set(),
};
function report(event) {
  if (!state.emitted.has(event)) {
    state.emitted.add(event);
    console.log("SENFX_QA:" + event);
  }
}
function request(next, version, event) {
  if (state.version !== version - 1) {
    throw Error("Mock control revision was unexpectedly changed.");
  }
  state.desired = next;
  state.version = version;
  report(event);
}
class Query {
  constructor(table) { this.table = table; }
  select() { return this; }
  eq() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  then(resolve, reject) {
    let data;
    if (this.table === "bot_execution_runs") {
      data = [{
        id: runId, desired_state: state.desired,
        observed_state: state.observed, control_version: state.version,
      }];
    } else if (this.table === "bot_execution_paper_positions") {
      data = state.position
        ? [{ id: state.position.id, status: "open" }] : [];
    } else {
      return Promise.reject(Error("Unexpected table " + this.table)).then(resolve, reject);
    }
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  }
}
export function createClient(url, key) {
  if (url !== "https://qa-offline.invalid" || key !== "OFFLINE-TEST-ONLY") {
    throw Error("Offline QA refuses production credentials and endpoints.");
  }
  report("MOCK_DATABASE_CONNECTED");
  return {
    from(table) { return new Query(table); },
    async rpc(name, args) {
      if (name === "senfx_paper_worker_sync") {
        if (args.p_run_id !== runId) throw Error("Unexpected run");
        state.worker = args.p_worker_id;
        if (state.desired !== "running") {
          state.position = null; // emulate SQL's stop-safe cancellation
          state.observed = state.desired;
        } else {
          state.observed = args.p_report === "running" ? "running" : "starting";
        }
        if (state.observed === "running" && state.version === 1) {
          report("START_ACK");
        }
        if (state.observed === "paused" && state.version === 2) {
          report("PAUSE_ACK");
          setTimeout(() => request("running", 3, "RESUME_REQUEST"), 120);
        }
        if (state.observed === "running" && state.version === 3) {
          report("RESUME_ACK");
          setTimeout(() => request("stopped", 4, "STOP_REQUEST"), 120);
        }
        if (state.observed === "stopped" && state.version === 4) {
          report("STOP_ACK");
        }
        return {
          data: {
            owned: true, runId, customerId, botId, botName: "SENFX Synthetic Pro",
            botMarket: "Synthetic Indices", isPublished: true,
            desiredState: state.desired, observedState: state.observed,
            version: state.version, leaseSeconds: state.desired === "stopped" ? 0 : 20,
          }, error: null,
        };
      }
      if (name === "senfx_paper_worker_reserve") {
        const allowed = state.desired === "running" &&
          state.observed === "running" &&
          args.p_worker_id === state.worker &&
          args.p_version === state.version &&
          args.p_run_id === runId && state.position == null &&
          state.reservations === 0;
        if (!allowed) {
          return { data: { allowed: false, reason: "Daily paper limit reached." }, error: null };
        }
        state.reservations++;
        state.position = {
          id: "44444444-4444-4444-8444-444444444444",
          lastEpoch: args.p_tick_epoch, remaining: 5,
        };
        report("PAPER_RESERVE");
        return { data: { allowed: true, positionId: state.position.id }, error: null };
      }
      if (name === "senfx_paper_worker_tick") {
        const p = state.position;
        const allowed = p && state.desired === "running" &&
          state.observed === "running" &&
          args.p_worker_id === state.worker &&
          args.p_version === state.version;
        if (!allowed) {
          return { data: { accepted: false, reason: "Paper lease or command changed." }, error: null };
        }
        if (args.p_tick_epoch <= p.lastEpoch) {
          return { data: { accepted: true, duplicateTick: true, remainingTicks: p.remaining }, error: null };
        }
        p.lastEpoch = args.p_tick_epoch;
        p.remaining--;
        if (p.remaining > 0) {
          return { data: { accepted: true, settled: false, remainingTicks: p.remaining }, error: null };
        }
        state.position = null;
        state.settlements++;
        report("PAPER_SETTLED");
        setTimeout(() => request("paused", 2, "PAUSE_REQUEST"), 120);
        return { data: { accepted: true, settled: true, remainingTicks: 0 }, error: null };
      }
      throw Error("Unexpected or broker-trading RPC: " + name);
    },
  };
}
