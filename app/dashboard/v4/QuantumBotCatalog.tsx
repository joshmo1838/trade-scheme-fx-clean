'use client';

import {useState} from 'react';
import {STRATEGIES} from '@/lib/quantum/strategies';
import type {CSSProperties} from 'react';
import styles from './workspace.module.css';
import QuantumDemoRunControl from './QuantumDemoRunControl';
import PremiumBotWorkspace from './PremiumBotWorkspace';

type Props={premium?:boolean;onWorkspaceChange?:(open:boolean)=>void};

export default function QuantumBotCatalog({premium=false,onWorkspaceChange}:Props){
  const [selectedForRun,setSelectedForRun]=useState<string|null>(null);
  const selected=STRATEGIES.find(x=>x.id===selectedForRun);
  const openWorkspace=(id:string)=>{setSelectedForRun(id);onWorkspaceChange?.(true);};
  const closeWorkspace=()=>{setSelectedForRun(null);onWorkspaceChange?.(false);};
  if(premium&&selected)return <PremiumBotWorkspace key={selected.id} strategy={selected} onBack={closeWorkspace}/>;
  return <section className={styles.quantumCatalog} aria-label="Trade Scheme FX 4.0 strategy bots">
    <div className={styles.quantumCatalogHead}>
      <div><small>TRADE SCHEME FX · VERSION 4.0</small><h2>Strategy bots</h2></div>
      <span>16 CURRENT STRATEGIES · DEMO RUN</span>
    </div>
    <p className={styles.quantumCatalogNote}>{premium?'Open a premium bot to use its dedicated scanner workspace. The live market panel uses the existing strategy rule; Demo Run controls stay server-verified and virtual-funds only.':'These 16 current 4.0 strategies keep their existing research rules. Select a bot to open its Deriv Blockly workspace or configure a user-started, virtual-funds Demo run.'}</p>
    <div className={styles.quantumBotGrid}>
      {STRATEGIES.map((strategy,index)=><article key={strategy.id} className={styles.quantumBotCard} style={{'--bot-accent':strategy.color} as CSSProperties}>
        <div className={styles.quantumBotArt} aria-hidden="true"><i/><i/><i/><b>{String(index+1).padStart(2,'0')}</b></div>
        <small>{strategy.model.replaceAll('_',' ')} · {strategy.mode}</small>
        <h3>{strategy.name}</h3>
        <p>{strategy.rule}</p>
        {premium?<button type="button" onClick={()=>openWorkspace(strategy.id)}>Open premium workspace ↗</button>:<>
          <button type="button" onClick={()=>window.location.assign(`/builder?strategyId=${encodeURIComponent(strategy.id)}`)}>Open inside Deriv DBot ↗</button>
          <button type="button" aria-pressed={selectedForRun===strategy.id} onClick={()=>setSelectedForRun(selectedForRun===strategy.id?null:strategy.id)}>{selectedForRun===strategy.id?'Close Demo settings':'Configure Demo Run'}</button>
        </>}
      </article>)}
    </div>
    {selected&&<QuantumDemoRunControl key={selected.id} botId={selected.id} botName={selected.name}/>}
  </section>;
}
