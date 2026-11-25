import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearchDistributor} from '../worker/quantum-ai/distribute.mjs';
import {FIFTEEN_BOTS} from '../lib/bots/fifteen-paper-bots.ts';
const now=1800000000000;
const ticks=Array.from({length:300},(_,i)=>({epoch:now/1000-299+i,quote:100+i/100,pip_size:2,digit:i%10}));
const scan={probabilities:Array(10).fill(.1)};
test('original fifteen, no execution, no early refresh',()=>{
 const distribute=createResearchDistributor();
 const results=[...new Set(FIFTEEN_BOTS.map(b=>b.market))].flatMap(s=>distribute(s,ticks,scan,now));
 assert.equal(results.length,15);
 assert.equal(new Set(results.map(r=>r.botId)).size,15);
 assert.ok(results.every(r=>r.decision==='SKIP'&&!r.executionAuthorized));
 assert.equal(distribute('R_100',ticks,scan,now+29999),null);
 assert.ok(distribute('R_100',ticks,scan,now+30000).every(r=>r.signal===null));
});
test('direction is never inferred from digits and insufficient history skips',()=>{
 const d=createResearchDistributor();
 assert.ok(d('R_75',ticks,scan,now).every(r=>r.estimate===null));
 assert.ok(d('R_100',ticks.slice(1),scan,now).every(r=>r.signal===null));
});
