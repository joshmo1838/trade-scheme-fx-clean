import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { STRATEGIES } from '../lib/quantum/strategy-catalog.mjs';
import { quantumDemoContracts } from '../lib/quantum/demo-contracts.mjs';
import { contractAvailabilityReason } from '../lib/quantum/contract-availability.mjs';

const supported = type => [{ contract_type:type, expiry_type:'tick', min_contract_duration:'1', max_contract_duration:'10', last_digit_range:[0,1,2,3,4,5,6,7,8,9] }];

test('current 4.0 run catalog and all mapped contract types are enumerated', () => {
  assert.equal(STRATEGIES.length, 16);
  assert.deepEqual(Object.keys(quantumDemoContracts), STRATEGIES.map(({id})=>id));
  const types = new Set(Object.values(quantumDemoContracts).flatMap(Object.values));
  assert.deepEqual([...types].sort(), ['CALL','DIGITDIFF','DIGITEVEN','DIGITMATCH','DIGITODD','PUT'].sort());
  assert.equal(Object.hasOwn(quantumDemoContracts,'trend-rise-fall'), false);
});

test('availability accepts one tick only when Deriv confirms type and bounds', () => {
  for (const type of ['CALL','PUT','DIGITEVEN','DIGITODD','DIGITMATCH','DIGITDIFF']) {
    assert.equal(contractAvailabilityReason(supported(type), {contract_type:type,duration:1,duration_unit:'t'}), '');
    assert.match(contractAvailabilityReason(supported(type), {contract_type:type,duration:1,duration_unit:'m'}), /one-tick/);
  }
  assert.match(contractAvailabilityReason([], {contract_type:'CALL',duration:1,duration_unit:'t'}), /does not offer/);
  assert.match(contractAvailabilityReason(supported('CALL'), {contract_type:'PUT',duration:1,duration_unit:'t'}), /does not offer/);
  assert.match(contractAvailabilityReason([{...supported('CALL')[0],expiry_type:'intraday'}], {contract_type:'CALL',duration:1,duration_unit:'t'}), /tick expiry/);
  assert.match(contractAvailabilityReason([{...supported('CALL')[0],min_contract_duration:'2'}], {contract_type:'CALL',duration:1,duration_unit:'t'}), /duration/);
  assert.match(contractAvailabilityReason([{...supported('CALL')[0],max_contract_duration:'0'}], {contract_type:'CALL',duration:1,duration_unit:'t'}), /duration/);
});

test('digit contracts skip when Deriv has not confirmed the exact barrier or range', () => {
  for (let digit=0;digit<=9;digit++) {
    assert.equal(contractAvailabilityReason(supported('DIGITMATCH'), {contract_type:'DIGITMATCH',duration:1,duration_unit:'t',barrier:String(digit)}), '');
    assert.equal(contractAvailabilityReason(supported('DIGITDIFF'), {contract_type:'DIGITDIFF',duration:1,duration_unit:'t',barrier:String(digit)}), '');
  }
  assert.match(contractAvailabilityReason([{...supported('DIGITMATCH')[0],last_digit_range:[0,1,2,3,4,5,6,7,8]}], {contract_type:'DIGITMATCH',duration:1,duration_unit:'t',barrier:'9'}), /not confirmed/);
  assert.match(contractAvailabilityReason([{...supported('DIGITDIFF')[0],last_digit_range:[]}], {contract_type:'DIGITDIFF',duration:1,duration_unit:'t',barrier:'0'}), /not confirmed/);
});

test('worker, route and database migration bind Demo account, version, bot, stake, and session limits', () => {
  const worker=readFileSync(new URL('../worker/quantum-ai/demo-broker-worker.mjs',import.meta.url),'utf8');
  const route=readFileSync(new URL('../app/api/deriv/demo/v4/bots/control/route.ts',import.meta.url),'utf8');
  const migration=readFileSync(new URL('../supabase/senfx-quantum-demo-4-0.sql',import.meta.url),'utf8');
  assert.match(worker,/signals\(history\)\[index\]/);
  assert.match(worker,/contracts_for/);
  assert.match(worker,/quantum_demo_reserve/);
  assert.match(worker,/quantum_demo_mark_attempt/);
  assert.match(worker,/proposal_open_contract/);
  assert.match(worker,/neverRetryUnknown|reconcile/i);
  assert.match(route,/context\.account\.account_type!=='demo'/);
  assert.match(route,/sessionStopLoss/);
  assert.match(route,/sessionTakeProfit/);
  for (const id of STRATEGIES.map(x=>x.id)) assert.ok(migration.includes(`'${id}'`),`SQL catalog missing ${id}`);
  assert.match(migration,/pnl-o\.stake<=-r\.session_stop_loss/);
  assert.match(migration,/pnl>=r\.session_take_profit/);
  assert.match(migration,/UNRESOLVED_ORDER/);
});

test('all order reservations remain virtual USD and all execution flags fail closed by default', () => {
  const worker=readFileSync(new URL('../worker/quantum-ai/demo-broker-worker.mjs',import.meta.url),'utf8');
  const route=readFileSync(new URL('../app/api/deriv/demo/v4/bots/control/route.ts',import.meta.url),'utf8');
  const migration=readFileSync(new URL('../supabase/senfx-quantum-demo-4-0.sql',import.meta.url),'utf8');
  assert.match(worker,/\/ws\/demo/);
  assert.doesNotMatch(worker,/\/ws\/real/);
  assert.match(worker,/process\.env\[name\] === 'true'/);
  assert.match(route,/realMoneySupported:false/);
  assert.match(migration,/currency text not null default 'USD' check \(currency = 'USD'\)/);
  assert.match(migration,/grant execute .* to service_role/);
});
