import test from 'node:test';
import assert from 'node:assert/strict';
import { createDerivForgetRequest } from '../lib/deriv/subscription-cleanup.mjs';
const id = 'abcDEF0123456789abcDEF0123456789';
test('targets one subscription without disconnecting other bot consumers', () => {
  assert.deepEqual(createDerivForgetRequest(id), { forget: id });
  assert.deepEqual(createDerivForgetRequest(id, 42), { forget: id, req_id: 42 });
  assert.equal('forget_all' in createDerivForgetRequest(id), false);
});
test('rejects malformed subscription IDs and request IDs', () => {
  for (const bad of ['', 'short', ' '.repeat(32), '../'.repeat(12), null, 'x'.repeat(129)]) {
    assert.throws(() => createDerivForgetRequest(bad), TypeError);
  }
  for (const bad of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2']) {
    assert.throws(() => createDerivForgetRequest(id, bad), RangeError);
  }
});
