"use client";

import Link from "next/link";

export default function NativeDerivBuilder() {
  return (
    <main className="appShell" style={{ minHeight: "100vh" }}>
      <header className="dashNav">
        <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
        <Link className="button secondary small" href="/dashboard">Dashboard</Link>
      </header>
      <section className="dashContent" style={{ maxWidth: 1500 }}>
        <p className="eyebrow">OFFICIAL DERIV BLOCKLY · EDITING PREVIEW</p>
        <h1>Bot Builder</h1>
        <p className="muted">
          This is Deriv’s pinned Blockly editor. You can build and save a local design.
          Broker connections and the editor’s Run action are disabled here. Strategy
          mapping to the original 15 SENFX bots must pass validation before Demo execution.
        </p>
        <div className="notice" role="note">
          Demo execution remains in the existing SENFX controls. Real-money trading is disabled.
        </div>
        <iframe
          title="Official Deriv Blockly Bot Builder"
          src="/native-deriv/index.html#bot_builder"
          sandbox="allow-scripts allow-downloads"
          referrerPolicy="no-referrer"
          style={{ display: "block", width: "100%", height: "min(78vh, 920px)", minHeight: 620,
            marginTop: 18, border: "1px solid #294766", borderRadius: 14, background: "#fff" }}
        />
      </section>
    </main>
  );
}
