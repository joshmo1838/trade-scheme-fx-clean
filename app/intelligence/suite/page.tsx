"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import "./suite.css";

type Module = { title: string; description: string; href: string; status: string; note: string };
const modules: Module[] = [
  { title: "Live Market Terminal", description: "Candles assembled from Deriv public ticks received in this browser.", href: "/charts", status: "Existing research tool", note: "Live only when the public feed reports valid fresh ticks." },
  { title: "AI Strategy Scientist", description: "Explore repeatable strategy hypotheses and paper-only backtests.", href: "/strategy-lab", status: "Existing research tool", note: "Not a predictive AI or verified investment performance." },
  { title: "Multi-Bot Command Center", description: "Review bot configurations and browser-local paper experiments.", href: "/bot-library", status: "Existing paper library", note: "No broker execution from this suite." },
  { title: "Risk Guardian", description: "Inspect portfolio risk and hypothetical exposure before testing.", href: "/risk-center", status: "Existing risk tool", note: "Research controls are not live broker-side protections." },
  { title: "Market Time Machine", description: "Review market history and session-derived analysis.", href: "/backtest", status: "Foundation only", note: "Full recorded-tick playback remains to be built." },
  { title: "Bot Performance Analytics", description: "Compare research results without mixing in real-account returns.", href: "/bot-research", status: "Existing comparison tool", note: "Paper observations must not be represented as actual profit." },
  { title: "Customer Workspace 2.0", description: "Personalize a research launchpad on this device.", href: "/dashboard", status: "Workspace foundation", note: "Cloud synchronization and notifications are not yet available." }
];
const STORAGE_KEY = "senfx-suite-favorites-v1";

export default function IntelligenceSuitePage() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(value)) setFavorites(value.filter((item): item is string => typeof item === "string" && modules.some(m => m.title === item)));
    } catch { /* Browser storage may be disabled. */ }
    setLoaded(true);
  }, []);
  function toggle(title: string) {
    const next = favorites.includes(title) ? favorites.filter(item => item !== title) : [...favorites, title];
    setFavorites(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Optional local preference. */ }
  }
  const ordered = [...modules].sort((a, b) => Number(favorites.includes(b.title)) - Number(favorites.includes(a.title)));
  return <main className="senfxSuite">
    <div className="senfxSuiteInner">
      <nav className="senfxSuiteNav" aria-label="Workspace navigation"><Link href="/dashboard">TRADE SCHEME FX</Link><Link href="/intelligence">Market intelligence</Link><Link href="/intelligence/smart-entry">Smart Entry</Link></nav>
      <header className="senfxSuiteHero"><p className="senfxSuiteEyebrow">SENFX 2.0 · INTELLIGENCE RESEARCH</p><h1>One workspace. <span>Seven research modules.</span></h1>
        <p>A coordinated launchpad for public market monitoring, paper strategy experiments, bot comparisons, and risk research. Modules link to existing tools; advanced features are under development.</p>
        <div className="senfxSuitePills"><span>● Browser-local preferences</span><span>● No broker orders</span><span>● No guaranteed returns</span></div>
      </header>
      <section aria-labelledby="modules-title"><div className="senfxSuiteSectionHead"><h2 id="modules-title">Intelligence modules</h2><p>{loaded ? favorites.length + " pinned on this device" : "Loading local preferences"}</p></div>
        <div className="senfxSuiteGrid">{ordered.map((module, i) => <article className="senfxSuiteCard" key={module.title}>
          <div className="senfxSuiteCardTop"><span className="senfxSuiteIndex">{String(modules.indexOf(module) + 1).padStart(2, "0")}</span><button type="button" onClick={() => toggle(module.title)} aria-pressed={favorites.includes(module.title)} aria-label={(favorites.includes(module.title) ? "Unpin " : "Pin ") + module.title}>{favorites.includes(module.title) ? "★ Pinned" : "☆ Pin"}</button></div>
          <h3>{module.title}</h3><p>{module.description}</p><span className="senfxSuiteStatus">{module.status}</span><small>{module.note}</small><Link className="senfxSuiteOpen" href={module.href}>Open existing tool <span aria-hidden="true">↗</span></Link>
        </article>)}</div>
      </section>
      <footer className="senfxSuiteFooter">Development workspace · Public ticks are live only while verified fresh. Research, replay and paper observations are not live trades. No funds are placed at risk by this page.</footer>
    </div>
  </main>;
}
