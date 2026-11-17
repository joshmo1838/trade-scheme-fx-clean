"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PaperTrade = {
  id: string;
  bot_id: string;
  market_symbol: string;
  direction: string;
  entry_price: number;
  exit_price: number;
  stake_amount: number;
  pnl: number;
  outcome: string;
  opened_at: string;
  closed_at: string;
};
const currency = (value: number) => Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function CustomerPaperHistory() {
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [market, setMarket] = useState("all");
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        window.location.assign("/login");
        return;
      }
      const { data, error: fetchError } = await supabase.from("customer_paper_trades")
        .select("id,bot_id,market_symbol,direction,entry_price,exit_price,stake_amount,pnl,outcome,opened_at,closed_at")
        .eq("customer_id", user.id)
        .order("closed_at", { ascending: false })
        .limit(200);
      if (fetchError) throw fetchError;
      setTrades((data || []) as PaperTrade[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load saved paper history.");
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const symbols = useMemo(() => Array.from(new Set(trades.map(trade => trade.market_symbol))), [trades]);
  const visible = useMemo(() => market === "all" ? trades :
    trades.filter(trade => trade.market_symbol === market), [trades, market]);
  const pnl = visible.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
  const wins = visible.filter(trade => Number(trade.pnl || 0) > 0).length;

  return (
    <main className="appShell">
      <header className="dashNav">
        <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="button secondary small" href="/bot-center">Bot Center</Link>
          <Link className="button secondary small" href="/dashboard">Dashboard</Link>
        </div>
      </header>
      <section className="dashContent" style={{ maxWidth: 1150 }}>
        <p className="eyebrow">SENFX ACCOUNT · VERIFIABLE SAVED RECORDS</p>
        <h1>Paper trading history</h1>
        <p className="muted">These are your saved SENFX paper simulations—not purchases on Deriv and not trades that used your Demo or real-money balance. The latest 200 saved entries are shown.</p>
        <div className="actions" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <button className="button secondary small" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh saved history"}
          </button>
          <label className="fieldLabel">Market
            <select className="fieldInput" value={market} onChange={event => setMarket(event.target.value)}
              style={{ display: "block", minWidth: 160 }}>
              <option value="all">All recorded markets</option>
              {symbols.map(symbol => <option value={symbol} key={symbol}>{symbol}</option>)}
            </select>
          </label>
        </div>
        {error && <div className="notice" role="alert">{error}</div>}
        <div className="dashGrid" style={{ margin: "20px 0" }}>
          <article className="panel">
            <p className="eyebrow">SAVED PAPER CONTRACTS</p><h2>{visible.length}</h2>
          </article>
          <article className="panel">
            <p className="eyebrow">ILLUSTRATIVE PAPER P/L</p>
            <h2 style={{ color: pnl >= 0 ? "#49d5aa" : "#fa729b" }}>{currency(pnl)}</h2>
          </article>
          <article className="panel">
            <p className="eyebrow">OBSERVED WIN SHARE</p>
            <h2>{visible.length ? (wins / visible.length * 100).toFixed(1) + "%" : "—"}</h2>
          </article>
        </div>
        <section className="panel">
          <h2>Saved paper simulation results</h2>
          {loading ? <p className="muted">Loading verified account records…</p> :
           visible.length === 0 ? <p className="muted">No saved paper trades are available for this filter. Start a paper simulation from your Bot Center to create records.</p> :
           <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr>{["Date","Market","Direction","Entry","Exit","Virtual stake","Result","Paper P/L"].map(label =>
                  <th key={label} style={{ padding: 12, color: "#a5c3d9", borderBottom: "1px solid #254264" }}>{label}</th>
                )}</tr>
              </thead>
              <tbody>
                {visible.map(trade =>
                  <tr key={trade.id}>
                    <td style={{ padding: 12, borderBottom: "1px solid #193958", whiteSpace: "nowrap" }}>{new Date(trade.closed_at).toLocaleString()}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #193958" }}>{trade.market_symbol}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #193958" }}>{trade.direction}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #193958" }}>{Number(trade.entry_price).toFixed(3)}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #193958" }}>{Number(trade.exit_price).toFixed(3)}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #193958" }}>{currency(trade.stake_amount)}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #193958" }}>{trade.outcome}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #193958", color: Number(trade.pnl) >= 0 ? "#49d5aa" : "#fa729b" }}>{currency(trade.pnl)}</td>
                  </tr>
                )}
              </tbody>
            </table>
           </div>}
        </section>
        <p className="disclaimer">Paper P/L is based on SENFX's simplified illustrative model; it is not broker settlement and cannot be treated as demonstrated investment returns. Real and Demo Deriv contract history requires separately verified broker integration.</p>
      </section>
    </main>
  );
}
