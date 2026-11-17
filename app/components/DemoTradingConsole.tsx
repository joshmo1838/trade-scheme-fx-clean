"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Risk = {
  dailyLoss: number;
  reservedLoss: number;
  dailyLossLimit: number;
  remainingLossBudget: number;
};
type DemoAccount = {
  accountId: string;
  accountType: "demo";
  currency: string;
  balance: number;
};
type Quote = {
  orderId: string;
  askPrice: number;
  payout: number;
  longcode: string;
  currency: string;
  marketSymbol: string;
  direction: "CALL" | "PUT";
  durationMinutes: number;
  stakeAmount: number;
};
type ActiveOrder = {
  id: string;
  status: string;
  contract_id?: string | null;
  market_symbol?: string;
  contract_type?: string;
  stake_amount?: number;
  currency?: string;
};
type ContractStatus = {
  status: string;
  profit: number;
  isValidToSell: boolean;
};

const API = "/api/deriv/demo/orders";
const DEMO_STAKE = 10;
const MARKETS = [
  { value: "R_10", label: "Volatility 10 Index" },
  { value: "R_25", label: "Volatility 25 Index" },
  { value: "R_50", label: "Volatility 50 Index" },
  { value: "R_75", label: "Volatility 75 Index" },
  { value: "R_100", label: "Volatility 100 Index" },
  { value: "frxEURUSD", label: "EUR/USD" },
];

export default function DemoTradingConsole() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [risk, setRisk] = useState<Risk>({
    dailyLoss: 0,
    reservedLoss: 0,
    dailyLossLimit: 20,
    remainingLossBudget: 20,
  });
  const [market, setMarket] = useState("R_100");
  const [direction, setDirection] = useState<"CALL" | "PUT">("CALL");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [contract, setContract] = useState<ContractStatus | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(API, { cache: "no-store", credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok || !data.enabled) {
        setEnabled(false);
        setReady(false);
        setAccount(null);
        setActiveOrder(data.activeOrder || null);
        throw new Error(data.error || "Connect Deriv and select an active Demo account from your dashboard first.");
      }

      setEnabled(true);
      setReady(true);
      setAccount(data.account);
      setRisk({
        dailyLoss: Number(data.dailyLoss || 0),
        reservedLoss: Number(data.reservedLoss || 0),
        dailyLossLimit: Number(data.dailyLossLimit || 20),
        remainingLossBudget: Number(data.remainingLossBudget ?? 20),
      });
      setHistory(data.orders || []);
      setActiveOrder(data.activeOrder || null);
      if (!data.activeOrder) setContract(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Demo execution.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const checkOrderStatus = useCallback(async (orderId: string) => {
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "status", orderId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not verify the Demo contract.");

      if (result.settled) {
        setRisk({
          dailyLoss: Number(result.dailyLoss || 0),
          reservedLoss: Number(result.reservedLoss || 0),
          dailyLossLimit: Number(result.dailyLossLimit || 20),
          remainingLossBudget: Number(result.remainingLossBudget || 0),
        });
        setMessage(
          "Deriv contract finished. Final result: " +
          (Number(result.profit) >= 0 ? "+" : "") +
          Number(result.profit).toFixed(2) + " " + (account?.currency || "") +
          ". The Demo risk ledger was updated."
        );
        setActiveOrder(null);
        setContract(null);
        setQuote(null);
        await refresh();
        return;
      }

      setContract({
        status: String(result.contractStatus || "open"),
        profit: Number(result.currentProfit || 0),
        isValidToSell: result.isValidToSell === true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check the Demo contract.");
    }
  }, [account, refresh]);

  useEffect(() => {
    if (!activeOrder || activeOrder.status !== "open") return;
    const interval = window.setInterval(() => { void checkOrderStatus(activeOrder.id); }, 4_000);
    return () => window.clearInterval(interval);
  }, [activeOrder, checkOrderStatus]);

  async function requestQuote() {
    if (!ready || busy || activeOrder || risk.remainingLossBudget < DEMO_STAKE) return;
    setBusy(true);
    setError("");
    setMessage("");
    setQuote(null);
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "quote", marketSymbol: market, direction }),
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.orderId || !result.quote) {
        throw new Error(result.error || "Could not get a verified Deriv Demo price.");
      }
      setQuote({ orderId: result.orderId, ...result.quote });
      setMessage("SENFX obtained and saved this price from Deriv. Review the terms before confirming.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get a Deriv quote.");
    } finally {
      setBusy(false);
    }
  }

  async function buyDemoContract() {
    if (!quote || !ready || busy || activeOrder || risk.remainingLossBudget < DEMO_STAKE) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "buy", orderId: quote.orderId }),
      });
      const result = await response.json();

      if (result.quoteChanged && result.quote) {
        setQuote({ orderId: quote.orderId, ...result.quote });
        setMessage("Deriv's latest price or payout changed. Review the updated terms and confirm again.");
        return;
      }

      if (!response.ok || !result.success) {
        await refresh();
        throw new Error(result.error || "The Demo purchase was not confirmed.");
      }

      setRisk({
        dailyLoss: Number(result.risk?.dailyLoss ?? risk.dailyLoss),
        reservedLoss: Number(result.risk?.reservedLoss ?? risk.reservedLoss),
        dailyLossLimit: Number(result.risk?.dailyLossLimit ?? risk.dailyLossLimit),
        remainingLossBudget: Number(result.risk?.remainingLossBudget ?? risk.remainingLossBudget),
      });
      setActiveOrder({
        id: result.orderId,
        status: "open",
        contract_id: result.contractId,
        market_symbol: quote.marketSymbol,
        contract_type: quote.direction,
        stake_amount: quote.stakeAmount,
        currency: quote.currency,
      });
      setQuote(null);
      setMessage("Deriv confirmed your Demo contract. SENFX is checking its status from the server.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo purchase did not complete.");
    } finally {
      setBusy(false);
    }
  }

  async function reconcileUnknownOrder() {
    if (!activeOrder || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "reconcile", orderId: activeOrder.id }),
      });
      const result = await response.json();
      if (result.state === "rejected" && result.success) {
        setActiveOrder(null);
        setContract(null);
        setQuote(null);
        setMessage(result.reason || "Deriv confirms no contract was purchased. The reservation was released.");
        await refresh();
        return;
      }
      if (!response.ok || !result.success || result.state !== "open") {
        throw new Error(result.error || result.reason || "Purchase remains unresolved. Risk is still reserved. Do not retry.");
      }
      setActiveOrder({
        ...activeOrder,
        status: "open",
        contract_id: result.contractId,
      });
      setMessage("Deriv statement and contract details confirm the existing Demo purchase. No second buy was sent.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reconcile the existing Demo purchase.");
    } finally {
      setBusy(false);
    }
  }

  async function sellDemoContract() {
    if (!activeOrder || !contract?.isValidToSell || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "sell", orderId: activeOrder.id }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not sell the Demo contract.");
      if (result.settled) {
        setRisk({
          dailyLoss: Number(result.dailyLoss || 0),
          reservedLoss: Number(result.reservedLoss || 0),
          dailyLossLimit: Number(result.dailyLossLimit || 20),
          remainingLossBudget: Number(result.remainingLossBudget || 0),
        });
        setActiveOrder(null);
        setContract(null);
        setMessage("Demo contract sold and settled. Result: " +
          (Number(result.profit) >= 0 ? "+" : "") +
          Number(result.profit).toFixed(2) + " " + (account?.currency || "") + ".");
      } else {
        setMessage("Deriv accepted the sell request. SENFX is verifying the final contract status.");
        await checkOrderStatus(activeOrder.id);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sell the Demo contract.");
    } finally {
      setBusy(false);
    }
  }

  const locked = Boolean(activeOrder) || risk.remainingLossBudget < DEMO_STAKE;
  const openProfit = contract ? Number(contract.profit) : null;

  return (
    <main className="workspaceShell" style={{ minHeight: "100vh" }}>
      <div className="workspaceMain" style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 22px" }}>
        <div className="workspaceWelcome">
          <div>
            <p className="workspaceEyebrow">SENFX EXECUTION · PHASE 1</p>
            <h1>Deriv <span>Demo Trading</span></h1>
            <p>Manual Demo contracts, verified and executed by SENFX's server. The browser never receives your authenticated Deriv trading session.</p>
          </div>
          <div className="workspaceModeBadge"><span /> DEMO ONLY</div>
        </div>

        {error && <p role="alert" style={{ color: "#f87171", padding: 12, background: "rgba(127,29,29,.18)", borderRadius: 10 }}>{error}</p>}
        {message && <p role="status" style={{ color: "#86efac", padding: 12, background: "rgba(20,83,45,.18)", borderRadius: 10 }}>{message}</p>}

        {!ready && (
          <section className="workspacePanel">
            <p className="workspaceEyebrow">DERIV DEMO ACCOUNT REQUIRED</p>
            <h2>Connect and select your Demo account</h2>
            <p className="muted">Open your dashboard to connect Deriv and select an active Demo account. Real accounts cannot be used by this execution workflow.</p>
            <Link href="/dashboard" className="workspacePrimaryButton">Open Dashboard ↗</Link>
            <button className="button secondary" style={{ marginLeft: 10 }} onClick={() => void refresh()} disabled={busy}>Check connection</button>
          </section>
        )}

        <section className="workspaceMarketStrip" aria-label="Demo risk status">
          <div><small>DEMO ACCOUNT</small><strong>{account ? account.accountId : "Not verified"}</strong></div>
          <div><small>ACCOUNT BALANCE</small><strong>{account ? Number(account.balance).toFixed(2) + " " + account.currency : "—"}</strong></div>
          <div><small>TODAY'S REALIZED LOSS</small><strong>{risk.dailyLoss.toFixed(2)} {account?.currency || ""}</strong></div>
          <div><small>OPEN RISK RESERVED</small><strong>{risk.reservedLoss.toFixed(2)} {account?.currency || ""}</strong></div>
        </section>

        <section className="workspaceAccountGrid" style={{ marginTop: 18 }}>
          <article className="workspacePanel">
            <div className="workspacePanelTop">
              <div><p className="workspaceEyebrow">DAILY DEMO LOSS CAP</p><h2>{risk.remainingLossBudget.toFixed(2)} / {risk.dailyLossLimit.toFixed(2)} {account?.currency || ""} remaining</h2></div>
              <span className={risk.remainingLossBudget >= DEMO_STAKE ? "workspaceStatusDot online" : "workspaceStatusDot"} />
            </div>
            <div style={{ height: 9, borderRadius: 10, background: "#1f2937", overflow: "hidden", margin: "14px 0" }}>
              <div style={{ width: Math.min(100, (risk.dailyLoss + risk.reservedLoss) / Math.max(1, risk.dailyLossLimit) * 100) + "%", height: "100%", background: risk.remainingLossBudget >= DEMO_STAKE ? "#16a34a" : "#dc2626" }} />
            </div>
            <p className="muted">SENFX reserves the full 10 {account?.currency || "account-currency units"} stake before each contract. Wins do not restore the gross-loss budget. This ledger covers trades sent through SENFX, not trades placed directly on Deriv outside SENFX.</p>
          </article>

          <article className="workspacePanel">
            <p className="workspaceEyebrow">SERVER-SIDE DEMO AUTHORIZATION</p>
            <h3>{ready ? "Demo account verified" : "Demo account not ready"}</h3>
            <p className="muted">SENFX obtains short-lived Deriv sessions on the server only. The browser cannot send direct trading commands or bypass the risk reservation.</p>
            <button className="workspacePrimaryButton" onClick={() => void refresh()} disabled={busy}>
              {busy ? "Checking…" : "Refresh Demo account status"}
            </button>
            <p className="muted" style={{ marginTop: 10 }}>{account ? "Selected account: DEMO · " + account.currency : "Select an active Demo account from the dashboard first."}</p>
          </article>
        </section>

        <section className="workspacePanel" style={{ marginTop: 18 }}>
          <p className="workspaceEyebrow">MANUAL DEMO CONTRACT TEST</p>
          <h2>Request a price and confirm one Demo trade</h2>
          <p className="muted">Review each server-verified Deriv quote. Confirming starts a fresh authenticated server session, rechecks the price and payout, reserves risk, and buys the fresh proposal on the same session. Fixed stake 10, five-minute Rise/Fall, one open position, daily gross-loss cap 20.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginTop: 18 }}>
            <label className="muted">Market
              <select value={market} onChange={e => { setMarket(e.target.value); setQuote(null); }} disabled={!ready || busy || Boolean(activeOrder)} className="workspaceInput" style={{ display: "block", width: "100%", marginTop: 7 }}>
                {MARKETS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="muted">Direction
              <select value={direction} onChange={e => { setDirection(e.target.value as "CALL" | "PUT"); setQuote(null); }} disabled={!ready || busy || Boolean(activeOrder)} className="workspaceInput" style={{ display: "block", width: "100%", marginTop: 7 }}>
                <option value="CALL">Rise (CALL)</option>
                <option value="PUT">Fall (PUT)</option>
              </select>
            </label>
            <label className="muted">Stake
              <input value={"10 " + (account?.currency || "")} readOnly className="workspaceInput" style={{ display: "block", width: "100%", marginTop: 7 }} />
            </label>
            <label className="muted">Duration
              <input value="5 minutes" readOnly className="workspaceInput" style={{ display: "block", width: "100%", marginTop: 7 }} />
            </label>
          </div>

          {!quote ? (
            <button className="workspacePrimaryButton" onClick={() => void requestQuote()} disabled={!ready || busy || locked}>
              {busy ? "Working…" : "Get Deriv price"}
            </button>
          ) : (
            <div style={{ border: "1px solid #2563eb", borderRadius: 12, padding: 16, marginTop: 18 }}>
              <p className="workspaceEyebrow">SERVER-VERIFIED DERIV PROPOSAL · REVIEW BEFORE PURCHASE</p>
              <h3>Stake {quote.askPrice.toFixed(2)} {quote.currency}</h3>
              <p>Potential payout shown by Deriv: <strong>{quote.payout.toFixed(2)} {quote.currency}</strong></p>
              <p className="muted">{quote.longcode}</p>
              <button className="workspacePrimaryButton" onClick={() => void buyDemoContract()} disabled={busy || !ready || locked}>
                {busy ? "Submitting…" : "Confirm and buy on DEMO"}
              </button>
              <button className="button secondary" style={{ marginLeft: 10 }} onClick={() => setQuote(null)} disabled={busy}>Cancel quote</button>
            </div>
          )}
        </section>

        {activeOrder && (
          <section className="workspacePanel" style={{ marginTop: 18 }}>
            <p className="workspaceEyebrow">ACTIVE DEMO CONTRACT</p>
            <h2>{activeOrder.market_symbol} · {activeOrder.contract_type}</h2>
            {activeOrder.status === "buy_unknown" || activeOrder.status === "reserved" ? (
              <>
                <p role="alert">Purchase confirmation is unresolved. The 10 {account?.currency || ""} risk remains reserved. SENFX checks Deriv's account statement before releasing it. Do not retry the purchase.</p>
                <button className="workspacePrimaryButton" onClick={() => void reconcileUnknownOrder()} disabled={busy}>
                  {busy ? "Checking…" : "Check Deriv statement"}
                </button>
              </>
            ) : (
              <>
                <p>Contract ID: {activeOrder.contract_id || "—"}</p>
                <p>Status: {contract?.status || "Checking Deriv…"} · Current profit/loss: {openProfit === null ? "Waiting for server update…" : (openProfit >= 0 ? "+" : "") + openProfit.toFixed(2) + " " + (account?.currency || "")}</p>
                <button className="button secondary" onClick={() => void sellDemoContract()} disabled={!contract?.isValidToSell || busy}>
                  {busy ? "Working…" : "Sell early at Deriv market price"}
                </button>
                <button className="button secondary" style={{ marginLeft: 10 }} onClick={() => void checkOrderStatus(activeOrder.id)} disabled={busy}>Refresh status</button>
              </>
            )}
          </section>
        )}

        <section className="workspacePanel" style={{ marginTop: 18 }}>
          <div className="workspaceSectionHeading">
            <div><p className="workspaceEyebrow">AUDIT TRAIL</p><h2>Recent Demo contracts</h2></div>
            <button className="button secondary" onClick={() => void refresh()} disabled={busy}>Refresh</button>
          </div>
          {history.length === 0 ? <p className="muted">No SENFX Demo contracts have been recorded yet.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}>
                <thead><tr>{["Time","Market","Direction","Stake","Result","Status"].map(x => <th key={x} style={{ textAlign: "left", padding: 9, borderBottom: "1px solid #334155" }}>{x}</th>)}</tr></thead>
                <tbody>
                  {history.map(row => <tr key={row.id}>
                    <td style={{ padding: 9, borderBottom: "1px solid #263449" }}>{new Date(row.created_at).toLocaleString()}</td>
                    <td style={{ padding: 9, borderBottom: "1px solid #263449" }}>{row.market_symbol}</td>
                    <td style={{ padding: 9, borderBottom: "1px solid #263449" }}>{row.contract_type}</td>
                    <td style={{ padding: 9, borderBottom: "1px solid #263449" }}>{Number(row.stake_amount).toFixed(2)} {row.currency}</td>
                    <td style={{ padding: 9, borderBottom: "1px solid #263449" }}>{row.profit == null ? "—" : (Number(row.profit) >= 0 ? "+" : "") + Number(row.profit).toFixed(2) + " " + row.currency}</td>
                    <td style={{ padding: 9, borderBottom: "1px solid #263449" }}>{row.status}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="muted" style={{ marginTop: 20 }}>Safety: OAuth tokens and authenticated Demo WebSocket sessions stay on the SENFX server. Every buy request is routed through a fresh server session; Real accounts are rejected; the full 10 stake is reserved before purchase; the daily gross-loss cap is 20. Demo results are not evidence of future live performance.</p>
      </div>
    </main>
  );
}
