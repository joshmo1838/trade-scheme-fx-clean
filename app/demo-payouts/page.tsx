import type {Metadata} from "next";
import Link from "next/link";
import FifteenDemoPayoutComparison from "@/app/bot-library/FifteenDemoPayoutComparison";
import styles from "@/app/bot-library/fifteen.module.css";

export const metadata:Metadata={
 title:"Deriv Demo $500 Payout Comparison | SENFX",
 description:"Compare genuine read-only Deriv virtual Demo payouts for the 15 unchanged SENFX bot contract mappings.",
};

// Price-only examples using each EXISTING bot's contract family, market, duration
// and fixed barrier. Directional BUY/SELL and entropy parity cannot be inferred
// from a static screen; these quote examples are never trade signals.
// The dynamic Differs barrier of 7 is illustrative only.
const contractExamples=[
 {botId:"digit-over-4",prediction:"OVER",barrier:4},
 {botId:"digit-under-5",prediction:"UNDER",barrier:5},
 {botId:"parity-even",prediction:"EVEN"},
 {botId:"parity-odd",prediction:"ODD"},
 {botId:"digit-matches",prediction:"MATCHES",barrier:3},
 {botId:"digit-differs",prediction:"DIFFERS",barrier:7},
 {botId:"trend-rise-fall",prediction:"RISE"},
 {botId:"breakout-higher-lower",prediction:"RISE"},
 {botId:"recovery-audit",prediction:"EVEN"},
 {botId:"stepwise-audit",prediction:"OVER",barrier:4},
 {botId:"adaptive-over",prediction:"OVER",barrier:4},
 {botId:"entropy-parity",prediction:"EVEN"},
 {botId:"pattern-differs",prediction:"DIFFERS",barrier:7},
 {botId:"momentum-rise-fall",prediction:"RISE"},
 {botId:"volatility-scalper",prediction:"RISE"}
] as const;

export default function DerivDemoPayoutsPage(){
 return <main className={styles.shell}><div className={styles.content}>
  <header className={styles.topbar}>
   <Link href="/dashboard" className={styles.brand}>TRADE SCHEME <b>FX</b></Link>
   <nav><Link href="/bot-library">Bulk Bots</Link><Link href="/dashboard">Dashboard</Link></nav>
  </header>
  <section className={styles.hero}>
   <p className={styles.kicker}>DIRECT ACCESS · DERIV VIRTUAL DEMO · READ ONLY</p>
   <h1>Compare <span>$500 payouts</span> for all 15 SENFX bots</h1>
   <p>No scrolling through Bulk Bots needed. This page requests real broker prices
    for each original contract family, without making purchases or changing trading rules.</p>
   <p className={styles.warning}>Prices below use illustrative contract directions or
    barriers when a live strategy signal is unavailable. They are <strong>not</strong>
    signals, proof of profitability, or approvals to trade. You must sign in with
    the authorized virtual Demo admin account to obtain account-specific quotes.</p>
   <p><Link href="/login">Sign in</Link> if prompted, then return here to compare.
    <span> </span><Link href="/bot-library">Return to all 15 bots</Link>.</p>
  </section>
  <FifteenDemoPayoutComparison candidates={[...contractExamples]} illustrative/>
 </div></main>;
}
