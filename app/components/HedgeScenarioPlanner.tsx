"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

const f = (n: number) => Number.isFinite(n) ? n.toFixed(2) : "—";

export default function HedgeScenarioPlanner() {
  const [notionalText, setNotionalText] = useState("1000");
  const [hedgePctText, setHedgePctText] = useState("50");
  const [stressPctText, setStressPctText] = useState("10");
  const results = useMemo(() => {
    const notional = Number(notionalText);
    const hedgePct = Number(hedgePctText) / 100;
    const stress = Number(stressPctText) / 100;
    if (!Number.isFinite(notional) || notional <= 0 ||
        !Number.isFinite(hedgePct) || hedgePct < 0 || hedgePct > 1 ||
        !Number.isFinite(stress) || stress <= 0 || stress > .5) return null;
    const hedgeNotional = notional * hedgePct;
    const moves = [-stress, -stress / 2, 0, stress / 2, stress];
    return { notional, hedgeNotional, hedgePct, stress, moves: moves.map(move => ({
      move, holding: notional * move, hedge: -hedgeNotional * move,
      combined: (notional - hedgeNotional) * move,
    })) };
  }, [notionalText, hedgePctText, stressPctText]);

  return <main className="appShell">
    <header className="dashNav">
      <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
      <Link className="button secondary small" href="/dashboard">Dashboard</Link>
    </header>
    <section className="dashContent" style={{ maxWidth: 1120 }}>
      <p className="eyebrow">SENFX LEARNING · EXPOSURE ANALYSIS</p>
      <h1>Hedging scenario planner</h1>
      <p className="muted">Explore how a hypothetical short position could offset price movement in an existing long exposure. The simple linear payoff model does not replicate Deriv option prices, spreads, contract availability or margin requirements.</p>
      <div className="notice"><strong>SCENARIO TOOL ONLY.</strong> No hedge is established; no copy-trading or broker execution occurs.</div>
      <section className="panel" style={{ marginTop: 20 }}>
        <h2>Position assumptions</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          <label className="fieldLabel">Illustrative long notional
            <input className="fieldInput" type="number" min="1" step="1" value={notionalText}
              onChange={e => setNotionalText(e.target.value)} style={{ display: "block" }}/>
          </label>
          <label className="fieldLabel">Hypothetical hedge ratio (%)
            <input className="fieldInput" type="number" min="0" max="100" step="1"
              value={hedgePctText} onChange={e => setHedgePctText(e.target.value)} style={{ display: "block" }}/>
          </label>
          <label className="fieldLabel">Stress scenario move (%)
            <input className="fieldInput" type="number" min="0.1" max="50" step="0.5"
              value={stressPctText} onChange={e => setStressPctText(e.target.value)} style={{ display: "block" }}/>
          </label>
        </div>
        {!results ? <p role="alert" className="notice">Enter valid values: positive notional, hedge ratio 0–100%, and stress move 0.1–50%.</p> :
          <>
            <div className="dashGrid" style={{ margin: "22px 0" }}>
              <article className="panel"><p className="eyebrow">LONG EXPOSURE</p><h2>{f(results.notional)}</h2></article>
              <article className="panel"><p className="eyebrow">OFFSETTING SHORT EXPOSURE</p><h2>{f(results.hedgeNotional)}</h2></article>
              <article className="panel"><p className="eyebrow">NET DIRECTIONAL EXPOSURE</p><h2>{f(results.notional - results.hedgeNotional)}</h2></article>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 620, textAlign: "left" }}>
                <thead><tr><th>Hypothetical move</th><th>Long P/L</th><th>Short offset P/L</th><th>Combined P/L</th></tr></thead>
                <tbody>{results.moves.map(item =>
                  <tr key={item.move}>
                    <td>{(item.move * 100).toFixed(1)}%</td>
                    <td>{f(item.holding)}</td>
                    <td>{f(item.hedge)}</td>
                    <td style={{ color: item.combined < 0 ? "#ec7692" : "#4edcb1" }}>{f(item.combined)}</td>
                  </tr>
                )}</tbody>
              </table>
            </div>
          </>
        }
        <p className="muted">A hedge may reduce upside and downside simultaneously. Actual derivatives can add basis risk, costs, slippage, liquidation and product-specific restrictions.</p>
        <div className="actions">
          <Link className="button secondary" href="/markets">View markets</Link>
          <Link className="button secondary" href="/bot-center">Paper bot center</Link>
        </div>
      </section>
      <p className="disclaimer">No financial return, hedge effectiveness or protection is guaranteed. Never treat this linear illustration as a broker order quote.</p>
    </section>
  </main>;
}
