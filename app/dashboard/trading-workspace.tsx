"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TradingLandingVisual from "@/components/TradingLandingVisual";

type Props = {
  name: string;
  email: string;
  userId: string;
  derivStatus: string;
  derivExpiry: string | null;
  derivError: boolean;
};

const videoNav = [
  { label: "Dashboard", href: "/dashboard", icon: "⌂" },
  { label: "Bot Builder", href: "/builder", icon: "▧" },
  { label: "Free Bots", href: "/bot-center", icon: "◈" },
  { label: "Markets", href: "/markets", icon: "⌁" },
  { label: "Charts", href: "/charts", icon: "▤" },
  { label: "Market Scanner", href: "/ai-scanner", icon: "✧" },
  { label: "Manual Trader", href: "/manual-trader", icon: "▣" },
  { label: "History", href: "/history", icon: "◷" },
];

const moreTools = [
  { label: "Deriv Demo Trading (Preview)", href: "/demo-trading" },
  { label: "Bulk Trader", href: "/bulk-trader" },
  { label: "Hedging Planner", href: "/hedging" },
  { label: "Digit Tools", href: "/digit-tools" },
  { label: "Strategy Lab", href: "/strategy-lab" },
  { label: "Market Intelligence", href: "/intelligence" },
  { label: "Backtest Research", href: "/backtest" },
  { label: "Bot Settings", href: "/bot-settings" },
  { label: "Support", href: "/messages" },
];

type PublishedBot = { id: string; name: string; market: string; description: string; risk_level: string };

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
        </div>
      )}
    </div>
  );
}

export default function TradingWorkspace({
  name,
  derivStatus,
}: Props) {
  const [openPanel, setOpenPanel] = useState<"load" | "bots" | null>(null);
  const [publishedBots, setPublishedBots] = useState<PublishedBot[]>([]);
  const [botsBusy, setBotsBusy] = useState(false);
  const [botsError, setBotsError] = useState("");

  async function browseBots() {
    setOpenPanel("bots");
    setBotsBusy(true);
    setBotsError("");
    try {
      const db = createClient();
      const { data, error } = await db.from("bots")
        .select("id,name,market,description,risk_level")
        .eq("is_published", true).order("name");
      if (error) throw error;
      setPublishedBots((data || []) as PublishedBot[]);
    } catch {
      setBotsError("Could not load the live bot catalogue. Open Bot Center to retry.");
      setPublishedBots([]);
    } finally {
      setBotsBusy(false);
    }
  }

  return (
    <main className="workspaceShell workspaceVideo">
      <header className="workspaceTopbar">
        <Link className="workspaceBrand" href="/">
          TRADE SCHEME <span>FX</span>
          <small>TRADING WORKSPACE</small>
        </Link>
        <div className="workspaceTopActions">
          <DerivBalanceMenu connectionStatus={derivStatus} />
          <Link className="workspaceTopLink" href="/messages">Support</Link>
          <form action="/auth/signout" method="post">
            <button className="workspaceSignout">Sign out</button>
          </form>
        </div>
      </header>

      <nav className="videoTopNav" aria-label="Trading workspace tools">
        {videoNav.map((item) => <Link key={item.label} href={item.href} className={item.href === "/dashboard" ? "videoTopNavItem active" : "videoTopNavItem"}>
          <span aria-hidden="true">{item.icon}</span>{item.label}
        </Link>)}
        <details className="videoNavMore"><summary><span aria-hidden="true">⋯</span> More tools</summary>
          <div className="videoNavMoreList">{moreTools.map(item => <Link key={item.href} href={item.href}>{item.label}</Link>)}</div>
        </details>
      </nav>

      <div className="workspaceLayout">
        <section className="workspaceMain">
          <section className="videoHero" aria-label="Trade Scheme FX launch center">
            <div className="videoHeroArtwork"><TradingLandingVisual /></div>
            <div className="videoHeroVeil" />
            <div className="videoHeroContent">
              <p className="videoHeroEyebrow">✦ TRADESCHEME / YOUR TRADING WORKSPACE</p>
              <h1>Welcome, {name.split("@")[0]}</h1>
              <p>Explore your bots, build strategies and practise with public market data.</p>
              <div className="videoHeroDots" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
              <div className="videoLaunchGrid">
                <button className="videoLaunchCard" type="button" onClick={() => setOpenPanel("load")}>
                  <span className="videoNumber">01</span><span className="videoCardIcon">⇧</span>
                  <strong>Load Bot</strong><small>Open a saved strategy or choose a bot</small>
                  <em>Choose a bot <b>↗</b></em>
                </button>
                <button className="videoLaunchCard accentGold" type="button" onClick={() => { void browseBots(); }}>
                  <span className="videoNumber">02</span><span className="videoCardIcon">◇</span>
                  <strong>Premium Bots</strong><small>Discover available strategies · free access</small>
                  <em>Browse available bots <b>↗</b></em>
                </button>
                <Link className="videoLaunchCard accentCyan" href="/bot-center">
                  <span className="videoNumber">03</span><span className="videoCardIcon">ϟ</span>
                  <strong>Speed Bot</strong><small>Open quick-start paper bot controls</small>
                  <em>Open Bot Center <b>↗</b></em>
                </Link>
                <Link className="videoLaunchCard accentPurple" href="/manual-trader">
                  <span className="videoNumber">04</span><span className="videoCardIcon">☷</span>
                  <strong>Manual Trading</strong><small>Practice your decisions on public ticks</small>
                  <em>Start paper practice <b>↗</b></em>
                </Link>
              </div>
              <p className="videoHeroFootnote">Charts on this welcome screen are illustrative. Bot and manual paper results are not Deriv contracts or verified returns.</p>
            </div>
          </section>
        </section>
      </div>
      {openPanel && (
        <div className="videoModalBackdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenPanel(null); }}>
          <section className="videoBotModal" role="dialog" aria-modal="true" aria-label={openPanel === "bots" ? "Available bots" : "Load a bot"}>
            <div className="videoBotModalHeader">
              <div><small>TRADESCHEME BOT WORKSPACE</small><h2>{openPanel === "bots" ? "Available bots" : "Load a bot"}</h2></div>
              <button type="button" className="videoModalClose" aria-label="Close window" onClick={() => setOpenPanel(null)}>×</button>
            </div>
            {openPanel === "load" ? (
              <div className="videoModalBotGrid">
                <Link className="videoModalChoice" href="/builder"><span>▧</span><strong>My saved strategies</strong><small>Open the Bot Builder and load a strategy saved to your account</small><em>Open Bot Builder ↗</em></Link>
                <Link className="videoModalChoice" href="/bot-center"><span>◈</span><strong>Published paper bots</strong><small>Select an available bot and review its real configuration status</small><em>Open Bot Center ↗</em></Link>
              </div>
            ) : (
              <>
                <p className="videoModalNote">All available bots are free to explore. Only published records from your account database appear here. This list does not imply that a bot has proven returns or live execution.</p>
                {botsBusy && <p role="status">Loading published bot catalogue…</p>}
                {botsError && <p role="alert">{botsError}</p>}
                {!botsBusy && !botsError && publishedBots.length === 0 && <p>No bots are published for your account yet.</p>}
                <div className="videoModalBotGrid">
                  {!botsBusy && publishedBots.map(bot => (
                    <Link key={bot.id} href="/bot-center" className="videoModalChoice">
                      <span>✦</span><strong>{bot.name}</strong><small>{bot.market} · {bot.risk_level} risk</small><p>{bot.description}</p><em>Review in Bot Center ↗</em>
                    </Link>
                  ))}
                </div>
                <Link href="/bot-center" className="videoBrowseAll">View Bot Center and controls ↗</Link>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
