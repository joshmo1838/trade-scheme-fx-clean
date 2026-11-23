/** Read-only, per-subscription cleanup for shared Deriv market feeds.
 * Avoid forget_all: it could disrupt other consumers sharing the connection.
 * https://developers.deriv.com/llms/forget.md
 */
export function createDerivForgetRequest(subscriptionId, reqId) {
  if (typeof subscriptionId !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(subscriptionId)) {
    throw new TypeError('Invalid Deriv subscription ID');
  }
  if (reqId !== undefined && (!Number.isSafeInteger(reqId) || reqId < 1)) {
    throw new RangeError('reqId must be a positive safe integer');
  }
  return reqId === undefined ? { forget: subscriptionId } : { forget: subscriptionId, req_id: reqId };
}
