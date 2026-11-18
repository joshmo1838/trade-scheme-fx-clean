/**
 * Three-market, completely hermetic public-tick fixture for the real worker.
 * No Deriv socket or credentials. A market is active only after subscription.
 * Virtual clock advances one second per batch; worker polling is accelerated
 * to keep lease freshness deterministic without touching production.
 */
const RealDate = globalThis.Date;
let virtualMs = RealDate.now();
class Clock extends RealDate {
  constructor(...args) { if (args.length === 0) super(virtualMs); else super(...args); }
  static now() { return virtualMs; }
}
globalThis.Date = Clock;
const regularSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms, ...args) =>
  regularSetInterval(fn, ms === 4_000 ? 220 : ms, ...args);

class FleetFeed extends EventTarget {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  readyState = FleetFeed.CONNECTING;
  #active = new Set();
  #timer = null;
  #tick = 0;
  constructor(url) {
    super();
    if (url !== "wss://api.derivws.com/trading/v1/options/ws/public") {
      throw Error("Fleet fixture refuses non-public WebSocket");
    }
    setTimeout(() => {
      if (this.readyState !== FleetFeed.CONNECTING) return;
      this.readyState = FleetFeed.OPEN;
      this.dispatchEvent(new Event("open"));
    }, 10);
  }
  send(payload) {
    const request = JSON.parse(String(payload));
    if (request.subscribe !== 1 ||
        !["R_100","R_50","R_75"].includes(request.ticks)) {
      throw Error("Unapproved fleet public subscription");
    }
    this.#active.add(request.ticks);
    if (this.#timer) return;
    this.#timer = regularSetInterval(() => {
      if (this.readyState !== FleetFeed.OPEN) return;
      virtualMs += 1_000;
      this.#tick++;
      for (const market of this.#active) {
        const multiplier = market === "R_100" ? 0.28 :
          market === "R_50" ? 0.32 : 0.40;
        this.dispatchEvent(new MessageEvent("message", {
          data: JSON.stringify({
            msg_type: "tick",
            tick: {
              symbol: market,
              quote: 100 + this.#tick * multiplier,
              epoch: Math.floor(virtualMs / 1_000) - 1
            }
          })
        }));
      }
    }, 48);
  }
  close() {
    if (this.readyState === FleetFeed.CLOSED) return;
    this.readyState = FleetFeed.CLOSED;
    if (this.#timer) clearInterval(this.#timer);
    this.dispatchEvent(new Event("close"));
  }
}
globalThis.WebSocket = FleetFeed;
