/**
 * Purely offline public-tick substitute. No Deriv credentials or outbound
 * network access. The worker is exercised as a real child process.
 */
if (process.env.SENFX_QA_OFFLINE !== "yes") {
  throw Error("Offline public market feed is only for tests.");
}
globalThis.fetch = () => {
  throw Error("Network is forbidden in offline worker QA.");
};
const nativeSetInterval = globalThis.setInterval;
// Shorten only the paper worker's 4-second poll in the isolated child.
globalThis.setInterval = (callback, period, ...args) =>
  nativeSetInterval(callback, period === 4_000 ? 240 : period, ...args);

class OfflinePublicWebSocket {
  static OPEN = 1;
  constructor(url) {
    if (url !== "wss://api.derivws.com/trading/v1/options/ws/public") {
      throw Error("Non-public market-data WebSocket attempted");
    }
    this.readyState = 0;
    this.listeners = new Map();
    this.interval = null;
    setTimeout(() => {
      this.readyState = OfflinePublicWebSocket.OPEN;
      this.emit("open", {});
    }, 12);
  }
  addEventListener(name, callback) {
    const handlers = this.listeners.get(name) || [];
    handlers.push(callback);
    this.listeners.set(name, handlers);
  }
  emit(name, event) {
    for (const callback of this.listeners.get(name) || []) callback(event);
  }
  send(raw) {
    const req = JSON.parse(raw);
    if (req.ticks !== "R_100" || req.subscribe !== 1 || this.interval) {
      throw Error("Worker attempted an unexpected market feed or request.");
    }
    const base = Math.floor(Date.now() / 1_000) - 20;
    let n = 0;
    this.interval = setInterval(() => {
      n++;
      if (n > 49) {
        clearInterval(this.interval);
        this.interval = null;
        return;
      }
      this.emit("message", {
        data: JSON.stringify({
          msg_type: "tick",
          tick: { symbol: "R_100", quote: 100 + n * 0.75, epoch: base + n },
        }),
      });
    }, 45);
  }
  close() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.readyState = 3;
    this.emit("close", {});
  }
}
globalThis.WebSocket = OfflinePublicWebSocket;
