'use client';

import Link from 'next/link';
import {useState} from 'react';
import type {CSSProperties} from 'react';
import QuantumLiveCharts from './QuantumLiveCharts';
import QuantumBotCatalog from './QuantumBotCatalog';
import FifteenOriginalBotCatalog from '@/app/bot-library/FifteenOriginalBotCatalog';
import LiveCandleChart from '@/app/components/LiveCandleChart';
import {modules,moduleTargets,type WorkspaceModule} from './registry';
import styles from './workspace.module.css';

const themes:Record<string,{color:string;icon:string;description:string}>={
  'Bulk Trader':{color:'#22d3ee',icon:'▥',description:'Plan batch exposure'},
  'Premium AI Bots':{color:'#fbbf24',icon:'◇',description:'Current 4.0 research strategies'},
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
  'Free Bots':{color:'#60a5fa',icon:'◇',description:'Current 4.0 research strategies'},
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
  const [tab,setTab]=useState<WorkspaceModule>('Dashboard');
  const [orb,setOrb]=useState(false);
  const theme=themes[tab]||themes['Volt AI'];
  return <div className={styles.shell}>
    <nav className={styles.nav} aria-label="Trading tools">
      {modules.map(module=><button key={module} aria-pressed={tab===module} onClick={()=>{
        if(module==='Bot Builder'){
          window.location.assign('/builder');
          return;
        }
        setTab(module);
      }}>{module}</button>)}
    </nav>
    <div className={styles.layout}>
      <section className={styles.main} key={tab}>
        <header><small>TRADE SCHEME FX / 4.0 WORKSPACE</small><h1>{tab}</h1></header>
        {tab!=='Dashboard'&&tab!=='Bot Builder'&&<div className={styles.moduleHeader} style={{'--module-accent':theme.color} as CSSProperties}>
          <ModuleArt name={tab}/><div><small>TRADE SCHEME FX · TOOL WORKSPACE</small><h2>{tab}</h2><p>{theme.description}</p></div>
        </div>}

        {tab==='Dashboard'&&<>
          <div className={styles.hero}>
            <div className={styles.wave} aria-hidden="true"/><div className={styles.waveTwo} aria-hidden="true"/>
            <div className={styles.marketArt} aria-hidden="true">{Array.from({length:32},(_,i)=><i key={i} className={i%5===1||i%5===2?styles.down:styles.up} style={{left:`${i*3.2}%`,bottom:`${18+i*1.35+Math.sin(i*.65)*15}%`,height:`${18+(i*17)%48}px`,animationDelay:`${-i*.23}s`}}/>)}</div>
            <div className={styles.floor} aria-hidden="true"/>
            <h2>Your 17-tool workspace</h2>
            <p>Open the existing research tools, the pinned Blockly editor, and the current 4.0 strategy bots.</p>
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
          <p className={styles.muted}>Official Deriv Blockly, pinned to the repository revision. Select a current 4.0 strategy from Premium AI Bots to open its reference in the editor. Broker networking is isolated and Run remains disabled.</p>
          <div className={styles.notice} role="note">Demo execution remains in the existing SENFX controls. Real-money trading is disabled.</div>
          <p><button type="button" onClick={()=>setTab('Premium AI Bots')}>Browse current 4.0 strategy bots ↗</button></p>
          <iframe title="Official Deriv Blockly Bot Builder" src="/native-deriv/index.html#bot_builder" sandbox="allow-scripts allow-downloads" referrerPolicy="no-referrer" className={styles.builderFrame}/>
        </>}

        {(tab==='Premium AI Bots'||tab==='Free Bots')&&<><QuantumBotCatalog/><FifteenOriginalBotCatalog/></>}

        {tab==='Automated'&&<><QuantumBotCatalog/><FifteenOriginalBotCatalog/><QuantumLiveCharts/></>}
        {tab==='Charts'&&<><div className={styles.chartFrame}><LiveCandleChart embedded/></div><QuantumLiveCharts/></>}
        {tab!=='Dashboard'&&tab!=='Bot Builder'&&tab!=='Automated'&&tab!=='Charts'&&tab!=='Premium AI Bots'&&tab!=='Free Bots'&&<ToolLaunch module={tab}/>}
      </section>
      <aside className={styles.side}>
        <h3>Session</h3><p>Current 4.0 strategy references are available in the bot library and Deriv Blockly. Demo execution remains separate.</p>
        <Link href="/bot-library">Open current 4.0 bot library</Link>
        <p className={styles.sideSafety}>Real-money trading is disabled. Research tools do not place orders.</p>
      </aside>
    </div>
    {orb&&<div className={styles.assistant}><h3>AI Market Scanner</h3><p>Research and public-market indicators.</p><Link href="/ai-scanner">Open market analysis ↗</Link><button onClick={()=>setOrb(false)}>Close</button></div>}
    <button className={styles.orb} aria-label="Open AI scanner" aria-expanded={orb} onClick={()=>setOrb(value=>!value)}><span className={styles.aiOrbit}/><span className={styles.aiOrbit}/><span className={styles.aiCenter}>✦<small>AI</small></span></button>
  </div>;
}
