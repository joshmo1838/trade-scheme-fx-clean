/**
 * Build a read-only Deriv ticks subscription request.
 * Official schema: https://developers.deriv.com/llms/ticks.md
 * This does not open a socket or authorize broker trading.
 */
export function createDerivTickSubscription(symbol, reqId) {
  if (typeof symbol !== "string" || !/^[A-Za-z0-9_]{2,30}$/.test(symbol)) {
    throw new TypeError("Invalid Deriv market symbol");
  }
  if (reqId !== undefined && (!Number.isSafeInteger(reqId) || reqId < 1)) {
    throw new RangeError("reqId must be a positive safe integer");
  }
  return reqId === undefined
    ? { ticks: symbol, subscribe: 1 }
    : { ticks: symbol, subscribe: 1, req_id: reqId };
}
