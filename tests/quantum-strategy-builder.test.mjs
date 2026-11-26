import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {STRATEGIES} from '../lib/quantum/strategy-catalog.mjs';
import {FIFTEEN_BOTS} from '../lib/bots/fifteen-paper-bots.ts';
import {FIFTEEN_DBOT_REFERENCES} from '../lib/bots/deriv-dbot-references.mjs';
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

test('all 15 original bot IDs and rules have a DBot reference without changing the source catalog',()=>{
  assert.equal(FIFTEEN_BOTS.length,15);
  assert.equal(new Set(FIFTEEN_BOTS.map(bot=>bot.id)).size,15);
  assert.equal(FIFTEEN_DBOT_REFERENCES.length,15);
  for(const bot of FIFTEEN_BOTS){
    const reference=FIFTEEN_DBOT_REFERENCES.find(item=>item.id===bot.id);
    assert.ok(reference,`Missing DBot reference for ${bot.id}`);
    assert.match(reference.rule,new RegExp(`Market: ${bot.market.replaceAll('_','\\_')}`));
    assert.match(reference.rule,/REFERENCE ONLY/);
    assert.match(reference.rule,/DBot Run remains disabled/);
  }
  assert.deepEqual(FIFTEEN_BOTS.map(bot=>bot.id),[
    'digit-over-4','digit-under-5','parity-even','parity-odd','digit-matches','digit-differs',
    'trend-rise-fall','breakout-higher-lower','recovery-audit','stepwise-audit','adaptive-over',
    'entropy-parity','pattern-differs','momentum-rise-fall','volatility-scalper',
  ]);
});

test('each selected bot keeps its rule visible in the official DBot trade-definition comment',()=>{
  const catalog=[...STRATEGIES,...FIFTEEN_DBOT_REFERENCES];
  const html=createStrategyBootstrap(catalog);
  const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source);
  assert.doesNotThrow(()=>new Function(source));
  assert.match(source,/senfx_strategy/);
  assert.match(source,/setCommentText/);
  assert.match(source,/getIcon\('comment'\)\?\.setBubbleVisible\(true\)/);
  assert.doesNotMatch(source,/getComment/);
  assert.doesNotMatch(source,/authorize|token/i);
  let rendered=0;
  let comment='';
  let commentVisible=false;
  const tradeParameters={
    type:'trade_definition',
    setCommentText:value=>{comment=value;},
    getIcon:type=>type==='comment'?{setBubbleVisible:value=>{commentVisible=value;}}:null,
  };
  const workspace={
    __senfxStrategyReference:null,
    getTopBlocks:()=>[tradeParameters],
    render:()=>rendered++,
  };
  const window={
    location:{search:'?senfx_strategy=digit-over-4'},
    Blockly:{
      derivWorkspace:workspace,
    },
  };
  runInNewContext(source,{window,URLSearchParams,console});
  assert.match(comment,/TRADE SCHEME FX BOT REFERENCE — SENFX Digit Over/);
  assert.match(comment,/Market: R_100/);
  assert.match(comment,/Predict OVER 4/);
  assert.match(comment,/DIGITOVER barrier 4/);
  assert.match(comment,/REFERENCE ONLY — not mapped to executable DBot purchase conditions/);
  assert.equal(commentVisible,true);
  assert.equal(rendered,1);
});

test('the 4.0 bot gallery and native editor route point at the same strategy IDs',async()=>{
  const [gallery,builder,build,originalCatalog]=await Promise.all([
    readFile(new URL('../app/dashboard/v4/QuantumBotCatalog.tsx',import.meta.url),'utf8'),
    readFile(new URL('../app/builder/NativeDerivBuilder.tsx',import.meta.url),'utf8'),
    readFile(new URL('../scripts/build-native-deriv-editor.mjs',import.meta.url),'utf8'),
    readFile(new URL('../app/bot-library/FifteenOriginalBotCatalog.tsx',import.meta.url),'utf8'),
  ]);
  assert.match(gallery,/STRATEGIES\.map/);
  assert.match(gallery,/strategyId=/);
  assert.match(builder,/senfx_strategy=/);
  assert.match(builder,/STRATEGIES\.some\(strategy=>strategy\.id===selected\)/);
  assert.doesNotMatch(builder,/FIFTEEN_BOTS/);
  assert.match(originalCatalog,/FIFTEEN_BOTS\.map/);
  assert.match(originalCatalog,/strategyId=/);
  assert.match(build,/createStrategyBootstrap\(\[\.\.\.STRATEGIES,\.\.\.FIFTEEN_DBOT_REFERENCES\]\)/);
});
