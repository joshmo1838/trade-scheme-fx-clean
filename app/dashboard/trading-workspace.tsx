"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import MasterWorkspace from "./v4/workspace";
import WorkspaceQuickSwitch from "@/app/components/WorkspaceQuickSwitch";
import LiveCandleChart from "@/app/components/LiveCandleChart";
import WorkspaceOperationsStatus from "@/app/components/WorkspaceOperationsStatus";

type Props = {
  name: string;
  email: string;
  userId: string;
  derivStatus: string;
  derivExpiry: string | null;
  derivError: boolean;
};

type DerivAccount = {
  account_id: string;
  balance: number | string;
  currency: string;
  account_type: string;
  status: string;
};

const currencyFlags: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", AUD: "🇦🇺", CAD: "🇨🇦",
  CHF: "🇨🇭", JPY: "🇯🇵", KES: "🇰🇪", NZD: "🇳🇿", ZAR: "🇿🇦",
};
const currencySymbols: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", AUD: "A$", CAD: "C$",
  CHF: "CHF ", JPY: "¥", KES: "KSh ", NZD: "NZ$", ZAR: "R",
};
function accountAmount(account: DerivAccount): string {
  const amount = Number(account.balance);
  if (!Number.isFinite(amount)) return "Balance unavailable";
  const code = String(account.currency || "").toUpperCase();
  const symbol = currencySymbols[code] || (code ? code + " " : "");
  return symbol + amount.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

/** Account data comes only from authenticated server endpoints, never a fabricated balance. */
function DerivBalanceMenu({ connectionStatus }: { connectionStatus: string }) {
  const [accounts, setAccounts] = useState<DerivAccount[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [accountsResponse, selectedResponse] = await Promise.all([
        fetch("/api/deriv/account", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/deriv/select-account", { cache: "no-store", credentials: "same-origin" }),
      ]);
      const accountsData = await accountsResponse.json();
      const selectedData = await selectedResponse.json();
      if (!accountsResponse.ok || !selectedResponse.ok ||
          accountsData.success !== true || selectedData.success !== true) {
        throw new Error(accountsData.error || selectedData.error || "Could not load Deriv accounts.");
      }
      const rows = Array.isArray(accountsData.accounts) ? accountsData.accounts as DerivAccount[] : [];
      setAccounts(rows);
      const savedId = String(selectedData.active_account_id || "");
      setSelectedId(rows.some(account => account.account_id === savedId) ? savedId : "");
    } catch (cause) {
      setAccounts([]);
      setSelectedId("");
      setError(cause instanceof Error ? cause.message : "Could not load Deriv accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function choose(account: DerivAccount) {
    if (saving || account.status !== "active") return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/deriv/select-account", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify({ account_id: account.account_id }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || "Could not select your Deriv account.");
      }
      setSelectedId(result.active_account_id);
      await refresh();
      setOpened(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Account selection failed.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (disconnecting || saving) return;
    if (!window.confirm("Disconnect this Deriv account from Trade Scheme FX? Your saved authorization will be removed. This does not revoke access in Deriv itself.")) return;
    setDisconnecting(true);
    setError("");
    try {
      const response = await fetch("/api/deriv/disconnect", {
        method: "POST", credentials: "same-origin",
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || "Could not disconnect Deriv.");
      }
      window.location.assign("/dashboard?deriv=disconnected");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Deriv.");
      setDisconnecting(false);
    }
  }

  const selected = accounts.find(account => account.account_id === selectedId);
  const currency = selected ? String(selected.currency || "").toUpperCase() : "";
  const flag = currencyFlags[currency] || "💱";
  const headline = loading ? "Loading…" :
    selected ? accountAmount(selected) :
    connectionStatus === "Connected" ? "Select account" : "Connect Deriv";

  return (
    <div className="senfxBalanceWrap" onKeyDown={event => {
      if (event.key === "Escape") setOpened(false);
    }}>
      <button type="button" className="senfxBalanceButton" onClick={() => setOpened(previous => !previous)}
        aria-expanded={opened} aria-label="View your selected Deriv account and balance">
        <span className="senfxBalanceFlag" aria-hidden="true">{selected ? flag : "💼"}</span>
        <span className="senfxBalanceText">
          <small>{selected ? (selected.account_type === "demo" ? "DEMO" : "REAL") + " · " + currency : "DERIV ACCOUNT"}</small>
          <strong>{headline}</strong>
        </span>
        <span className="senfxBalanceChevron" aria-hidden="true">⌄</span>
      </button>
      {opened && (
        <div className="senfxAccountMenu">
          <div className="senfxAccountMenuTop">
            <strong>Deriv accounts</strong>
            <button type="button" disabled={saving || loading} onClick={() => void refresh()}>↻ Refresh</button>
          </div>
          <p className="senfxAccountHint">Balances are retrieved from Deriv. Select which account is shown in the top-right header. Flags indicate the currency, not your nationality.</p>
          {loading && <p role="status">Retrieving your account balances…</p>}
          {error && <p className="senfxBalanceError" role="alert">{error}</p>}
          {!loading && accounts.length === 0 && (
            <p>No connected Deriv account data is available yet. Please connect or reconnect your account.</p>
          )}
          {!loading && accounts.map(account => {
            const code = String(account.currency || "").toUpperCase();
            const isSelected = selectedId === account.account_id;
            return (
              <button type="button" className={isSelected ? "senfxAccountOption selected" : "senfxAccountOption"}
                key={account.account_id} disabled={saving || account.status !== "active"}
                onClick={() => void choose(account)}>
                <span aria-hidden="true">{currencyFlags[code] || "💱"}</span>
                <span><strong>{accountAmount(account)}</strong>
                  <small>{account.account_type === "demo" ? "Demo" : "Real"} · {code} · {account.account_id}</small></span>
                <em>{isSelected ? "Selected" : account.status === "active" ? "Choose" : "Unavailable"}</em>
              </button>
            );
          })}
          <Link className="senfxAccountConnect" href="/api/deriv/connect">
            {connectionStatus === "Connected" ? "Reconnect Deriv ↗" : "Connect Deriv ↗"}
          </Link>
          {connectionStatus === "Connected" && (
            <button type="button" className="senfxAccountConnect" disabled={saving || disconnecting}
              onClick={() => void disconnect()}>
              {disconnecting ? "Disconnecting…" : "Disconnect Deriv"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function TradingWorkspace({derivStatus}: Props) {
 return <main className="workspaceShell workspaceVideo"><header className="workspaceTopbar"><Link className="workspaceBrand" href="/">TRADE SCHEME <span>FX</span></Link><div className="workspaceTopActions"><WorkspaceQuickSwitch /><DerivBalanceMenu connectionStatus={derivStatus}/><form action="/auth/signout" method="post"><button className="workspaceSignout">Sign out</button></form></div></header><MasterWorkspace /><details style={{margin:"12px",padding:"12px"}}><summary>Market charts, risk and paper bot controls</summary><nav aria-label="Workspace tools" style={{display:"flex",gap:"16px",flexWrap:"wrap",padding:"12px 0"}}><Link href="/charts">Charts</Link><Link href="/risk-center">Risk center</Link><Link href="/bot-center">Bot center</Link><Link href="/bot-controls">Paper bot controls</Link></nav><LiveCandleChart embedded /><WorkspaceOperationsStatus derivStatus={derivStatus} /></details></main>;
}
