'use client';

import {STRATEGIES} from '@/lib/quantum/strategies';
import type {CSSProperties} from 'react';
import styles from './workspace.module.css';

type Props={premium?:boolean};

export default function QuantumBotCatalog({premium=false}:Props){
  return <section className={styles.quantumCatalog} aria-label={premium?'Premium AI strategy bots':'Trade Scheme FX 4.0 strategy bots'}>
    <div className={styles.quantumCatalogHead}>
      <div><small>TRADE SCHEME FX · VERSION 4.0</small><h2>{premium?'Premium AI Bots':'Strategy bots'}</h2></div>
      <span>16 CURRENT STRATEGIES · DEMO RUN</span>
    </div>
    <p className={styles.quantumCatalogNote}>{premium?'Choose a Premium AI Bot to open its selected strategy in the full-screen Deriv DBot workspace.':'Choose a strategy to open its selected bot in the full-screen Deriv DBot workspace.'} Virtual-funds Demo controls are available from the workspace header.</p>
    <div className={styles.quantumBotGrid}>
      {STRATEGIES.map((strategy,index)=><article key={strategy.id} className={styles.quantumBotCard} style={{'--bot-accent':strategy.color} as CSSProperties}>
        <div className={styles.quantumBotArt} aria-hidden="true"><i/><i/><i/><b>{String(index+1).padStart(2,'0')}</b></div>
        <small>{strategy.model.replaceAll('_',' ')} · {strategy.mode}</small>
        <h3>{strategy.name}</h3>
        <p>{strategy.rule}</p>
        <button type="button" onClick={()=>window.location.assign(`/builder?strategyId=${encodeURIComponent(strategy.id)}`)}>RUN AI BOT</button>
      </article>)}
    </div>
  </section>;
}
