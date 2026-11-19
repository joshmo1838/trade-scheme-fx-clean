/**
 * Test-process-only replacement for the public Deriv tick WebSocket.
 * Load with node --import only in hermetic CI. No external WebSocket is opened.
 * A virtual second passes for every synthetic tick, keeping contract-like
 * five-distinct-epoch paper settlement tests fast and deterministic.
 */
const outageAfterTicks = Number(process.env.SENFX_CI_FEED_OUTAGE_AFTER_TICKS || 0);
// Test-only opt-in: simulate a PUBLIC feed failure that persists across reconnects.
// No external network socket or third-party broker API is ever opened.
let feedPermanentlyDown = false;
const RealDate = globalThis.Date;
// Optional bounded speed/offset knobs for the REAL local PostgreSQL end-to-end
// test. The default fast feed is unchanged for previous hermetic tests.
const configuredDelay = Number(process.env.SENFX_CI_REAL_TICK_INTERVAL_MS || 35);
const configuredLag = Number(process.env.SENFX_CI_REAL_TICK_START_LAG_SECONDS || 0);
if (!Number.isInteger(configuredDelay) || configuredDelay < 20 ||
    configuredDelay > 2000 || !Number.isInteger(configuredLag) ||
    configuredLag < 0 || configuredLag > 20) {
  throw Error("Invalid test-only public tick timing parameters.");
}
let virtualMs = RealDate.now() - configuredLag*1000;

class VirtualDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(virtualMs);
    else super(...args);
  }
  static now() { return virtualMs; }
}
globalThis.Date = VirtualDate;

class SimulatedPublicWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = SimulatedPublicWebSocket.CONNECTING;
  #feed = null;
  #counter = 0;
  #market = null;

  constructor(url) {
    super();
    if (feedPermanentlyDown) {
      throw Error("Simulated PUBLIC market feed is permanently unavailable.");
    }
    const expected = "wss://api.derivws.com/trading/v1/options/ws/public";
    if (url !== expected) {
      throw Error("Hermetic worker attempted an unexpected WebSocket endpoint.");
    }
    setTimeout(() => {
      if (this.readyState === SimulatedPublicWebSocket.CONNECTING) {
        this.readyState = SimulatedPublicWebSocket.OPEN;
        this.dispatchEvent(new Event("open"));
      }
    }, 15);
  }

  send(raw) {
    if (this.readyState !== SimulatedPublicWebSocket.OPEN) {
      throw Error("Cannot send on a closed simulated socket.");
    }
    const request = JSON.parse(String(raw));
    if (request.ping === 1) return; // Deriv public keepalive; no market tick or contract.
    if (!request.subscribe || !request.ticks ||
        !["R_10","R_25","R_50","R_75","R_100","frxEURUSD"].includes(request.ticks)) {
      throw Error("Hermetic worker sent an unsupported public subscription.");
    }
    this.#market = request.ticks;
    if (this.#feed) return;
    this.#feed = setInterval(() => {
      if (this.readyState !== SimulatedPublicWebSocket.OPEN) return;
      virtualMs += 1000;
      this.#counter++;
      const tick = {
        msg_type: "tick",
        tick: {
          symbol: this.#market,
          quote: 100 + this.#counter * 0.1,
          epoch: Math.floor(virtualMs / 1000) - 1,
        },
      };
      this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(tick) }));
      if (Number.isSafeInteger(outageAfterTicks) && outageAfterTicks > 0 &&
          this.#counter >= outageAfterTicks) {
        feedPermanentlyDown = true;
        this.close();
      }
    }, configuredDelay);
  }

  close() {
    if (this.readyState === SimulatedPublicWebSocket.CLOSED) return;
    this.readyState = SimulatedPublicWebSocket.CLOSED;
    if (this.#feed) clearInterval(this.#feed);
    this.#feed = null;
    this.dispatchEvent(new Event("close"));
  }
}
globalThis.WebSocket = SimulatedPublicWebSocket;
