import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubscriptionOwnershipRegistry } from '../lib/deriv/subscription-ownership.mjs';
const id = 'abcDEF0123456789abcDEF0123456789';
test('shared subscription cancels only after last owner leaves', () => {
  const registry = createSubscriptionOwnershipRegistry();
  assert.equal(registry.acquire(id, 'bot-1'), 1);
  assert.equal(registry.acquire(id, 'bot-1'), 1);
  assert.equal(registry.acquire(id, 'bot-2'), 2);
  assert.equal(registry.release(id, 'bot-1', 5), null);
  assert.equal(registry.release(id, 'unknown', 6), null);
  assert.deepEqual(registry.release(id, 'bot-2', 7), { forget: id, req_id: 7 });
  assert.equal(registry.release(id, 'bot-2', 8), null);
});
test('disconnect invalidates subscription ownership and prevents stale cancellation', () => {
  const registry = createSubscriptionOwnershipRegistry();
  registry.acquire(id, 'bot-1');
  registry.clearOnDisconnect();
  assert.equal(registry.ownerCount(id), 0);
  assert.equal(registry.release(id, 'bot-1'), null);
});
test('invalid subscription identifiers and owners fail closed', () => {
  const registry = createSubscriptionOwnershipRegistry();
  assert.throws(() => registry.acquire('bad', 'bot-1'), TypeError);
  assert.throws(() => registry.acquire(id, ''), TypeError);
  assert.throws(() => registry.release(id, '', 2), TypeError);
  assert.throws(() => registry.release(id, 'bot-1', -1), RangeError);
});

test('independent subscriptions cannot cancel each other and duplicate release is inert', () => {
  const registry = createSubscriptionOwnershipRegistry();
  const other = '1234567890abcdef1234567890abcdef';
  registry.acquire(id, 'bot-1');
  registry.acquire(id, 'bot-2');
  registry.acquire(other, 'bot-1');
  assert.deepEqual(registry.release(other, 'bot-1', 11), { forget: other, req_id: 11 });
  assert.equal(registry.ownerCount(id), 2);
  assert.equal(registry.release(other, 'bot-1', 12), null);
  assert.equal(registry.release(id, 'bot-1', 13), null);
  assert.equal(registry.ownerCount(id), 1);
  assert.deepEqual(registry.release(id, 'bot-2', 14), { forget: id, req_id: 14 });
});
