"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  id: string;
  askPrice: number;
  payout: number;
  longcode: string;
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
  contract_id: number;
  status: string;
  profit: string | number;
  is_sold: number;
  is_expired: number;
  is_valid_to_sell: number;
  buy_price: string | number;
  sell_price?: string | number | null;
  current_spot?: string | number;
  underlying_symbol?: string;
  contract_type?: string;
};

const API = "/api/deriv/demo/orders";
const MARKETS = [
  { value: "R_10", label: "Volatility 10 Index" },
  { value: "R_25", label: "Volatility 25 Index" },
  { value: "R_50", label: "Volatility 50 Index" },
  { value: "R_75", label: "Volatility 75 Index" },
  { value: "R_100", label: "Volatility 100 Index" },
  { value: "frxEURUSD", label: "EUR/USD" },
];

type PendingRequest = {
  expectedType: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export default function DemoTradingConsole() {
  const [enabled, setEnabled] = useState(false);
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [risk, setRisk] = useState<Risk>({ dailyLoss: 0, reservedLoss: 0, dailyLossLimit: 20, remainingLossBudget: 20 });
  const [market, setMarket] = useState("R_100");
  const [direction, setDirection] = useState<"CALL" | "PUT">("CALL");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [contract, setContract] = useState<ContractStatus | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settling, setSettling] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<number, PendingRequest>>(new Map());
  const requestCounter = useRef(1);
  const activeOrderRef = useRef<ActiveOrder | null>(null);
  const settleInFlight = useRef(false);
  const currencyRef = useRef("USD");

  useEffect(() => { activeOrderRef.current = activeOrder; }, [activeOrder]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(API, { cache: "no-store", credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok || !data.enabled) throw new Error(data.error || "Demo trading is not available.");
      setEnabled(true);
      setAccount(data.account);
      currencyRef.current = data.account.currency;
      setRisk({
        dailyLoss: Number(data.dailyLoss || 0),
        reservedLoss: Number(data.reservedLoss || 0),
        dailyLossLimit: Number(data.dailyLossLimit || 20),
        remainingLossBudget: Number(data.remainingLossBudget ?? 20),
      });
      setHistory(data.orders || []);
      if (data.activeOrder) {
        setActiveOrder(data.activeOrder);
      } else {
        setActiveOrder(null);
        setContract(null);
      }
      setError("");
    } catch (err) {
      setEnabled(false);
      setError(err instanceof Error ? err.message : "Could not load Demo execution.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) socket.close();
      pendingRef.current.forEach(pending => {
        clearTimeout(pending.timer);
        pending.reject(new Error("Demo trading panel closed."));
      });
      pendingRef.current.clear();
    };
  }, [refresh]);

  const sendRequest = useCallback((expectedType: string, payload: Record<string, unknown>, timeoutMs = 10_000) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Connect to the Deriv Demo account first."));
    }
    const requestId = (Date.now() % 1_000_000_000) + requestCounter.current++;
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRef.current.delete(requestId);
        reject(new Error("Deriv did not confirm the request before timeout. Do not repeat a purchase until order status is checked."));
      }, timeoutMs);
      pendingRef.current.set(requestId, { expectedType, resolve, reject, timer });
      try {
        socket.send(JSON.stringify({ ...payload, req_id: requestId }));
      } catch {
        clearTimeout(timer);
        pendingRef.current.delete(requestId);
        reject(new Error("Could not send the request to Deriv."));
      }
    });
  }, []);

  const settleOrder = useCallback(async (orderId: string) => {
    if (settleInFlight.current) return;
    settleInFlight.current = true;
    setSettling(true);
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "settle", orderId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not confirm final Deriv result.");
      if (!result.settled) {
        setMessage("Contract remains open on Deriv. Its maximum loss is still reserved.");
        return;
      }
      setRisk({
        dailyLoss: Number(result.dailyLoss || 0),
        reservedLoss: Number(result.reservedLoss || 0),
        dailyLossLimit: Number(result.dailyLossLimit || 20),
        remainingLossBudget: Number(result.remainingLossBudget || 0),
      });
      setMessage(`Demo contract closed. Result: ${Number(result.profit) >= 0 ? "+" : ""}${Number(result.profit).toFixed(2)} ${account?.currency || ""}. Risk ledger updated.`);
      setActiveOrder(null);
      setContract(null);
      setQuote(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settlement could not be verified.");
    } finally {
      settleInFlight.current = false;
      setSettling(false);
    }
  }, [account, refresh]);

  const subscribeToContract = useCallback((contractId: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const reqId = (Date.now() % 1_000_000_000) + requestCounter.current++;
    socket.send(JSON.stringify({
      proposal_open_contract: 1,
      contract_id: Number(contractId),
      subscribe: 1,
      req_id: reqId,
    }));
  }, []);

  const connectDemo = useCallback(async () => {
    if (connecting || connected) return;
    setConnecting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/deriv/demo/session", { cache: "no-store", credentials: "same-origin" });
      const result = await response.json();
      if (!response.ok || !result.success || !result.wsUrl) {
        throw new Error(result.error || "Could not open a Deriv Demo session.");
      }
      const url = new URL(result.wsUrl);
      if (url.protocol !== "wss:" || url.hostname !== "api.derivws.com" || url.pathname !== "/trading/v1/options/ws/demo") {
        throw new Error("The server did not return a Demo-only Deriv session.");
      }
      const socket = new WebSocket(result.wsUrl);
      socketRef.current = socket;
      socket.onopen = () => {
        setConnected(true);
        setAccount(result.account);
        currencyRef.current = result.account.currency;
        setMessage("Connected to your Deriv Demo account. Real accounts are not supported in this console.");
        const existing = activeOrderRef.current;
        if (existing?.contract_id && existing.status === "open") {
          subscribeToContract(String(existing.contract_id));
        }
      };
      socket.onmessage = event => {
        let data: any;
        try { data = JSON.parse(String(event.data)); } catch { return; }

        const requestId = Number(data.req_id);
        const pending = pendingRef.current.get(requestId);
        if (pending && data.error) {
          clearTimeout(pending.timer);
          pendingRef.current.delete(requestId);
          pending.reject(new Error("DERIV_REJECTED: " + String(data.error.message || "Deriv rejected the request.")));
          return;
        }
        if (pending && data.msg_type === pending.expectedType) {
          clearTimeout(pending.timer);
          pendingRef.current.delete(requestId);
          pending.resolve(data);
        }

        if (data.msg_type === "proposal_open_contract" && data.proposal_open_contract) {
          const contractData = data.proposal_open_contract as ContractStatus;
          setContract(contractData);
          const current = activeOrderRef.current;
          if (current?.id && (contractData.is_sold === 1 || contractData.is_expired === 1)) {
            void settleOrder(current.id);
          }
        }
      };
      socket.onerror = () => setError("The Deriv Demo connection reported a socket error. Check the connection before sending another order.");
      socket.onclose = () => {
        setConnected(false);
        if (socketRef.current === socket) socketRef.current = null;
        pendingRef.current.forEach(pending => {
          clearTimeout(pending.timer);
          pending.reject(new Error("Deriv Demo connection closed."));
        });
        pendingRef.current.clear();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to Deriv Demo.");
    } finally {
      setConnecting(false);
    }
  }, [connected, connecting, settleOrder, subscribeToContract]);

  async function requestQuote() {
    if (!connected || busy || activeOrder || risk.remainingLossBudget < 10) return;
    setBusy(true);
    setError("");
    setMessage("");
    setQuote(null);
    try {
      const response = await sendRequest("proposal", {
        proposal: 1,
        amount: 10,
        basis: "stake",
        contract_type: direction,
        currency: account?.currency || currencyRef.current,
        duration: 5,
        duration_unit: "m",
        subscribe: 1,
        underlying_symbol: market,
      });
      const proposal = response?.proposal;
      const askPrice = Number(proposal?.ask_price);
      const payout = Number(proposal?.payout);
      if (!proposal?.id || !Number.isFinite(askPrice) || askPrice <= 0 || askPrice > 10 || !Number.isFinite(payout) || payout <= 0) {
        throw new Error("Deriv returned a quote that does not meet SENFX's $10 Demo stake guard.");
      }
      setQuote({
        id: String(proposal.id),
        askPrice,
        payout,
        longcode: String(proposal.longcode || ""),
      });
      setMessage("Fresh Deriv Demo price received. Review the terms, then confirm the Demo purchase.");
    } catch (err) {
      setError(err instanceof Error ? err.message.replace("DERIV_REJECTED: ", "") : "Could not get a Deriv quote.");
    } finally {
      setBusy(false);
    }
  }

  async function buyDemoContract() {
    if (!quote || !connected || busy || activeOrder || risk.remainingLossBudget < 10) return;
    setBusy(true);
    setError("");
    setMessage("");
    const requestId = crypto.randomUUID();
    let orderId = "";
    try {
      const reserveResponse = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "reserve",
          requestId,
          proposalId: quote.id,
          marketSymbol: market,
          direction,
          currency: account?.currency || currencyRef.current,
          askPrice: quote.askPrice,
          payout: quote.payout,
          longcode: quote.longcode,
        }),
      });
      const reservation = await reserveResponse.json();
      if (!reserveResponse.ok || !reservation.success) {
        throw new Error(reservation.error || "SENFX did not reserve the Demo risk budget.");
      }
      orderId = reservation.orderId;
      const reserved = reservation.risk;
      setRisk({
        dailyLoss: Number(reserved.dailyLoss || 0),
        reservedLoss: Number(reserved.reservedLoss || 0),
        dailyLossLimit: Number(reserved.dailyLossLimit || 20),
        remainingLossBudget: Number(reserved.remainingLossBudget || 0),
      });

      let bought: any;
      try {
        bought = await sendRequest("buy", { buy: quote.id, price: quote.askPrice });
      } catch (buyError) {
        const reason = buyError instanceof Error ? buyError.message : "Unknown buy response.";
        if (reason.startsWith("DERIV_REJECTED:")) {
          await fetch(API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ action: "cancel", orderId, reason: reason.slice(0, 150) }),
          });
          await refresh();
          throw new Error(reason.replace("DERIV_REJECTED: ", ""));
        }
        await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ action: "buy-unknown", orderId }),
        });
        setActiveOrder({ id: orderId, status: "buy_unknown", market_symbol: market, contract_type: direction, stake_amount: 10, currency: currencyRef.current });
        throw new Error("Deriv did not confirm whether the purchase completed. SENFX has held the $10 risk reservation. Do not retry; reconnect and contact support to reconcile.");
      }

      const contractId = String(bought?.buy?.contract_id || "");
      if (!/^\d{1,30}$/.test(contractId)) {
        await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ action: "buy-unknown", orderId }),
        });
        setActiveOrder({ id: orderId, status: "buy_unknown", market_symbol: market, contract_type: direction, stake_amount: 10, currency: currencyRef.current });
        throw new Error("Deriv returned an unclear purchase response. The risk reservation remains held; do not retry.");
      }

      const confirmResponse = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "confirm", orderId, contractId }),
      });
      const confirmation = await confirmResponse.json();
      if (!confirmResponse.ok || !confirmation.success) {
        await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ action: "buy-unknown", orderId }),
        });
        setActiveOrder({ id: orderId, status: "buy_unknown", contract_id: contractId, market_symbol: market, contract_type: direction, stake_amount: 10, currency: currencyRef.current });
        throw new Error(confirmation.error || "The contract may exist, but SENFX could not verify it. The risk reservation remains held.");
      }

      setActiveOrder({
        id: orderId,
        status: "open",
        contract_id: confirmation.contractId,
        market_symbol: market,
        contract_type: direction,
        stake_amount: 10,
        currency: currencyRef.current,
      });
      setQuote(null);
      setMessage("Deriv confirmed your Demo contract. SENFX is monitoring its status.");
      subscribeToContract(contractId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo purchase did not complete.");
    } finally {
      setBusy(false);
    }
  }

  async function sellDemoContract() {
    const current = activeOrderRef.current;
    if (!current?.contract_id || !contract?.is_valid_to_sell || busy || !connected) return;
    setBusy(true);
    setError("");
    try {
      await sendRequest("sell", { sell: Number(current.contract_id), price: 0 });
      setMessage("Sell request accepted by Deriv Demo. Verifying the final result and updating the risk ledger…");
      await settleOrder(current.id);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace("DERIV_REJECTED: ", "") : "Could not sell the Demo contract.");
    } finally {
      setBusy(false);
    }
  }

  const locked = Boolean(activeOrder) || risk.remainingLossBudget < 10;
  const openProfit = contract ? Number(contract.profit || 0) : null;

  return (
    <main className="workspaceShell" style={{ minHeight: "100vh" }}>
      <div className="workspaceMain" style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 22px" }}>
        <div className="workspaceWelcome">
          <div>
            <p className="workspaceEyebrow">SENFX EXECUTION · PHASE 1</p>
            <h1>Deriv <span>Demo Trading</span></h1>
            <p>Real Deriv contract prices and Demo-account orders. No Real account route is available in this feature.</p>
          </div>
          <div className="workspaceModeBadge"><span /> DEMO ONLY</div>
        </div>

        {error && <p role="alert" style={{ color: "#f87171", padding: 12, background: "rgba(127,29,29,.18)", borderRadius: 10 }}>{error}</p>}
        {message && <p role="status" style={{ color: "#86efac", padding: 12, background: "rgba(20,83,45,.18)", borderRadius: 10 }}>{message}</p>}

        <section className="workspaceMarketStrip" aria-label="Demo risk status">
          <div><small>DEMO ACCOUNT</small><strong>{account ? account.accountId : "Not connected"}</strong></div>
          <div><small>ACCOUNT BALANCE</small><strong>{account ? `${Number(account.balance).toFixed(2)} ${account.currency}` : "—"}</strong></div>
          <div><small>TODAY'S REALIZED LOSS</small><strong>{risk.dailyLoss.toFixed(2)} {account?.currency || ""}</strong></div>
          <div><small>OPEN RISK RESERVED</small><strong>{risk.reservedLoss.toFixed(2)} {account?.currency || ""}</strong></div>
        </section>

        <section className="workspaceAccountGrid" style={{ marginTop: 18 }}>
          <article className="workspacePanel">
            <div className="workspacePanelTop">
              <div><p className="workspaceEyebrow">DAILY DEMO LOSS CAP</p><h2>{risk.remainingLossBudget.toFixed(2)} / {risk.dailyLossLimit.toFixed(2)} {account?.currency || ""} remaining</h2></div>
              <span className={risk.remainingLossBudget >= 10 ? "workspaceStatusDot online" : "workspaceStatusDot"} />
            </div>
            <div style={{ height: 9, borderRadius: 10, background: "#1f2937", overflow: "hidden", margin: "14px 0" }}>
              <div style={{ width: `${Math.min(100, (risk.dailyLoss + risk.reservedLoss) / Math.max(1, risk.dailyLossLimit) * 100)}%`, height: "100%", background: risk.remainingLossBudget >= 10 ? "#16a34a" : "#dc2626" }} />
            </div>
            <p className="muted">SENFX reserves the full 10 {account?.currency || "account-currency units"} stake before each contract. Wins do not restore loss budget. This ledger covers trades sent through SENFX, not trades placed directly on Deriv outside SENFX.</p>
          </article>

          <article className="workspacePanel">
            <p className="workspaceEyebrow">DERIV CONNECTION</p>
            <h3>{connected ? "Demo session connected" : "Demo session not connected"}</h3>
            <p className="muted">A short-lived, single-use Deriv OTP is used to connect. Your OAuth access token remains on the SENFX server.</p>
            <button className="workspacePrimaryButton" onClick={() => void connectDemo()} disabled={!enabled || connecting || connected}>
              {connecting ? "Connecting…" : connected ? "Connected" : "Connect Demo account"}
            </button>
            <p className="muted" style={{ marginTop: 10 }}>{account ? `Selected account: DEMO · ${account.currency}` : "Select an active Demo account from your dashboard first."}</p>
          </article>
        </section>

        <section className="workspacePanel" style={{ marginTop: 18 }}>
          <p className="workspaceEyebrow">MANUAL DEMO CONTRACT TEST</p>
          <h2>Request a price and confirm one Demo trade</h2>
          <p className="muted">Initial release is deliberately manual: review every proposal and click Confirm before a contract is purchased. One position at a time, fixed 10 stake, five-minute Rise/Fall, maximum daily loss 20.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginTop: 18 }}>
            <label className="muted">Market
              <select value={market} onChange={e => { setMarket(e.target.value); setQuote(null); }} disabled={!connected || busy || Boolean(activeOrder)} className="workspaceInput" style={{ display: "block", width: "100%", marginTop: 7 }}>
                {MARKETS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="muted">Direction
              <select value={direction} onChange={e => { setDirection(e.target.value as "CALL" | "PUT"); setQuote(null); }} disabled={!connected || busy || Boolean(activeOrder)} className="workspaceInput" style={{ display: "block", width: "100%", marginTop: 7 }}>
                <option value="CALL">Rise (CALL)</option>
                <option value="PUT">Fall (PUT)</option>
              </select>
            </label>
            <label className="muted">Stake
              <input value={`10 ${account?.currency || ""}`} readOnly className="workspaceInput" style={{ display: "block", width: "100%", marginTop: 7 }} />
            </label>
            <label className="muted">Duration
              <input value="5 minutes" readOnly className="workspaceInput" style={{ display: "block", width: "100%", marginTop: 7 }} />
            </label>
          </div>

          {!quote ? (
            <button className="workspacePrimaryButton" onClick={() => void requestQuote()} disabled={!connected || busy || locked}>
              {busy ? "Working…" : "Get Deriv price"}
            </button>
          ) : (
            <div style={{ border: "1px solid #2563eb", borderRadius: 12, padding: 16, marginTop: 18 }}>
              <p className="workspaceEyebrow">LIVE DERIV PROPOSAL · REVIEW BEFORE PURCHASE</p>
              <h3>Stake {quote.askPrice.toFixed(2)} {account?.currency}</h3>
              <p>Potential payout shown by Deriv: <strong>{quote.payout.toFixed(2)} {account?.currency}</strong></p>
              <p className="muted">{quote.longcode}</p>
              <button className="workspacePrimaryButton" onClick={() => void buyDemoContract()} disabled={busy || !connected || locked}>
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
            {activeOrder.status === "buy_unknown" ? (
              <p role="alert">Purchase confirmation is unresolved. The 10 {account?.currency || ""} risk remains reserved. Do not retry this trade; reconnect and contact support so the contract can be reconciled.</p>
            ) : (
              <>
                <p>Contract ID: {activeOrder.contract_id}</p>
                <p>Status: {contract?.status || "Open"} · Current profit/loss: {openProfit === null ? "Waiting for Deriv update…" : `${openProfit >= 0 ? "+" : ""}${openProfit.toFixed(2)} ${account?.currency}`}</p>
                <button className="button secondary" onClick={() => void sellDemoContract()} disabled={!connected || busy || !contract?.is_valid_to_sell}>
                  Sell early at Deriv market price
                </button>
                <button className="button secondary" style={{ marginLeft: 10 }} onClick={() => void refresh()} disabled={busy}>Refresh status</button>
              </>
            )}
            {settling && <p className="muted">Verifying the result on Deriv and updating risk ledger…</p>}
          </section>
        )}

        <section className="workspacePanel" style={{ marginTop: 18 }}>
          <div className="workspaceSectionHeading">
            <div><p className="workspaceEyebrow">AUDIT TRAIL</p><h2>Recent Demo contracts</h2></div>
            <button className="button secondary" onClick={() => void refresh()}>Refresh</button>
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
                    <td style={{ padding: 9, borderBottom: "1px solid #263449" }}>{row.profit == null ? "—" : `${Number(row.profit) >= 0 ? "+" : ""}${Number(row.profit).toFixed(2)} ${row.currency}`}</td>
                    <td style={{ padding: 9, borderBottom: "1px solid #263449" }}>{row.status}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="muted" style={{ marginTop: 20 }}>Safety: This console can request Demo-session OTPs only. The server rejects real accounts, stores OAuth tokens server-side, uses a fixed 10 stake and a 20 daily loss cap, and does not provide any Real-account order endpoint. Demo execution is not a promise of live performance.</p>
      </div>
    </main>
  );
}
