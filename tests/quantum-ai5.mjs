import assert from 'node:assert/strict';import {DigitAI} from '../worker/quantum-ai/model.mjs';const a=new DigitAI();for(let i=0;i<1000;i++)assert(a.ingest({epoch:i+1,quote:100+i%10/10,pip_size:1}));const s=a.snapshot();assert.equal(s.window,300);assert.equal(s.observations,1000);assert.equal(s.scored,999);assert.equal(s.bots.length,16);assert(Math.abs(s.probabilities.reduce((a,b)=>a+b,0)-1)<1e-9);assert.equal(s.executionAuthorized,false);assert(!a.ingest({epoch:1000,quote:100,pip_size:1}));console.log('7 checks passed');

import {deepScan} from '../worker/quantum-ai/deep-scan.mjs';
const now=2000000;const raw=Array.from({length:900},(_,i)=>({epoch:202+i*2,digit:i%10}));const d=deepScan(raw,now);assert.equal(d.executionAuthorized,false);assert.equal(d.decision,'NO ENTRY');assert.equal(d.windows.length,8);assert(Math.abs(d.probabilities.reduce((s,v)=>s+v,0)-1)<1e-9);assert.equal(deepScan(raw,now+20000).reason,'Stale feed');assert.equal(deepScan([...raw,raw.at(-1)],now).windows[2].n,d.windows[2].n);assert(d.windows.every(w=>w.coverage>=0&&w.coverage<=1));console.log('7 additional Deep Scan checks passed');

import {AutoValidation} from '../worker/quantum-ai/auto-validation.mjs';
const av=new AutoValidation(),probs=[.19,.01,...Array(8).fill(.1)];
av.observe({epoch:100,digit:5},probs);
assert.deepEqual(av.snapshot().latest.candidates.map(c=>[c.contract,c.digit]),[['Matches',0],['Differs',1]]);
av.observe({epoch:100,digit:0},probs);assert.equal(av.snapshot().stats.Matches.n,0);
av.observe({epoch:102,digit:0},probs);assert.deepEqual(av.snapshot().stats,{Matches:{n:1,wins:1},Differs:{n:1,wins:1}});
av.observe({epoch:106,digit:1},probs);assert.equal(av.snapshot().stats.Matches.n,1);
av.observe({epoch:108,digit:1},Array(10).fill(.1));assert.equal(av.snapshot().stats.Differs.wins,1);assert.equal(av.snapshot().latest.candidates.length,0);
assert.equal(av.snapshot().executionAuthorized,false);
console.log('7 automatic validation checks passed');
