import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {STRATEGIES} from '../lib/quantum/strategy-catalog.mjs';
import {createStrategyBootstrap,createStrategyReferenceXml} from '../lib/quantum/strategy-builder-reference.mjs';

test('the DBot catalog is exactly the 16 current 4.0 research strategies',async()=>{
  const ids=new Set(STRATEGIES.map(strategy=>strategy.id));
  assert.equal(STRATEGIES.length,16);
  assert.equal(ids.size,16);
  assert.ok(STRATEGIES.every(strategy=>strategy.mode==='RESEARCH'&&!strategy.validated&&!strategy.executionEnabled));
  const research=await readFile(new URL('../lib/quantum/research.ts',import.meta.url),'utf8');
  assert.match(research,/const kinds:Signal\['kind'\]\[\]=\[/);
  assert.match(research,/return STRATEGIES\.map\(\(s,i\)=>\(\{bot:s\.name,kind:kinds\[i\]/);
  assert.deepEqual(STRATEGIES.map(strategy=>strategy.name),[
    'Nexus Flow','Volt Sprint','Apex Signal','Prism Range','Straddle Shift','Pulse Rhythm',
    'Vertex Digits','Quantum Edge AI','Sterling Edge','Meridian Pivot','Regent Parity',
    'Atlas Range','Windsor Continuity','Marlow Flow','Cadence Sequence','Monarch Echo',
  ]);
});

test('strategy references are labeled as research and safely escaped in native Blockly XML',()=>{
  const xml=createStrategyReferenceXml({id:'safe-id',name:'A <Bot> & Test',model:'MODEL',rule:'rule "quoted" & <shown>'});
  assert.match(xml,/A &lt;Bot&gt; &amp; Test/);
  assert.match(xml,/rule &quot;quoted&quot; &amp; &lt;shown&gt;/);
  assert.match(xml,/RESEARCH ONLY · NOT AN EXECUTABLE BOT/);
});

test('every 4.0 strategy keeps its rule visible on the native trade parameters block',()=>{
  const html=createStrategyBootstrap(STRATEGIES);
  const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source);
  for (const strategy of STRATEGIES) {
    let rendered=0;
    let comment='';
    let commentVisible=false;
    const tradeParameters={
      type:'trade_definition',
      getInput:()=>({connection:{connect:()=>{}}}),
      getBlocksInStatement:()=>[],
      setCommentText:value=>{comment=value;},
      getIcon:type=>type==='comment'?{setBubbleVisible:value=>{commentVisible=value;}}:null,
    };
    const strategyBlock={
      type:'tsfx_strategy_rule',
      previousConnection:{isConnected:()=>false,connect:()=>{}},
      setFieldValue:value=>{strategyBlock.value=value;},
      getFieldValue:()=>strategyBlock.value,
      setCommentText:()=>{},initSvg:()=>{},render:()=>{},
    };
    const workspace={
      getTopBlocks:()=>[tradeParameters],
      getAllBlocks:()=>[],
      newBlock:()=>strategyBlock,
      addChangeListener:()=>{},
      render:()=>rendered++,
    };
    const window={
      location:{search:new URLSearchParams({senfx_strategy:strategy.id}).toString()},
      Blockly:{derivWorkspace:workspace,FieldDropdown:function(){},Blocks:{},JavaScript:{javascriptGenerator:{forBlock:{}}},Events:{BLOCK_CHANGE:'change'}},
    };
    runInNewContext(source,{window,URLSearchParams});
    assert.equal(comment,`${strategy.name} — strategy rule\n${strategy.rule}\nThis rule runs through the Trade Scheme FX Demo worker.`);
    assert.equal(commentVisible,true);
    assert.equal(rendered,1);
  }
});

test('the 4.0 bot gallery and native editor route point at the same strategy IDs',async()=>{
  const [gallery,builder,build]=await Promise.all([
    readFile(new URL('../app/dashboard/v4/QuantumBotCatalog.tsx',import.meta.url),'utf8'),
    readFile(new URL('../app/builder/NativeDerivBuilder.tsx',import.meta.url),'utf8'),
    readFile(new URL('../scripts/build-native-deriv-editor.mjs',import.meta.url),'utf8'),
  ]);
  assert.match(gallery,/STRATEGIES\.map/);
  assert.match(gallery,/strategyId=/);
  assert.match(builder,/senfx_strategy=/);
  assert.match(build,/createStrategyBootstrap\(STRATEGIES\)/);
});
