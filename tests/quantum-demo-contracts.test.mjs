import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STRATEGIES } from '../lib/quantum/strategy-catalog.mjs';
import { mapQuantumDemoSignal, quantumDemoContracts } from '../lib/quantum/demo-contracts.mjs';

test('Demo mappings cover precisely the current strategy catalog', () => {
  assert.deepEqual(Object.keys(quantumDemoContracts), STRATEGIES.map(({ id }) => id));
  assert.equal(mapQuantumDemoSignal('trend-rise-fall', { kind: 'RISE' }), null);
  assert.equal(mapQuantumDemoSignal('__proto__', { kind: 'RISE' }), null);
  for (const { id } of STRATEGIES) {
    assert.equal(mapQuantumDemoSignal(id, { kind: 'SKIP' }), null);
  }
});

test('signals preserve direction, parity and dynamic digit barriers', () => {
  const cases = [
    ['nexus-flow', { kind: 'RISE' }, 'CALL'],
    ['nexus-flow', { kind: 'FALL' }, 'PUT'],
    ['regent-parity', { kind: 'EVEN' }, 'DIGITEVEN'],
    ['regent-parity', { kind: 'ODD' }, 'DIGITODD'],
    ['cadence-sequence', { kind: 'MATCH', barrier: 0 }, 'DIGITMATCH'],
    ['vertex-digits', { kind: 'DIFFER', barrier: 9 }, 'DIGITDIFF'],
  ];
  for (const [id, signal, contract_type] of cases) {
    assert.deepEqual(mapQuantumDemoSignal(id, signal), {
      contract_type,
      duration: 1,
      duration_unit: 't',
      ...(signal.barrier !== undefined ? { barrier: String(signal.barrier) } : {}),
    });
  }
  assert.equal(mapQuantumDemoSignal('nexus-flow', { kind: 'MATCH', barrier: 4 }), null);
  assert.equal(mapQuantumDemoSignal('cadence-sequence', { kind: 'MATCH', barrier: 10 }), null);
  assert.equal(mapQuantumDemoSignal('vertex-digits', { kind: 'DIFFER' }), null);
  assert.equal(mapQuantumDemoSignal('regent-parity', { kind: 'ODD', barrier: 4 }), null);
});
