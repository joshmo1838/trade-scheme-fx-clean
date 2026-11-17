"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Direction = "CALL" | "PUT";
type Config = { id: string; name: string; market: string; fast: number; slow: number; thresholdBps: number };
type PaperOutcome = { index: number; direction: Direction; entry: number; exit: number; pnl: number };
type Summary = {
  tradeCount: number; wins: number; losses: number; winRate: number | null;
  paperPnl: number; roi: number; maxDrawdown: number; endCapital: number;
  outcomes: PaperOutcome[];
};
type ResearchResult = {
  market: string; tickCount: number; train: Summary; test: Summary;
  firstEpoch: number | null; lastEpoch: number | null;
};
const STRATEGIES: Config[] = [
  { id: "synthetic", name: "SENFX Synthetic Pro · 9/21 SMA", market: "R_100", fast: 9, slow: 21, thresholdBps: .25 },
  { id: "trend", name: "Synthetic Trend Scout · 5/18 SMA", market: "R_50", fast: 5, slow: 18, thresholdBps: .35 },
  { id: "volatility", name: "Volatility Watch · 10/21 SMA", market: "R_75", fast: 10, slow: 21, thresholdBps: .45 },
];
const WS_URL = "wss://api.derivws.com/trading/v1/options/ws/public";
const TICK_SAMPLE = 1000;
const HOLD_TICKS = 5;

function evaluate(
  prices: number[], config: Config, virtualCapital: number, stake: number,
): Summary {
  let equity = virtualCapital;
  let peak = equity;
  let maxDrawdown = 0;
  const outcomes: PaperOutcome[] = [];
  const average = (values: number[]) =>
    values.reduce((sum, price) => sum + price, 0) / values.length;

  // Each signal uses only ticks up to index i. Entry uses the NEXT tick;
  // exit is five ticks later. Trades are non-overlapping.
  for (let i = config.slow; i + HOLD_TICKS + 1 < prices.length; i++) {
    if (outcomes.length >= 100) break;
    const fast = average(prices.slice(i - config.fast + 1, i + 1));
    const slow = average(prices.slice(i - config.slow + 1, i + 1));
    const spread = Math.abs(fast - slow) / Math.max(.000001, Math.abs(slow)) * 10000;
    if (spread < config.thresholdBps) continue;
    if (equity < stake) break;
    const direction: Direction = fast > slow ? "CALL" : "PUT";
    const entry = prices[i + 1];
    const exit = prices[i + 1 + HOLD_TICKS];
    const won = direction === "CALL" ? exit > entry : exit < entry;
    const pnl = won ? stake : -stake;
    equity += pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / Math.max(peak, .001) * 100);
    outcomes.push({ index: i, direction, entry, exit, pnl });
    i += HOLD_TICKS + 1;
  }

  const wins = outcomes.filter(outcome => outcome.pnl > 0).length;
  return {
    tradeCount: outcomes.length,
    wins,
    losses: outcomes.length - wins,
    winRate: outcomes.length ? wins / outcomes.length * 100 : null,
    paperPnl: equity - virtualCapital,
    roi: (equity - virtualCapital) / virtualCapital * 100,
    maxDrawdown,
    endCapital: equity,
    outcomes,
  };
}

function ResultCard({ title, data }: { title: string; data: Summary }) {
  return (
    <article className="panel" style={{ flex: "1 1 280px", minWidth: 0 }}>
      <p className="eyebrow">{title}</p>
      <h2>{data.tradeCount} paper tests</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14, marginTop: 18 }}>
        {[
          ["Illustrative win rate", data.winRate === null ? "—" : data.winRate.toFixed(1) + "%"],
          ["Illustrative P/L", (data.paperPnl >= 0 ? "+" : "") + data.paperPnl.toFixed(2)],
          ["Illustrative ROI", (data.roi >= 0 ? "+" : "") + data.roi.toFixed(1) + "%"],
          ["Maximum drawdown", data.maxDrawdown.toFixed(1) + "%"],
        ].map(item => (
          <div key={item[0]} style={{ border: "1px solid #244262", borderRadius: 9, padding: 12 }}>
            <small style={{ color: "#9dc4d8" }}>{item[0]}</small>
            <strong style={{ display: "block", color: "#eafaff", marginTop: 5, fontSize: 19 }}>{item[1]}</strong>
          </div>
        ))}
      </div>
      {data.tradeCount < 30 && <p className="muted" style={{ color: "#f1c37d" }}>
        Small sample: not enough trades to evaluate strategy reliability.
      </p>}
    </article>
  );
}

export default function StrategyBacktestLab() {
  const [strategyId, setStrategyId] = useState("synthetic");
  const [capitalText, setCapitalText] = useState("500");
  const [stakeText, setStakeText] = useState("5");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("Choose a strategy and request a public tick history sample.");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const config = STRATEGIES.find(item => item.id === strategyId) || STRATEGIES[0];

  useEffect(() => {
    return () => {
      const ws = socketRef.current;
      socketRef.current = null;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close();
    };
  }, []);

  function runTest() {
    if (running) return;
    const virtualCapital = Number(capitalText);
    const stake = Number(stakeText);
    if (!Number.isFinite(virtualCapital) || virtualCapital <= 0 ||
        !Number.isFinite(stake) || stake <= 0 || stake > virtualCapital * .05) {
      setMessage("Use a positive virtual capital and a stake no larger than 5% of that capital.");
      return;
    }
    setRunning(true);
    setResult(null);
    setMessage("Requesting historical public Deriv ticks. No account connection or order is required.");
    let finished = false;
    try {
      const socket = new WebSocket(WS_URL);
      socketRef.current = socket;
      const timeout = window.setTimeout(() => {
        if (!finished) finishWithError("Public tick history request timed out.");
      }, 15000);
      function close() {
        window.clearTimeout(timeout);
        socketRef.current = null;
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close();
      }
      function finishWithError(error: string) {
        if (finished) return;
        finished = true;
        close();
        setRunning(false);
        setMessage(error);
      }
      socket.onopen = () => {
        socket.send(JSON.stringify({
          ticks_history: config.market,
          count: TICK_SAMPLE,
          end: "latest",
          style: "ticks",
        }));
      };
      socket.onmessage = event => {
        if (finished) return;
        let data: any;
        try { data = JSON.parse(String(event.data)); } catch { return; }
        if (data.error) {
          finishWithError("Deriv history error: " + String(data.error.message || data.error.code || "Unavailable"));
          return;
        }
        if (data.msg_type !== "history" || !Array.isArray(data.history?.prices)) return;
        const prices: number[] = data.history.prices.map(Number);
        if (prices.length < 150 || prices.some(price => !Number.isFinite(price) || price <= 0)) {
          finishWithError("Deriv did not return enough valid historical ticks to evaluate this strategy.");
          return;
        }
        const split = Math.floor(prices.length * .6);
        const times = Array.isArray(data.history.times) ? data.history.times.map(Number) : [];
        const train = evaluate(prices.slice(0, split), config, virtualCapital, stake);
        const test = evaluate(prices.slice(split), config, virtualCapital, stake);
        finished = true;
        close();
        setResult({
          market: config.market,
          tickCount: prices.length,
          train, test,
          firstEpoch: times.length ? times[0] : null,
          lastEpoch: times.length ? times[times.length - 1] : null,
        });
        setRunning(false);
        setMessage("Historical research completed. These are simulated outcomes, NOT verified Deriv contract returns.");
      };
      socket.onerror = () => finishWithError("Public Deriv market history connection failed.");
      socket.onclose = () => {
        if (!finished) finishWithError("History connection closed before enough data arrived.");
      };
    } catch {
      socketRef.current = null;
      setRunning(false);
      setMessage("Could not connect to the public Deriv history stream.");
    }
  }

  return <main className="appShell">
    <header className="dashNav">
      <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
      <div className="actions"><Link className="button secondary small" href="/bot-center">Bot Center</Link><Link className="button secondary small" href="/dashboard">Dashboard</Link></div>
    </header>
    <section className="dashContent" style={{ maxWidth: 1160 }}>
      <p className="eyebrow">SENFX RESEARCH · PAPER ONLY</p>
      <h1>Strategy performance research</h1>
      <p className="muted">Compare existing paper-bot entry rules on historical Deriv public ticks with a chronological 60% development / 40% holdout split. Prices are observed; hypothetical outcomes use a simplified 1:1 stake payoff, not Deriv quotes, fees or settlements.</p>
      <div className="notice"><b>Performance safeguard:</b> 70–100% returns are not established or promised. A favorable backtest can still lose money in live or Demo trading. Evaluate drawdown and out-of-sample results, not headline ROI alone.</div>
      <div className="panel" style={{ marginTop: 21 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "end" }}>
          <label className="fieldLabel">Paper strategy
            <select className="fieldInput" value={strategyId} disabled={running}
              onChange={e => { setStrategyId(e.target.value); setResult(null); }}
              style={{ display: "block", minWidth: 255 }}>
              {STRATEGIES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="fieldLabel">Example virtual capital
            <input className="fieldInput" type="number" min="10" step="10"
              value={capitalText} onChange={e => setCapitalText(e.target.value)} style={{ display: "block", width: 140 }}/>
          </label>
          <label className="fieldLabel">Virtual stake per trade
            <input className="fieldInput" type="number" min="0.35" step="0.25"
              value={stakeText} onChange={e => setStakeText(e.target.value)} style={{ display: "block", width: 135 }}/>
          </label>
          <button className="button" disabled={running} onClick={runTest}>
            {running ? "Testing historical ticks…" : "Run paper backtest"}
          </button>
        </div>
        <p role="status" className="muted" style={{ marginTop: 18 }}>{message}</p>
        <p className="muted">Preset: {config.market} · {config.fast}/{config.slow} simple moving averages · minimum separation {config.thresholdBps.toFixed(2)} basis points · five-tick observed exit. No automated broker trading.</p>
      </div>
      {result && (
        <>
          <div className="panel" style={{ marginTop: 17 }}>
            <h2>Observed market-data sample</h2>
            <p className="muted">{result.tickCount} actual tick prices for {result.market}.
              {result.firstEpoch !== null && result.lastEpoch !== null ?
                " Sample window: " + new Date(result.firstEpoch * 1000).toLocaleString() + " to " + new Date(result.lastEpoch * 1000).toLocaleString() : ""}
              {" "}Entry occurs on the tick after the signal. Positions do not overlap.
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 17 }}>
            <ResultCard title="FIRST 60% · DEVELOPMENT SAMPLE" data={result.train}/>
            <ResultCard title="FINAL 40% · HOLDOUT SAMPLE" data={result.test}/>
          </div>
          <section className="panel" style={{ marginTop: 18 }}>
            <h2>Most recent holdout paper outcomes</h2>
            {result.test.outcomes.length === 0 ? <p className="muted">No rule-qualified entries in this holdout sample.</p> :
              <div style={{ overflowX: "auto" }}>
                <table style={{ minWidth: 650, width: "100%", textAlign: "left" }}>
                  <thead><tr><th>Signal tick</th><th>Direction</th><th>Entry</th><th>Exit</th><th>Illustrative P/L</th></tr></thead>
                  <tbody>{result.test.outcomes.slice(-15).map(item =>
                    <tr key={item.index}>
                      <td>{item.index}</td>
                      <td>{item.direction}</td>
                      <td>{item.entry.toFixed(4)}</td>
                      <td>{item.exit.toFixed(4)}</td>
                      <td style={{ color: item.pnl >= 0 ? "#32dba8" : "#f27794" }}>{item.pnl > 0 ? "+" : ""}{item.pnl.toFixed(2)}</td>
                    </tr>
                  )}</tbody>
                </table>
              </div>}
          </section>
        </>
      )}
      <p className="disclaimer">A 1,000-tick lookback is a limited sample and these are not real broker profits. There is no execution slippage, variable Deriv payout, commissions, or account-specific contract availability in this model. Repeatedly selecting favorable results can overfit; paper research is not evidence of future returns.</p>
    </section>
  </main>;
}
