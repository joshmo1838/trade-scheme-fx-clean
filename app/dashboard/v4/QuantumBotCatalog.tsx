'use client';

import {STRATEGIES} from '@/lib/quantum/strategies';
import type {CSSProperties} from 'react';
import styles from './workspace.module.css';

export default function QuantumBotCatalog(){
  return <section className={styles.quantumCatalog} aria-label="Trade Scheme FX 4.0 strategy bots">
    <div className={styles.quantumCatalogHead}>
      <div><small>TRADE SCHEME FX · VERSION 4.0</small><h2>Strategy bots</h2></div>
      <span>16 RESEARCH MODELS · RUN DISABLED</span>
    </div>
    <p className={styles.quantumCatalogNote}>These are the current 4.0 strategies. Select a bot to open its strategy reference inside the official Deriv Blockly workspace. The research rules remain unchanged; DBot execution is disabled until a validated block mapping exists.</p>
    <div className={styles.quantumBotGrid}>
      {STRATEGIES.map((strategy,index)=><article key={strategy.id} className={styles.quantumBotCard} style={{'--bot-accent':strategy.color} as CSSProperties}>
        <div className={styles.quantumBotArt} aria-hidden="true"><i/><i/><i/><b>{String(index+1).padStart(2,'0')}</b></div>
        <small>{strategy.model.replaceAll('_',' ')} · {strategy.mode}</small>
        <h3>{strategy.name}</h3>
        <p>{strategy.rule}</p>
        <button type="button" onClick={()=>window.location.assign(`/builder?strategyId=${encodeURIComponent(strategy.id)}`)}>Open inside Deriv DBot ↗</button>
      </article>)}
    </div>
  </section>;
}
