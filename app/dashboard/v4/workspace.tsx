'use client';

import Link from 'next/link';
import {useState} from 'react';
import type {CSSProperties} from 'react';
import FifteenDemoBotControlPanel from '@/app/bot-library/FifteenDemoBotControlPanel';
import FifteenDemoLiveAccountBar from '@/app/bot-library/FifteenDemoLiveAccountBar';
import QuantumLiveCharts from './QuantumLiveCharts';
import LiveCandleChart from '@/app/components/LiveCandleChart';
import {modules,moduleTargets,type WorkspaceModule} from './registry';
import styles from './workspace.module.css';

const themes:Record<string,{color:string;icon:string;description:string}>={
  'Bulk Trader':{color:'#22d3ee',icon:'▥',description:'Plan batch exposure'},
  'Premium AI Bots':{color:'#fbbf24',icon:'◇',description:'Original SENFX strategies'},
  Speedbot:{color:'#fb7185',icon:'ϟ',description:'Live digit research'},
  'Manual Trader':{color:'#34d399',icon:'↗',description:'Manual paper practice'},
  'Apex Bot':{color:'#a78bfa',icon:'△',description:'Strict strategy research'},
  'Volt AI':{color:'#818cf8',icon:'✦',description:'Market intelligence'},
  'Hedging Tool':{color:'#2dd4bf',icon:'⇄',description:'Hedge scenarios'},
  'Quick Bot':{color:'#fb923c',icon:'ϟ',description:'Historical backtesting'},
  'Copy Trader':{color:'#f472b6',icon:'⧉',description:'Prototype workspace'},
  Automated:{color:'#60a5fa',icon:'◎',description:'Owner-controlled Deriv Demo'},
  'Analysis Tools':{color:'#38bdf8',icon:'▥',description:'Market scanner'},
  'Signal AI':{color:'#c084fc',icon:'✧',description:'Signal research'},
  Charts:{color:'#34d399',icon:'▥',description:'Public-market candles'},
  'Bot Builder':{color:'#22d3ee',icon:'▦',description:'Official Deriv Blockly'},
  'Free Bots':{color:'#60a5fa',icon:'◇',description:'Original 15 SENFX bots'},
  'Auto AI':{color:'#a78bfa',icon:'✦',description:'Golden Rule validation'},
};

function ModuleArt({name}:{name:string}){
  const theme=themes[name]||themes['Volt AI'];
  return <div className={styles.moduleArt} style={{'--module-accent':theme.color} as CSSProperties} aria-hidden="true">
    <div className={styles.moduleOrbit}/><div className={styles.moduleOrbit}/>
    <div className={styles.moduleGlyph}>{theme.icon}</div>
    <div className={styles.moduleBars}>{Array.from({length:16},(_,i)=><i key={i} style={{height:20+(i*23)%70+'%',animationDelay:-i*.13+'s'}}/>)}</div>
  </div>;
}

function ToolLaunch({module}:{module:Exclude<WorkspaceModule,'Dashboard'|'Automated'|'Bot Builder'|'Charts'>}){
  const target=moduleTargets[module];
  const theme=themes[module]||themes['Volt AI'];
  const stateLabel=target.state==='prototype'?'Prototype':target.state==='research'?'Research tool':'Connected tool';
  return <section className={styles.targetCard} style={{'--module-accent':theme.color} as CSSProperties}>
    <ModuleArt name={module}/>
    <div className={styles.targetCopy}>
      <small>{stateLabel.toUpperCase()}</small>
      <h2>{target.title}</h2>
      <p>{target.detail}</p>
      <Link className={styles.targetButton} href={target.href}>Open {target.title} ↗</Link>
    </div>
  </section>;
}

export default function MasterWorkspace(){
  const [tab,setTab]=useState<WorkspaceModule>('Bot Builder');
  const [toolsOpen,setToolsOpen]=useState(false);
  const [orb,setOrb]=useState(false);
  const theme=themes[tab]||themes['Volt AI'];
  return <div className={styles.shell}>
    <header className={styles.dbotTopbar}>
      <div className={styles.dbotBrand}>TRADE SCHEME <b>FX</b><small>DERIV DEMO WORKSPACE</small></div>
      <div className={styles.dbotStatus}><span/>DEMO ONLY <small>REAL-MONEY TRADING DISABLED</small></div>
      <button className={styles.toolsToggle} type="button" aria-expanded={toolsOpen} onClick={()=>setToolsOpen(value=>!value)}>
        {toolsOpen?'Close tools':'All 17 tools'}
      </button>
    </header>
    {toolsOpen&&<nav className={styles.toolDrawer} aria-label="All 17 workspace tools">
      {modules.map(module=><button key={module} aria-current={tab===module?'page':undefined} onClick={()=>{setTab(module);setToolsOpen(false);}}>
        <span>{module}</span><small>{module==='Bot Builder'?'Deriv Blockly':module==='Dashboard'?'Demo overview':moduleTargets[module as keyof typeof moduleTargets]?.title||module}</small>
      </button>)}
    </nav>}
    <div className={styles.layout}>
      <section className={`${styles.main} ${tab==='Bot Builder'?styles.builderMain:''}`} key={tab}>
        {tab!=='Bot Builder'&&<header><small>TRADE SCHEME FX / 4.0 WORKSPACE</small><h1>{tab}</h1></header>}
        {tab!=='Dashboard'&&tab!=='Bot Builder'&&<div className={styles.moduleHeader} style={{'--module-accent':theme.color} as CSSProperties}>
          <ModuleArt name={tab}/><div><small>TRADE SCHEME FX · TOOL WORKSPACE</small><h2>{tab}</h2><p>{theme.description}</p></div>
        </div>}

        {tab==='Dashboard'&&<>
          <FifteenDemoLiveAccountBar/>
          <FifteenDemoBotControlPanel/>
          <div className={styles.hero}>
            <div className={styles.wave} aria-hidden="true"/><div className={styles.waveTwo} aria-hidden="true"/>
            <div className={styles.marketArt} aria-hidden="true">{Array.from({length:32},(_,i)=><i key={i} className={i%5===1||i%5===2?styles.down:styles.up} style={{left:`${i*3.2}%`,bottom:`${18+i*1.35+Math.sin(i*.65)*15}%`,height:`${18+(i*17)%48}px`,animationDelay:`${-i*.23}s`}}/>)}</div>
            <div className={styles.floor} aria-hidden="true"/>
            <h2>Your 17-tool workspace</h2>
            <p>Open the existing research tools, the pinned Blockly editor, and the original 15-bot Demo controls.</p>
          </div>
          <div className={`${styles.grid} ${styles.launchGrid}`}>
            {(['Bulk Trader','Premium AI Bots','Speedbot','Manual Trader'] as const).map(module=>{
              const target=moduleTargets[module];
              return <button key={module} className={styles.launchCard} style={{'--module-accent':themes[module].color} as CSSProperties} onClick={()=>setTab(module)}>
                <ModuleArt name={module}/><strong>{module} ↗</strong><small>{target.title}</small>
              </button>;
            })}
          </div>
        </>}

        {tab==='Bot Builder'&&<>
          <div className={styles.builderNotice} role="status"><strong>Demo workspace</strong><span>Blockly edits stay in this browser. Broker Run is locked until the 15 original strategies pass mapping and safety validation.</span><Link href="/bot-library">Open the 15 existing Demo bots ↗</Link></div>
          <iframe title="Official Deriv Blockly Bot Builder" src="/native-deriv/index.html#bot_builder" sandbox="allow-scripts allow-downloads" referrerPolicy="no-referrer" className={styles.builderFrame}/>
        </>}

        {tab==='Automated'&&<><FifteenDemoBotControlPanel/><QuantumLiveCharts/></>}
        {tab==='Charts'&&<><div className={styles.chartFrame}><LiveCandleChart embedded/></div><QuantumLiveCharts/></>}
        {tab!=='Dashboard'&&tab!=='Bot Builder'&&tab!=='Automated'&&tab!=='Charts'&&<ToolLaunch module={tab}/>}
      </section>
    </div>
    {orb&&<div className={styles.assistant}><h3>AI Market Scanner</h3><p>Research and public-market indicators.</p><Link href="/ai-scanner">Open market analysis ↗</Link><button onClick={()=>setOrb(false)}>Close</button></div>}
    {tab!=='Bot Builder'&&<button className={styles.orb} aria-label="Open AI scanner" aria-expanded={orb} onClick={()=>setOrb(value=>!value)}><span className={styles.aiOrbit}/><span className={styles.aiOrbit}/><span className={styles.aiCenter}>✦<small>AI</small></span></button>}
  </div>;
}
