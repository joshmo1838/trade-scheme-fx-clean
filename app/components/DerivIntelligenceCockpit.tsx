"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Navigation and transparent live-data status; no synthetic signal or trade claims. */
const stations = [
  { title: "Market Scanner", href: "/ai-scanner", detail: "Inspect market signals and their evidence", icon: "◉" },
  { title: "15 Bot Workspace", href: "/bot-library", detail: "Explore available bot strategies and settings", icon: "▦" },
  { title: "Smart Entry Research", href: "/intelligence", detail: "Review market intelligence before an entry", icon: "⌁" },
  { title: "Deriv Templates", href: "/deriv-presets", detail: "14 documented strategy concepts · research only", icon: "◇" },
  { title: "Contract Research", href: "/strategy-lab", detail: "Compare ideas without submitting orders", icon: "◈" },
  { title: "Risk & Emergency Controls", href: "/risk-center", detail: "Check limits and risk settings", icon: "⚖" },
] as const;

export default function DerivIntelligenceCockpit() {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return <section aria-label="Deriv intelligence workspace" className="rounded-2xl border border-slate-700 bg-slate-950/95 p-5 text-slate-100 shadow-xl md:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Trade Scheme FX 3.0 · Intelligence cockpit</p>
        <h2 className="mt-2 text-2xl font-bold">Markets, bots & decisions in one workspace</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Open live-market research, bot tools, strategy templates and risk checks. Signals and profits must come from verified sources, never animations.</p>
      </div>
      <div className="rounded-lg border border-slate-700 px-3 py-2 text-xs" role="status">
        <span className={online === true ? "text-emerald-300" : "text-amber-300"}>●</span>{" "}
        {online === null ? "Network checking" : online ? "Browser network online" : "Browser offline"}
        <div className="mt-1 text-slate-400">Broker trade status: not verified here</div>
      </div>
    </div>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {stations.map(station => <Link key={station.href} href={station.href}
        className="group rounded-xl border border-slate-700 bg-slate-900/80 p-4 transition duration-200 hover:-translate-y-1 hover:border-cyan-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
        <span aria-hidden="true" className="text-2xl text-cyan-300">{station.icon}</span>
        <h3 className="mt-3 font-semibold group-hover:text-cyan-300">{station.title} ↗</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{station.detail}</p>
      </Link>)}
    </div>
    <p className="mt-5 border-t border-slate-800 pt-4 text-xs text-slate-400">This panel is a navigation cockpit, not a trade execution engine. Open the live chart and verified operations deck below for actual market and account evidence. No purchase is initiated here.</p>
  </section>;
}
