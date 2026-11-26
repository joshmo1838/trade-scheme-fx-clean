"use client";

import {FIFTEEN_BOTS} from "@/lib/bots/fifteen-paper-bots";
import {FIFTEEN_DBOT_REFERENCES} from "@/lib/bots/deriv-dbot-references.mjs";
import styles from "@/app/dashboard/v4/workspace.module.css";
import type {CSSProperties} from "react";

const referenceById=new Map(FIFTEEN_DBOT_REFERENCES.map(reference=>[reference.id,reference]));

export default function FifteenOriginalBotCatalog(){
  return <section className={styles.quantumCatalog} aria-label="Original 15 SENFX bots in Deriv DBot">
    <div className={styles.quantumCatalogHead}>
      <div><small>SENFX · ORIGINAL BOT SET</small><h2>Original 15 bots</h2></div>
      <span>15 BOT REFERENCES · EXECUTION UNCHANGED</span>
    </div>
    <p className={styles.quantumCatalogNote}>
      Open any original bot in the full Deriv DBot Blockly workspace. Its exact existing
      rule, market, sample requirement, and configured Demo contract appear in the
      trade-definition comment. The reference is not a DBot strategy conversion;
      DBot Run remains disabled and the original SENFX controls stay separate.
    </p>
    <div className={styles.quantumBotGrid}>
      {FIFTEEN_BOTS.map((bot,index)=>{
        const reference=referenceById.get(bot.id);
        const contract=reference?.rule.match(/Existing Demo template: ([^\n]+)/)?.[1]||"See original SENFX controls";
        return <article key={bot.id} className={styles.quantumBotCard} style={{"--bot-accent":"#22d3ee"} as CSSProperties}>
          <small>BOT {String(index+1).padStart(2,"0")} · {bot.market} · {bot.family.toUpperCase()}</small>
          <h3>{bot.name}</h3>
          <p>{reference?.rule.split("\n").find(line=>line.startsWith("Original rule: "))?.slice("Original rule: ".length)||bot.description}</p>
          <p><strong>Configured Demo contract:</strong> {contract}</p>
          <button type="button" onClick={()=>window.location.assign(`/builder?strategyId=${encodeURIComponent(bot.id)}`)}>
            Open in Deriv DBot ↗
          </button>
        </article>;
      })}
    </div>
  </section>;
}
