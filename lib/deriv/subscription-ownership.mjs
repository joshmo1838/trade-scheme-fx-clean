import { createDerivForgetRequest } from './subscription-cleanup.mjs';

/** Connection-local reference counting. No broker calls are made by this module.
 * Each connection must own its own registry; never reuse across reconnects.
 */
export function createSubscriptionOwnershipRegistry() {
  const subscriptions = new Map();
  const validOwner = (owner) => typeof owner === 'string' && owner.length > 0 && owner.length <= 128;
  return Object.freeze({
    acquire(subscriptionId, owner) {
      createDerivForgetRequest(subscriptionId);
      if (!validOwner(owner)) throw new TypeError('Invalid subscription owner');
      const owners = subscriptions.get(subscriptionId) ?? new Set();
      owners.add(owner);
      subscriptions.set(subscriptionId, owners);
      return owners.size;
    },
    release(subscriptionId, owner, reqId) {
      createDerivForgetRequest(subscriptionId, reqId);
      if (!validOwner(owner)) throw new TypeError('Invalid subscription owner');
      const owners = subscriptions.get(subscriptionId);
      if (!owners?.has(owner)) return null; // Unknown owners cannot cancel a shared feed.
      owners.delete(owner);
      if (owners.size) return null;
      subscriptions.delete(subscriptionId);
      return createDerivForgetRequest(subscriptionId, reqId);
    },
    ownerCount(subscriptionId) {
      return subscriptions.get(subscriptionId)?.size ?? 0;
    },
    clearOnDisconnect() {
      subscriptions.clear(); // Never send stale forget requests to a new socket.
    },
  });
}
