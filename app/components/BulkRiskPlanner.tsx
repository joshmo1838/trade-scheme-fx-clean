"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const number = (n: number) => Number.isFinite(n) ? n.toFixed(2) : "—";
const percent = (n: number) => Number.isFinite(n) ? (n * 100).toFixed(1) + "%" : "—";

export default function BulkRiskPlanner() {
  const [stakeText, setStakeText] = useState("5");
  const [countText, setCountText] = useState("5");
  const [virtualCapitalText, setVirtualCapitalText] = useState("500");
  const [assumedWinRateText, setAssumedWinRateText] = useState("50");
  const [assumedNetPayoutText, setAssumedNetPayoutText] = useState("80");
  const [notice, setNotice] = useState("");
  const values = useMemo(() => {
    const stake = Number(stakeText);
    const count = Number(countText);
    const capital = Number(virtualCapitalText);
    const winRate = Number(assumedWinRateText) / 100;
    const payout = Number(assumedNetPayoutText) / 100;

    const valid = Number.isFinite(stake) && stake > 0 &&
      Number.isInteger(count) && count >= 1 && count <= 100 &&
      Number.isFinite(capital) && capital > 0 &&
      Number.isFinite(winRate) && winRate >= 0 && winRate <= 1 &&
      Number.isFinite(payout) && payout > 0 && payout <= 10;
    const worstCase = valid ? stake * count : NaN;
    const bestCase = valid ? worstCase * payout : NaN;
    const expectedPerTrade = valid ? stake * (winRate * payout - (1 - winRate)) : NaN;
    const breakEvenRate = valid ? 1 / (1 + payout) : NaN;
    const fractionAtRisk = valid ? worstCase / capital : NaN;
    const scenarios = valid ? [0, .25, .5, .75, 1].map(wonFraction => {
      const wins = Math.round(count * wonFraction);
      const losses = count - wins;
      return { label: wins + " win / " + losses + " loss", profit: stake * (wins * payout - losses) };
    }) : [];
    return { valid, stake, count, capital, winRate, payout, worstCase, bestCase,
      expectedPerTrade, breakEvenRate, fractionAtRisk, scenarios };
  }, [stakeText, countText, virtualCapitalText, assumedWinRateText, assumedNetPayoutText]);

  return <main className="appShell">
    <header className="dashNav">
      <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
      <div className="actions"><Link href="/manual-trader" className="button secondary small">Manual practice</Link><Link href="/dashboard" className="button secondary small">Dashboard</Link></div>
    </header>
    <section className="dashContent" style={{ maxWidth: 1130 }}>
      <p className="eyebrow">SENFX PLANNING LAB</p><h1>Bulk trade risk planner</h1>
      <p className="muted">
        Explore exposure and potential losses across multiple illustrative contracts before placing any orders.
        These are scenario calculations, not contract quotes or evidence of a profitable strategy.
      </p>
      <div className="notice"><strong>PLANNING ONLY.</strong> No batch purchases, Deriv orders or transfers can be initiated here. Review <Link href="/risk-center">the Risk Command Center ↗</Link> for daily budget and losing-streak stress tests.</div>
      <section className="panel" style={{ marginTop: 22 }}>
        <h2>Batch assumptions</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 15 }}>
          {[
            { label: "Virtual stake / contract", value: stakeText, set: setStakeText, min: "0.35", max: "10000", step: "0.01" },
            { label: "Number of planned contracts", value: countText, set: setCountText, min: "1", max: "100", step: "1" },
            { label: "Example virtual capital", value: virtualCapitalText, set: setVirtualCapitalText, min: "1", max: "10000000", step: "0.01" },
            { label: "Assumed win rate (%)", value: assumedWinRateText, set: setAssumedWinRateText, min: "0", max: "100", step: "1" },
            { label: "Assumed net payout on win (%)", value: assumedNetPayoutText, set: setAssumedNetPayoutText, min: "1", max: "1000", step: "1" },
          ].map(field =>
            <label className="fieldLabel" key={field.label}>{field.label}
              <input className="fieldInput" type="number" min={field.min} max={field.max} step={field.step}
                style={{ display: "block", width: "100%", marginTop: 7 }}
                value={field.value} onChange={e => field.set(e.target.value)} />
            </label>
          )}
        </div>
        {!values.valid && <p role="alert" className="notice">Enter positive stake/capital/payout, 1–100 contracts and a win-rate assumption between 0% and 100%.</p>}
        {values.valid && <>
          <div className="dashGrid" style={{ marginTop: 20 }}>
            <article className="panel"><small>GROSS STAKE EXPOSURE</small><h2>{number(values.worstCase)}</h2><p className="muted">All contracts could lose.</p></article>
            <article className="panel"><small>FULL-LOSS RISK / VIRTUAL CAPITAL</small><h2 style={{ color: values.fractionAtRisk > .05 ? "#f3b874" : "#4ed7b2" }}>{percent(values.fractionAtRisk)}</h2><p className="muted">Over 5% is a high exposure scenario.</p></article>
            <article className="panel"><small>HYPOTHETICAL BEST CASE</small><h2>{number(values.bestCase)}</h2><p className="muted">Assumes every contract wins at entered payout.</p></article>
            <article className="panel"><small>BREAK-EVEN WIN RATE*</small><h2>{percent(values.breakEvenRate)}</h2><p className="muted">Before fees, slippage or execution effects.</p></article>
          </div>
          <p style={{ color: values.expectedPerTrade >= 0 ? "#77d5c0" : "#ff9eb9", marginTop: 15, fontWeight: 700 }}>
            Illustrative expectation for the batch using YOUR assumptions: {number(values.expectedPerTrade * values.count)} units
          </p>
          <p className="muted">The win-rate and payout inputs are hypothetical. SENFX has not established that any bot achieves them; results depend on real contracts and market conditions.</p>
          <h2 style={{ marginTop: 26 }}>Outcome scenarios</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 550, textAlign: "left" }}>
              <thead><tr><th>Observed wins / losses (illustrative)</th><th>P/L</th><th>Ending virtual capital</th></tr></thead>
              <tbody>{values.scenarios.map(item =>
                <tr key={item.label}>
                  <td>{item.label}</td><td>{number(item.profit)}</td>
                  <td>{number(values.capital + item.profit)}</td>
                </tr>
              )}</tbody>
            </table>
          </div>
        </>}
        <div className="actions" style={{ marginTop: 20 }}>
          <button className="button" disabled={!values.valid}
            onClick={() => setNotice("Scenario reviewed. Nothing was bought, sold, funded, or executed.")}>Confirm review — no trading</button>
          <Link href="/bot-center" className="button secondary">Browse paper bots</Link>
        </div>
        {notice && <p className="notice" role="status">{notice}</p>}
      </section>
      <p className="disclaimer">*Break-even assumes a loss consumes the full stake and a win pays the displayed net rate. Real Deriv contracts may differ. High projected returns cannot be guaranteed or inferred from this calculator.</p>
    </section>
  </main>;
}
