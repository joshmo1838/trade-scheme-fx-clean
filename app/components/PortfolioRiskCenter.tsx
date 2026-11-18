"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { calculateRiskPlan } from "@/lib/risk/command-center";

type FormKey = "capital" | "stake" | "dailyLossBudget" |
  "simultaneousContracts" | "lossStreak" | "netPayoutPercent";
type FormValues = Record<FormKey, string>;
const START: FormValues = {
  capital: "500", stake: "5", dailyLossBudget: "20",
  simultaneousContracts: "3", lossStreak: "5", netPayoutPercent: "80",
};
const fmt = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 2,
}).format(value);
const pct = (value: number) => value.toFixed(2) + "%";
const fields: Array<{
  key: FormKey; label: string; tip: string; min: string; max: string; step: string;
}> = [
  { key: "capital", label: "Example trading capital (USD)", tip: "Your hypothetical starting balance — never connected to a real account.", min: "1", max: "10000000", step: ".01" },
  { key: "stake", label: "Stake per hypothetical contract", tip: "Assumed maximum full-stake loss for each contract.", min: ".01", max: "10000000", step: ".01" },
  { key: "dailyLossBudget", label: "Daily loss budget (USD)", tip: "Planning budget only. Not an enforced stop-loss on Deriv or your bots.", min: ".01", max: "10000000", step: ".01" },
  { key: "simultaneousContracts", label: "Contracts open at once", tip: "Stress-test all selected contracts losing their full stake together.", min: "1", max: "100", step: "1" },
  { key: "lossStreak", label: "Consecutive losses to stress-test", tip: "A separate sequential scenario, not added to the open-contract scenario.", min: "1", max: "100", step: "1" },
  { key: "netPayoutPercent", label: "Assumed net payout on a win (%)", tip: "Hypothetical net profit as a percentage of stake, not a Deriv quote.", min: ".01", max: "500", step: ".1" },
];

export default function PortfolioRiskCenter() {
  const [values, setValues] = useState<FormValues>(START);
  const [copyMessage, setCopyMessage] = useState("");
  const plan = useMemo(() => calculateRiskPlan({
    capital: Number(values.capital || Number.NaN),
    stake: Number(values.stake || Number.NaN),
    dailyLossBudget: Number(values.dailyLossBudget || Number.NaN),
    simultaneousContracts: Number(values.simultaneousContracts || Number.NaN),
    lossStreak: Number(values.lossStreak || Number.NaN),
    netPayoutPercent: Number(values.netPayoutPercent || Number.NaN),
  }), [values]);

  const set = (key: FormKey, value: string) => {
    setValues(previous => ({ ...previous, [key]: value }));
    setCopyMessage("");
  };
  const preset = (rate: number) => {
    const capital = Number(values.capital);
    if (!Number.isFinite(capital) || capital < 1) return;
    set("stake", String(Math.max(.01, Math.round(capital * rate) / 100)));
  };
  const copySummary = async () => {
    if (!plan) return;
    const summary = [
      "Trade Scheme FX — illustrative risk scenario (not a trading instruction)",
      "Virtual capital: " + fmt(plan.capital),
      "Stake per assumed full-loss contract: " + fmt(plan.stake),
      "Planned simultaneous exposure: " + fmt(plan.grossExposure) + " (" + pct(plan.exposurePercent) + ")",
      "Daily planning budget: " + fmt(plan.dailyLossBudget) + " (not enforced)",
      "Sequential full-stake loss scenario: " + fmt(plan.sequentialLossAmount),
      "Break-even win rate under assumed net payout: " + pct(plan.breakEvenWinRatePercent),
      "Orders placed: none. No profitability or account balance verified.",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      setCopyMessage("Risk scenario copied. No trading settings were changed.");
    } catch {
      setCopyMessage("Clipboard access is unavailable in this browser.");
    }
  };

  return (
    <main className="senfxRiskPage">
      <header className="senfxRiskTopbar">
        <Link href="/" className="senfxRiskBrand">TRADE SCHEME <span>FX</span></Link>
        <nav aria-label="Risk center navigation">
          <Link href="/bot-settings">Bot settings</Link>
          <Link href="/bulk-trader">Bulk planner</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>
      <div className="senfxRiskWrap">
        <div className="senfxRiskHero">
          <div>
            <p className="senfxRiskEyebrow">SENFX · PLANNING LAB · PAPER ONLY</p>
            <h1>Risk <span>Command Center</span></h1>
            <p>Model full-stake losses, open-contract exposure and a daily loss budget before deciding whether a scenario fits your tolerance.</p>
          </div>
          <div className="senfxRiskSafety" role="note">
            <strong>Scenario calculator — not a trading engine</strong>
            <p>Nothing on this page connects to your Deriv balance, changes saved bot settings, enforces a stop or places an order.</p>
          </div>
        </div>

        <div className="senfxRiskLayout">
          <section className="senfxRiskInputs" aria-labelledby="risk-assumptions-heading">
            <div className="senfxRiskPanelHeading">
              <h2 id="risk-assumptions-heading">01 / Build a scenario</h2>
              <button type="button" onClick={() => { setValues(START); setCopyMessage(""); }}>
                Reset example
              </button>
            </div>
            <p className="senfxRiskHelper">USD values are illustrative, not pulled from your connected account.</p>
            <div className="senfxRiskForm">
              {fields.map(field => (
                <label key={field.key}>
                  <span>{field.label}</span>
                  <input type="number" inputMode={field.step === "1" ? "numeric" : "decimal"}
                    min={field.min} max={field.max} step={field.step}
                    value={values[field.key]}
                    onChange={event => set(field.key, event.target.value)} />
                  <small>{field.tip}</small>
                </label>
              ))}
            </div>
            <div className="senfxRiskPreset">
              <p>Try a stake as a fraction of example capital:</p>
              <div>
                <button type="button" onClick={() => preset(.5)} disabled={Number(values.capital) < 1}>0.5%</button>
                <button type="button" onClick={() => preset(1)} disabled={Number(values.capital) < 1}>1%</button>
                <button type="button" onClick={() => preset(2)} disabled={Number(values.capital) < 1}>2%</button>
              </div>
              <small>Examples only; these percentages are not automatically safe for every market or contract.</small>
            </div>
          </section>

          <section className="senfxRiskResults" aria-labelledby="risk-results-heading">
            <div className="senfxRiskPanelHeading">
              <h2 id="risk-results-heading">02 / Exposure assessment</h2>
              <span className="senfxRiskReadOnly">READ-ONLY</span>
            </div>
            {!plan ? (
              <div className="senfxRiskInvalid" role="alert">
                Enter a capital balance of at least $1, a stake between $0.01 and capital,
                a positive daily budget no larger than capital, 1–100 contracts and losses,
                and an assumed net payout above 0% and no more than 500%.
              </div>
            ) : (
              <>
                <div className="senfxRiskScore">
                  <span>Worst case: every open contract loses full stake</span>
                  <strong>{fmt(plan.grossExposure)}</strong>
                  <small>{pct(plan.exposurePercent)} of hypothetical starting capital</small>
                  <div className="senfxRiskMeter" role="meter"
                    aria-label="Hypothetical gross exposure as percentage of capital"
                    aria-valuemin={0} aria-valuemax={100}
                    aria-valuenow={Math.min(plan.exposurePercent, 100)}>
                    <div style={{ width: Math.min(100, plan.exposurePercent) + "%",
                      background: plan.breachCapital || plan.breachDailyBudget ? "#f59a80" : "#6ddec7" }} />
                  </div>
                  <p>Assumes simultaneous full-stake losses. Other costs are not modeled.</p>
                </div>
                <div className="senfxRiskKpis">
                  <article><span>Stake / capital</span><strong>{pct(plan.stakePercent)}</strong></article>
                  <article><span>Daily budget / capital</span><strong>{pct(plan.dailyBudgetPercent)}</strong></article>
                  <article><span>Full-stake losses within budget</span><strong>{plan.maxFullStakeLossesWithinBudget}</strong></article>
                  <article><span>Remaining budget after all open losses</span><strong>{fmt(plan.remainingBudgetAfterFullLosses)}</strong></article>
                </div>
                {(plan.breachDailyBudget || plan.breachCapital || plan.streakExceedsBudget) ? (
                  <div className="senfxRiskWarning" role="alert">
                    <strong>Scenario exceeds at least one planning boundary</strong>
                    {plan.breachDailyBudget && <p>Simultaneous full-stake exposure exceeds the entered daily loss budget.</p>}
                    {plan.breachCapital && <p>Simultaneous full-stake exposure exceeds the hypothetical account balance.</p>}
                    {plan.streakExceedsBudget && <p>The consecutive-loss scenario exceeds the entered daily loss budget.</p>}
                  </div>
                ) : (
                  <div className="senfxRiskWithin">
                    The modeled full-stake scenarios fit within the entered daily budget.
                    This does not make trading safe or enforce any protection.
                  </div>
                )}
                <div className="senfxRiskStreak">
                  <span>Full-stake loss streak ({values.lossStreak} losses)</span>
                  <strong>−{fmt(plan.sequentialLossAmount)}</strong>
                  <small>Hypothetical balance after streak: {fmt(plan.virtualBalanceAfterStreak)}</small>
                  <p>Sequential streak is a separate stress test. It is not added to simultaneous exposure.</p>
                </div>
                <div className="senfxRiskPayout">
                  <span>Break-even win frequency</span>
                  <strong>{pct(plan.breakEvenWinRatePercent)}</strong>
                  <small>Only if every losing contract loses 100% of stake, every winning contract earns {pct(plan.netPayoutPercent)} net, with no fees or slippage.</small>
                </div>
                <div className="senfxRiskActions">
                  <button type="button" onClick={() => void copySummary()}>Copy scenario summary</button>
                  <Link href="/bot-settings">Review saved bot preferences ↗</Link>
                </div>
                {copyMessage && <p className="senfxRiskCopyMessage" role="status">{copyMessage}</p>}
              </>
            )}
          </section>
        </div>

        {plan && (
          <section className="senfxRiskScenarios" aria-labelledby="risk-scenarios-heading">
            <div className="senfxRiskPanelHeading">
              <h2 id="risk-scenarios-heading">03 / Illustrative batch outcomes</h2>
              <span className="senfxRiskReadOnly">ASSUMPTIONS, NOT FORECASTS</span>
            </div>
            <p>These are arithmetic examples for {values.simultaneousContracts} contracts at the hypothetical net payout—not historical backtests or expected performance.</p>
            <div className="senfxRiskTableScroll">
              <table>
                <thead><tr><th scope="col">Winning contracts</th><th scope="col">Losing contracts</th><th scope="col">Batch net P/L</th><th scope="col">Ending virtual capital</th></tr></thead>
                <tbody>{plan.scenarios.map(item => (
                  <tr key={item.wins}>
                    <td>{item.wins}</td>
                    <td>{item.losses}</td>
                    <td className={item.netResult < 0 ? "senfxRiskNegative" : "senfxRiskPositive"}>
                      {item.netResult > 0 ? "+" : ""}{fmt(item.netResult)}
                    </td>
                    <td>{fmt(item.endingCapital)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        )}
        <p className="senfxRiskDisclaimer">
          Full-stake losses and fixed net payouts are hypothetical assumptions; actual contract terms may differ. Trading can lose capital.
          SENFX has not verified any strategy's win rate. These numbers are not trade instructions, profit forecasts, a live risk limit,
          or an assurance of protection. No Deriv API or account information is accessed by this calculator.
        </p>
      </div>
    </main>
  );
}
