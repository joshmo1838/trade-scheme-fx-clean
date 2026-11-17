"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Direction = "CALL" | "PUT";
type PaperPosition = {
  id: number;
  market: string;
  direction: Direction;
  stake: number;
  entry: number;
  ticksRemaining: number;
  createdAt: number;
};
type PaperResult = PaperPosition & { exit: number; profit: number; won: boolean; closedAt: number };

const MARKETS = [
  { symbol: "R_10", name: "Volatility 10 Index" },
  { symbol: "R_25", name: "Volatility 25 Index" },
  { symbol: "R_50", name: "Volatility 50 Index" },
  { symbol: "R_75", name: "Volatility 75 Index" },
  { symbol: "R_100", name: "Volatility 100 Index" },
];
const WS_URL = "wss://api.derivws.com/trading/v1/options/ws/public";
const MAX_SESSION_LOSS = 20;
const MAX_SESSION_TRADES = 20;
const TICKS_PER_PRACTICE = 5;

export default function ManualPaperTicket() {
  const [market, setMarket] = useState("R_100");
  const [stakeText, setStakeText] = useState("2");
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState("Connecting to the public Deriv tick stream…");
  const [connected, setConnected] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [active, setActive] = useState<PaperPosition | null>(null);
  const [trades, setTrades] = useState<PaperResult[]>([]);
  const lastPrice = useRef<number | null>(null);
  const position = useRef<PaperPosition | null>(null);
  const nextId = useRef(1);
  const risk = useRef({ losses: 0, trades: 0 });

  useEffect(() => {
    let mounted = true;
    let opened = false;
    setConnected(false);
    setPrice(null);
    lastPrice.current = null;
    setStatus("Connecting to public Deriv market data…");

    const ws = new WebSocket(WS_URL);
    const timeout = window.setTimeout(() => {
      if (mounted && !opened) {
        setStatus("Public tick connection timed out. Try reconnecting.");
        ws.close();
      }
    }, 12_000);

    ws.onopen = () => {
      if (!mounted) return;
      opened = true;
      window.clearTimeout(timeout);
      ws.send(JSON.stringify({ ticks: market, subscribe: 1 }));
      setConnected(true);
      setStatus("Public tick feed connected — paper practice only.");
    };

    ws.onmessage = event => {
      if (!mounted) return;
      let message: any;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.error) {
        setStatus("Deriv public data error: " + String(message.error.message || message.error.code || "Unknown error"));
        ws.close();
        return;
      }
      if (message.msg_type !== "tick" || !message.tick ||
          (message.tick.symbol && message.tick.symbol !== market)) return;
      const nextPrice = Number(message.tick.quote);
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) return;
      lastPrice.current = nextPrice;
      setPrice(nextPrice);

      const openPosition = position.current;
      if (!openPosition) return;
      const ticksRemaining = openPosition.ticksRemaining - 1;
      if (ticksRemaining > 0) {
        const updated = { ...openPosition, ticksRemaining };
        position.current = updated;
        setActive(updated);
        return;
      }

      // Intentional simplified 1:1 outcome, NOT a broker payout or verified trade.
      const won = openPosition.direction === "CALL" ?
        nextPrice > openPosition.entry : nextPrice < openPosition.entry;
      const profit = won ? openPosition.stake : -openPosition.stake;
      const result: PaperResult = {
        ...openPosition,
        ticksRemaining: 0,
        exit: nextPrice,
        won,
        profit,
        closedAt: Date.now(),
      };
      risk.current.trades += 1;
      if (profit < 0) risk.current.losses += -profit;
      position.current = null;
      setActive(null);
      setTrades(previous => [result, ...previous].slice(0, MAX_SESSION_TRADES));
      if (risk.current.losses >= MAX_SESSION_LOSS ||
          risk.current.trades >= MAX_SESSION_TRADES) {
        setStatus("Paper session guardrail reached. Reset session before practicing again.");
      } else {
        setStatus("Paper position settled locally. Review the observed result.");
      }
    };

    ws.onerror = () => {
      if (mounted) setStatus("Market feed error. Please retry the connection.");
    };
    ws.onclose = () => {
      if (!mounted) return;
      setConnected(false);
      if (position.current) {
        position.current = null;
        setActive(null);
        setStatus("Feed disconnected; unsettled paper practice was canceled without counting a result.");
      } else {
        setStatus(previous => previous.includes("error") || previous.includes("timed out") ?
          previous : "Public feed disconnected. Retry to reconnect.");
      }
    };

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    };
  }, [market, retry]);

  function openPaper(direction: Direction) {
    const stake = Number(stakeText);
    if (!connected || lastPrice.current === null || position.current !== null) {
      setStatus("Wait for a current public quote and an available paper ticket.");
      return;
    }
    if (!Number.isFinite(stake) || stake < 0.35 || stake > 10) {
      setStatus("Choose a virtual paper stake between 0.35 and 10 units.");
      return;
    }
    if (risk.current.losses + stake > MAX_SESSION_LOSS ||
        risk.current.trades >= MAX_SESSION_TRADES) {
      setStatus("Paper session risk guardrail reached. Reset to start another learning session.");
      return;
    }
    const opened: PaperPosition = {
      id: nextId.current++,
      market, direction, entry: lastPrice.current,
      stake, ticksRemaining: TICKS_PER_PRACTICE, createdAt: Date.now(),
    };
    position.current = opened;
    setActive(opened);
    setStatus("A paper-only " + direction + " ticket was opened at the last observed public price. No Deriv purchase was sent.");
  }

  function resetSession() {
    if (position.current) {
      setStatus("Let the open paper ticket close before resetting.");
      return;
    }
    risk.current = { losses: 0, trades: 0 };
    setTrades([]);
    setStatus("Paper session reset. This did not affect any Deriv account.");
  }

  const sessionProfit = trades.reduce((sum, trade) => sum + trade.profit, 0);
  const locked = !connected || price === null || active !== null ||
    risk.current.losses >= MAX_SESSION_LOSS || risk.current.trades >= MAX_SESSION_TRADES;

  return (
    <main className="appShell">
      <header className="dashNav">
        <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
        <div className="actions">
          <Link className="button secondary small" href="/charts">Market charts</Link>
          <Link className="button secondary small" href="/dashboard">Dashboard</Link>
        </div>
      </header>
      <section className="dashContent" style={{ maxWidth: 1060 }}>
        <p className="eyebrow">SENFX TRADING WORKSPACE · MANUAL LEARNING</p>
        <h1>Manual paper trader</h1>
        <p className="muted">
          Practice five-tick Rise/Fall decisions using public Deriv prices.
          The simulated P/L assumes an illustrative 1:1 win/loss payoff; it is
          NOT a broker contract, a Deriv Demo purchase, or an executable quote.
        </p>
        <div className="notice">
          <strong>PAPER PRACTICE ONLY.</strong> This page cannot access your Demo or real-money balance.
          A manually authorized Deriv Demo order requires the separate gated Demo execution integration.
        </div>
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="actions" style={{ flexWrap: "wrap", gap: 16, alignItems: "end" }}>
            <label className="fieldLabel">Market
              <select className="fieldInput" style={{ display: "block", minWidth: 190 }}
                disabled={active !== null} value={market} onChange={e => setMarket(e.target.value)}>
                {MARKETS.map(item => <option value={item.symbol} key={item.symbol}>{item.name}</option>)}
              </select>
            </label>
            <label className="fieldLabel">Virtual stake (account-independent units)
              <input type="number" className="fieldInput" min="0.35" max="10" step="0.01"
                style={{ display: "block", maxWidth: 200 }} value={stakeText}
                disabled={active !== null} onChange={e => setStakeText(e.target.value)} />
            </label>
            <button className="button secondary small" disabled={active !== null}
              onClick={() => setRetry(previous => previous + 1)}>Reconnect feed</button>
          </div>
          <div className="dashGrid" style={{ marginTop: 22 }}>
            <article className="panel"><p className="eyebrow">LAST PUBLIC PRICE</p><h2>{price === null ? "—" : price.toLocaleString("en-US", { maximumFractionDigits: 5 })}</h2></article>
            <article className="panel"><p className="eyebrow">LOCAL PAPER P/L</p><h2 style={{ color: sessionProfit >= 0 ? "#39d0a4" : "#ed668f" }}>{sessionProfit.toFixed(2)}</h2></article>
            <article className="panel"><p className="eyebrow">GROSS PAPER LOSSES</p><h2>{risk.current.losses.toFixed(2)} / {MAX_SESSION_LOSS}</h2></article>
            <article className="panel"><p className="eyebrow">SESSION TRADES</p><h2>{risk.current.trades} / {MAX_SESSION_TRADES}</h2></article>
          </div>
          <p role="status" className="muted">{status}</p>
          <div className="actions" style={{ gap: 14, flexWrap: "wrap" }}>
            <button className="button" disabled={locked} onClick={() => openPaper("CALL")}>Practice Rise ↑</button>
            <button className="button secondary" disabled={locked} onClick={() => openPaper("PUT")}>Practice Fall ↓</button>
            <button className="button secondary" disabled={active !== null} onClick={resetSession}>Reset learning session</button>
          </div>
          {active && (
            <div className="notice" style={{ marginTop: 16 }} role="status">
              OPEN PAPER TICKET · {active.direction} · Entry {active.entry.toFixed(5)} ·
              {active.ticksRemaining} more received ticks · Virtual stake {active.stake.toFixed(2)}
            </div>
          )}
        </div>
        <section className="panel" style={{ marginTop: 18 }}>
          <h2>Observed paper outcomes</h2>
          <p className="muted">Results are stored in this browser page only, not in Supabase or Deriv.</p>
          {!trades.length ? <p className="muted">No completed paper tickets yet.</p> :
            <div style={{ overflowX: "auto" }}>
              <table style={{ minWidth: 670, width: "100%", textAlign: "left" }}>
                <thead><tr>{["Time","Direction","Entry","Exit","Outcome","Paper P/L"].map(x => <th key={x}>{x}</th>)}</tr></thead>
                <tbody>{trades.map(t => (
                  <tr key={t.id}>
                    <td>{new Date(t.closedAt).toLocaleTimeString()}</td>
                    <td>{t.direction}</td>
                    <td>{t.entry.toFixed(5)}</td>
                    <td>{t.exit.toFixed(5)}</td>
                    <td>{t.won ? "WIN" : "LOSS"}</td>
                    <td style={{ color: t.won ? "#38ddb2" : "#f27295" }}>{t.profit > 0 ? "+" : ""}{t.profit.toFixed(2)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
        </section>
        <p className="disclaimer">
          A strategy cannot be judged on a handful of trades. Broker payouts,
          price execution, costs and losses may differ materially from these
          educational illustrations. No returns are promised.
        </p>
      </section>
    </main>
  );
}
