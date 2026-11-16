/**
 * SENFX R_100 continuous forward paper-test worker.
 * Runs as a single persistent Node process (Railway worker service).
 * No Deriv account token, customer funds, or order execution is used.
 */
import WebSocket from "ws";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DERIV_WS_URL = process.env.DERIV_PUBLIC_WS_URL || "wss://api.derivws.com/trading/v1/options/ws/public";
const MARKET = "R_100";
const TARGET_TRADES = 200;
const RUN_ID = process.env.SENFX_FORWARD_RUN_ID || "r100-strict-v1";
const HEARTBEAT_MS = 30_000;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function db(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

const avg = (values) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let value = avg(values.slice(0, period));
  for (let i = period; i < values.length; i++) value = values[i] * k + value * (1 - k);
  return value;
}
function rsi(values) {
  if (values.length < 15) return null;
  let gain = 0, loss = 0;
  for (let i = values.length - 14; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    gain += Math.max(0, change);
    loss += Math.max(0, -change);
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / 14 / (loss / 14));
}
function atr(bars, period = 14) {
  if (bars.length < period + 1) return null;
  const ranges = [];
  for (let i = bars.length - period; i < bars.length; i++) {
    const previous = bars[i - 1].close;
    ranges.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - previous), Math.abs(bars[i].low - previous)));
  }
  return avg(ranges);
}
// Same simplified ADX-like directional-strength calculation as the Strategy Lab UI.
function adx(bars, period = 14) {
  if (bars.length < period + 1) return null;
  let plus = 0, minus = 0, trueRange = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plus += up > down && up > 0 ? up : 0;
    minus += down > up && down > 0 ? down : 0;
    trueRange += Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
  }
  if (trueRange === 0) return 0;
  const p = 100 * plus / trueRange, m = 100 * minus / trueRange;
  return p + m === 0 ? 0 : 100 * Math.abs(p - m) / (p + m);
}
function getSignal(bars) {
  if (bars.length < 55) return null;
  const closes = bars.map((bar) => bar.close);
  const fast = ema(closes, 9), medium = ema(closes, 21), slow = ema(closes, 50);
  const momentum = rsi(closes), strength = adx(bars), volatility = atr(bars);
  if ([fast, medium, slow, momentum, strength, volatility].some((value) => value === null)) return null;
  const last = bars.at(-1), previous = bars.at(-2), prior = bars.at(-3);
  const calm = volatility / last.close < 0.004;
  const bullish = fast > medium && medium > slow && last.close > fast &&
    last.close > previous.close && previous.close >= prior.close &&
    momentum >= 52 && momentum <= 67 && strength >= 23 && calm;
  const bearish = fast < medium && medium < slow && last.close < fast &&
    last.close < previous.close && previous.close <= prior.close &&
    momentum >= 33 && momentum <= 48 && strength >= 23 && calm;
  return bullish ? "CALL" : bearish ? "PUT" : null;
}

let socket;
let reconnectTimer;
let reconnectDelay = 1000;
let stopped = false;
let state = {
  bars: [],
  currentMinute: null,
  pending: null,
  completedTrades: 0,
  wins: 0,
  losses: 0,
  lastProcessedEpoch: 0,
};
let heartbeatTimer;

async function saveState() {
  const rows = await db(`senfx_forward_runs?run_id=eq.${encodeURIComponent(RUN_ID)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      market_symbol: MARKET,
      target_trades: TARGET_TRADES,
      status: state.completedTrades >= TARGET_TRADES ? "completed" : "running",
      state,
      updated_at: new Date().toISOString(),
    }),
  });
  return rows;
}
async function persistTrade(trade) {
  await db("senfx_forward_trades?on_conflict=run_id,signal_epoch", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      run_id: RUN_ID,
      market_symbol: MARKET,
      direction: trade.side,
      entry_price: trade.entry,
      exit_price: trade.exit,
      pnl_r: trade.pnl,
      outcome: trade.outcome,
      signal_epoch: trade.signalEpoch,
      opened_at: new Date(trade.signalEpoch * 1000).toISOString(),
      closed_at: new Date(trade.closedEpoch * 1000).toISOString(),
    }),
  });
}
async function loadState() {
  const rows = await db(`senfx_forward_runs?run_id=eq.${encodeURIComponent(RUN_ID)}&select=state,status&limit=1`);
  if (rows?.[0]?.state) state = { ...state, ...rows[0].state };
  if (!Array.isArray(state.bars)) state.bars = [];
  console.log(`Restored ${state.completedTrades} / ${TARGET_TRADES} completed trades`);
}
async function ensureRun() {
  await db("senfx_forward_runs?on_conflict=run_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ run_id: RUN_ID, market_symbol: MARKET, target_trades: TARGET_TRADES, status: "starting", state }),
  });
}
function handleCompletedBar(bar) {
  if (!bar || bar.epoch <= state.lastProcessedEpoch) return;
  state.lastProcessedEpoch = bar.epoch;
  state.bars.push({ open: bar.open, high: bar.high, low: bar.low, close: bar.close, time: new Date(bar.epoch * 1000).toISOString(), epoch: bar.epoch });
  if (state.bars.length > 400) state.bars.shift();

  if (state.pending) {
    state.pending.left -= 1;
    if (state.pending.left <= 0) {
      const pending = state.pending;
      state.pending = null;
      const won = pending.side === "CALL" ? bar.close > pending.entry : bar.close < pending.entry;
      const trade = {
        side: pending.side, entry: pending.entry, exit: bar.close,
        pnl: won ? 1 : -1, outcome: won ? "WIN" : "LOSS",
        signalEpoch: pending.signalEpoch, closedEpoch: bar.epoch,
      };
      state.completedTrades += 1;
      if (won) state.wins += 1; else state.losses += 1;
      // Persist first; a restart will recover the same state/trade from the database.
      void persistTrade(trade).then(() => saveState()).then(() => {
        console.log(`Trade ${state.completedTrades}/${TARGET_TRADES}: ${trade.outcome} ${trade.side}`);
        if (state.completedTrades >= TARGET_TRADES) {
          console.log("200-trade forward paper test completed. Disconnecting feed.");
          stopped = true;
          socket?.close();
        }
      }).catch((error) => console.error("Trade persistence failed:", error));
      return;
    }
  } else if (state.completedTrades < TARGET_TRADES && state.bars.length >= 55) {
    const side = getSignal(state.bars);
    if (side) state.pending = { side, entry: bar.close, left: 5, signalEpoch: bar.epoch };
  }
  void saveState().catch((error) => console.error("State save failed:", error));
}
function connect() {
  if (stopped) return;
  console.log("Connecting to Deriv public R_100 feed…");
  socket = new WebSocket(DERIV_WS_URL);
  socket.on("open", () => {
    reconnectDelay = 1000;
    console.log("Connected; subscribing to R_100 ticks and one-minute candle history.");
    socket.send(JSON.stringify({ ticks: MARKET, subscribe: 1 }));
    socket.send(JSON.stringify({
      ticks_history: MARKET, end: "latest", count: 500,
      style: "candles", granularity: 60, req_id: 81001,
    }));
  });
  socket.on("message", (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.error) {
      console.error("Deriv feed error:", message.error.message || message.error.code);
      return;
    }
    if (message.msg_type === "candles" && message.req_id === 81001) {
      const now = Math.floor(Date.now() / 1000);
      const history = (message.candles || [])
        .map((candle) => ({
          epoch: Number(candle.epoch), open: Number(candle.open), high: Number(candle.high),
          low: Number(candle.low), close: Number(candle.close),
        }))
        .filter((candle) => Number.isFinite(candle.epoch) && candle.epoch + 60 <= now &&
          [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite))
        .sort((a, b) => a.epoch - b.epoch);
      for (const candle of history) {
        if (candle.epoch > state.lastProcessedEpoch) handleCompletedBar(candle);
      }
      return;
    }
    if (message.msg_type !== "tick" || !message.tick) return;
    const price = Number(message.tick.quote), epoch = Number(message.tick.epoch);
    if (!Number.isFinite(price) || !Number.isFinite(epoch)) return;
    const minuteEpoch = Math.floor(epoch / 60) * 60;
    if (!state.currentMinute || minuteEpoch > state.currentMinute.epoch) {
      if (state.currentMinute) handleCompletedBar(state.currentMinute);
      state.currentMinute = { epoch: minuteEpoch, open: price, high: price, low: price, close: price };
      return;
    }
    if (minuteEpoch === state.currentMinute.epoch) {
      state.currentMinute.high = Math.max(state.currentMinute.high, price);
      state.currentMinute.low = Math.min(state.currentMinute.low, price);
      state.currentMinute.close = price;
    }
  });
  socket.on("error", (error) => console.error("Deriv WebSocket error:", error.message));
  socket.on("close", () => {
    if (stopped) return;
    console.warn(`Feed disconnected. Reconnecting in ${Math.round(reconnectDelay / 1000)}s.`);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(30_000, reconnectDelay * 2);
  });
}

async function main() {
  await ensureRun();
  await loadState();
  if (state.completedTrades >= TARGET_TRADES) {
    console.log("The 200-trade target has already been reached; worker will remain idle.");
    return;
  }
  heartbeatTimer = setInterval(() => {
    void saveState().catch((error) => console.error("Heartbeat persistence failed:", error));
  }, HEARTBEAT_MS);
  connect();
}
process.on("SIGTERM", () => {
  stopped = true;
  clearInterval(heartbeatTimer);
  clearTimeout(reconnectTimer);
  socket?.close();
  console.log("Worker shutting down; latest state was persisted on each completed candle.");
});
process.on("SIGINT", () => {
  stopped = true;
  clearInterval(heartbeatTimer);
  clearTimeout(reconnectTimer);
  socket?.close();
  process.exit(0);
});
main().catch((error) => { console.error(error); process.exit(1); });
