import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {STRATEGIES} from '../lib/quantum/strategy-catalog.mjs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('yesterday current 4.0 strategy definitions cannot be silently rewritten', () => {
  const source = read('lib/quantum/strategy-catalog.mjs');
  const gitBlobSha = createHash('sha1')
    .update('blob ' + Buffer.byteLength(source) + '\\0')
    .update(source)
    .digest('hex');
  assert.equal(gitBlobSha, 'f030c5182318ef075884ec088e99d052c5684158',
    'Strategy rules changed; an explicit strategy review is required before release');
  assert.equal(STRATEGIES.length, 16);
  assert.equal(new Set(STRATEGIES.map(item => item.id)).size, STRATEGIES.length);
  assert.equal(STRATEGIES.find(item => item.id === 'nexus-flow')?.rule,
    'After 300 valid ticks, predict the direction of EMA(10) minus EMA(30); skip a flat trend.');
  assert.ok(STRATEGIES.every(item => !item.executionEnabled && !item.validated && item.mode === 'RESEARCH'));
});

test('every current 4.0 bot opens shared trade settings without modifying its rule', () => {
  const gallery = read('app/dashboard/v4/QuantumBotCatalog.tsx');
  const builder = read('app/builder/NativeDerivBuilder.tsx');
  const panel = read('app/builder/NativeDerivTradeSettings.tsx');
  assert.match(gallery, /STRATEGIES\.map/);
  assert.match(gallery, /strategyId=\$\{encodeURIComponent\(strategy.id\)\}/);
  assert.match(builder, /STRATEGIES\.some\(strategy=>strategy.id===selected\)/);
  assert.match(builder, /<NativeDerivTradeSettings botId=\{selectedBot\}\/>/);
  for (const key of ['stake', 'stopLoss', 'takeProfit']) {
    assert.match(panel, new RegExp('key: "' + key + '"'));
  }
  assert.match(panel, /tsfx-dbot-trade-draft-v1:\$\{botId\}/);
  assert.match(panel, /NOT connected to Deriv/);
  assert.doesNotMatch(panel, /fetch\(|purchase\(|broker\/|\/api\/deriv/);
});

test('the retired catalog stays archived, never displayed as a current 4.0 bot', () => {
  const gallery = read('app/bot-library/CurrentBotLibrary.tsx');
  const workspace = read('app/dashboard/v4/workspace.tsx');
  const archived = read('lib/bots/fifteen-paper-bots.ts');
  assert.doesNotMatch(gallery, /FifteenOriginalBotCatalog|original SENFX profiles/);
  assert.doesNotMatch(workspace, /FifteenOriginalBotCatalog/);
  assert.ok(archived.includes('FIFTEEN_BOTS'), 'Retired source data must not be deleted');
});
