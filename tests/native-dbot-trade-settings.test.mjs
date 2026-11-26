import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const native = readFileSync(new URL('app/builder/NativeDerivBuilder.tsx', root), 'utf8');
const controls = readFileSync(new URL('app/builder/NativeDerivTradeSettings.tsx', root), 'utf8');

test('selected DBot renders per-bot trade settings without replacing native editor', () => {
  assert.match(native, /NativeDerivTradeSettings botId=\{selectedBot\}/);
  assert.match(native, /<iframe/);
  assert.match(native, /STRATEGIES\.some/);
  assert.match(native, /FIFTEEN_BOTS\.some/);
});

test('draft fields are per-bot, and cannot be mistaken for executed risk limits', () => {
  for (const value of ['stake', 'stopLoss', 'takeProfit']) {
    assert.match(controls, new RegExp('key: "' + value + '"'));
  }
  assert.match(controls, /localStorage\.setItem/);
  assert.match(controls, /tsfx-dbot-trade-draft-v1:\$\{botId\}/);
  assert.match(controls, /NOT connected to Deriv/);
  assert.match(controls, /NOT connected to Deriv,[\s\S]*monitored,[\s\S]*enforced/);
  assert.doesNotMatch(controls, /\/api\/deriv\/demo\/bots\/control|\bproposal_buy\b|\bpurchase\(/);
});

test('invalid and absent bot selections do not save a trading draft', () => {
  assert.match(controls, /if \(!botId\)/);
  assert.match(controls, /fields\.find\(field => !validAmount/);
  assert.match(controls, /disabled=\{!botId\}/);
});
