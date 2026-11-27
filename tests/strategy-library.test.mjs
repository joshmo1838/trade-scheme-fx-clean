import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {STRATEGY_LIBRARY,STRATEGY_LIBRARY_COUNT,STRATEGY_LIBRARY_POLICY} from '../lib/quantum/strategy-library.mjs';

test('the added research library contains exactly 100 distinct, fully specified candidates',()=>{
  assert.equal(STRATEGY_LIBRARY_COUNT,100);
  assert.equal(STRATEGY_LIBRARY.length,100);
  for(const key of ['id','name','entryRule']){
    assert.equal(new Set(STRATEGY_LIBRARY.map(x=>x[key])).size,100, key+' values must be unique');
  }
  assert.equal(new Set(STRATEGY_LIBRARY.map(x=>x.category)).size,5);
  assert.ok(STRATEGY_LIBRARY.every(x=>
    x.supportedMarkets.length===5&&x.durationTicks>0&&x.contractType&&x.exitRule&&
    x.invalidationRule&&x.requiredInputs.length>0&&x.evidence&&x.status==='RESEARCH_ONLY'&&
    x.validated===false&&x.executionEnabled===false
  ));
  assert.deepEqual(STRATEGY_LIBRARY_POLICY,{
    demoExecutionEnabled:false,realMoneyExecutionEnabled:false,researchOnly:true,modifiesExistingStrategies:false
  });
});

test('the research library stays separate from the existing 16 executable workspace references',async()=>{
  const existing=await import('../lib/quantum/strategy-catalog.mjs');
  assert.equal(existing.STRATEGIES.length,16);
  const source=await readFile(new URL('../app/strategy-library/StrategyLibrary.tsx',import.meta.url),'utf8');
  assert.match(source,/RESEARCH ONLY/);
  assert.match(source,/execution disabled/);
  assert.doesNotMatch(source,/RUN AI BOT|href=.*builder|placeOrder|buyContract/i);
  const evaluator=await readFile(new URL('../lib/quantum/research.ts',import.meta.url),'utf8');
  assert.doesNotMatch(evaluator,/strategy-library/);
});
