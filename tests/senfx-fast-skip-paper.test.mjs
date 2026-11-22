import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePaperEntry } from '../lib/senfx-fast-skip-paper.mjs';
const good = { startedAtMs: 1000, payoutAcceptable: true, riskChecksPassed: true, goldenRulePassed: true };
test('eligible research candidate is not a broker order', () => assert.equal(evaluatePaperEntry(good, 2000).action, 'PAPER_CANDIDATE'));
for (const [name, patch] of Object.entries({negativeSignal:{negativeSignal:true},weakSignal:{weakSignal:true},conflict:{conflictingIndicators:true},stale:{staleTick:true},duplicate:{duplicateTick:true},emergency:{emergencyStop:true},exposure:{exposureExceeded:true},badPayout:{payoutAcceptable:false},failedRule:{goldenRulePassed:false}})) {
 test('skip '+name, () => assert.equal(evaluatePaperEntry({...good,...patch},2000).action,'SKIP'));
}
test('skip after 15 seconds', () => assert.deepEqual(evaluatePaperEntry(good,16000),{action:'SKIP',reason:'TIMEOUT'}));
test('60-second baseline still available for comparison', () => assert.equal(evaluatePaperEntry(good,16000,60000).action,'PAPER_CANDIDATE'));
test('reject invalid timestamps', () => assert.equal(evaluatePaperEntry({...good,startedAtMs:NaN},2000).action,'SKIP'));
