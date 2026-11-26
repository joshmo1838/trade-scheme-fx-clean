import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url),'utf8');
const workspace=read('app/dashboard/v4/workspace.tsx');
const dbot=read('app/dashboard/v4/DBotToolWorkspace.tsx');
const styles=read('app/dashboard/v4/workspace.module.css');
const builder=read('app/builder/NativeDerivBuilder.tsx');
const catalog=read('app/dashboard/v4/QuantumBotCatalog.tsx');
const registry=read('app/dashboard/v4/registry.ts');

test('all four dashboard launch cards open internal DBot-style tool workspace',()=>{
  for(const name of ['Bulk Trader','Premium AI Bots','Speedbot','Manual Trader']){
    assert.ok(workspace.includes("'"+name+"'"),name+' tile missing');
    assert.ok(dbot.includes('"'+name+'"'),name+' workspace missing');
  }
  assert.match(workspace, /<DBotToolWorkspace module=\{tab\}\/>/);
  assert.match(dbot, /aria-label=\{module \+ " DBot-style workspace"\}/);
  assert.match(dbot, /Trade blocks/);
  assert.match(dbot, /Results/);
  assert.match(styles, /\.dbotLayout/);
  assert.match(styles, /@media\(max-width:680px\)\{\.dbotBar/);
});

test('existing three independent research tools remain available inside their workspaces',()=>{
  for(const path of ['/bulk-trader','/digit-tools','/manual-trader']) assert.ok(dbot.includes(path));
  assert.match(dbot, /<iframe title=\{module \+ " research tool"\}/);
  assert.match(dbot, /<Link href=\{tool.route\}>Open full tool<\/Link>/);
  assert.match(dbot, /No Deriv contract purchases/);
});

test('premium 4.0 bots still open the pinned official editor with draft-only risk settings',()=>{
  assert.match(dbot, /module==="Premium AI Bots"/);
  assert.match(dbot, /<QuantumBotCatalog\/>/);
  assert.match(catalog, /STRATEGIES\.map/);
  assert.match(builder, /STRATEGIES\.some\(strategy=>strategy.id===selected\)/);
  assert.match(builder, /NativeDerivTradeSettings botId=\{selectedBot\}/);
  assert.doesNotMatch(builder, /FIFTEEN_BOTS/);
  assert.doesNotMatch(registry, /original SENFX profiles/);
});

test('DBot-style layout cannot place orders or present draft values as enforced stops',()=>{
  assert.match(dbot,/RESEARCH · EXECUTION DISABLED/);
  assert.match(dbot,/Draft only · not enforced/);
  assert.match(dbot,/No trading instructions are created or executed here/);
  assert.doesNotMatch(dbot,/\bfetch\(|\bproposal_buy\b|\/api\/deriv\/demo\/bots\/control/);
});
