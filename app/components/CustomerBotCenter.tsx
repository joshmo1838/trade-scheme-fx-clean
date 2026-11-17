"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Bot = { id: string; name: string; market: string; description: string; risk_level: string };
type Selection = { id: string; bot_id: string; control_status: "selected" | "paused" | "stopped"; selected?: boolean };
type Config = { stake_amount: number; daily_loss_limit: number | null };
type PaperTrade = {
  id: string; bot_id: string; market_symbol: string; direction: string;
  entry_price: number; exit_price: number; stake_amount: number; pnl: number;
  outcome: string; opened_at: string; closed_at: string;
};
type DailyRisk = {
  riskDate: string; dailyLoss: number; reservedLoss: number;
  dailyLossLimit: number; remainingLossBudget: number;
};
type OpenPaperTrade = {
  entry: number; direction: "CALL" | "PUT"; stake: number; remaining: number;
  openedAt: string; reservationId: string;
};
type Runtime = {
  prices: number[]; open: OpenPaperTrade | null; running: boolean;
  cooldown: number; trades: number; closing: boolean; reserving: boolean;
};

const PAPER_RISK_ENDPOINT = "/api/paper-trading";

export default function CustomerBotCenter() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [configs, setConfigs] = useState<Record<string, Config>>({});
  const [dailyRisk, setDailyRisk] = useState<Record<string, DailyRisk>>({});
  const [tab, setTab] = useState<"marketplace" | "mybots" | "performance">("marketplace");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>([]);
  const [engineStatus, setEngineStatus] = useState<Record<string, string>>({});
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const sockets = useMemo(() => new Map<string, WebSocket>(), []);
  const runtimes = useMemo(() => new Map<string, Runtime>(), []);
  const startingBots = useMemo(() => new Set<string>(), []);
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      window.location.href = "/login";
      return;
    }

    const [botsResult, selectionsResult, configsResult, tradesResult] = await Promise.all([
      supabase.from("bots").select("id,name,market,description,risk_level").eq("is_published", true).order("name"),
      supabase.from("customer_bots").select("id,bot_id,control_status,selected").eq("customer_id", user.id).eq("trading_mode", "demo"),
      supabase.from("customer_bot_configurations").select("bot_id,stake_amount,daily_loss_limit").eq("customer_id", user.id).eq("trading_mode", "demo"),
      supabase.from("customer_paper_trades")
        .select("id,bot_id,market_symbol,direction,entry_price,exit_price,stake_amount,pnl,outcome,opened_at,closed_at")
        .eq("customer_id", user.id).order("closed_at", { ascending: false }).limit(100),
    ]);

    const coreError = botsResult.error || selectionsResult.error || configsResult.error;
    if (coreError) {
      setMessage("Could not load your Bot Center: " + coreError.message);
      setLoading(false);
      return;
    }

    const botRows = (botsResult.data || []) as Bot[];
    const selectionRows = (selectionsResult.data || []) as Selection[];
    const configRows = configsResult.data || [];
    const nextConfigs: Record<string, Config> = {};
    botRows.forEach(bot => {
      const saved = configRows.find(row => row.bot_id === bot.id);
      nextConfigs[bot.id] = saved
        ? { stake_amount: Number(saved.stake_amount), daily_loss_limit: saved.daily_loss_limit === null ? null : Number(saved.daily_loss_limit) }
        : { stake_amount: 10, daily_loss_limit: 20 };
    });

    setBots(botRows);
    setSelections(selectionRows);
    setConfigs(nextConfigs);
    if (tradesResult.error) {
      setPaperTrades([]);
      setMessage("Paper trade history and daily risk protection require the SENFX paper-risk SQL migration. Apply supabase/senfx-paper-risk-controls.sql before starting a simulation.");
    } else {
      setPaperTrades((tradesResult.data || []) as PaperTrade[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
    return () => {
      runtimes.forEach(runtime => {
        runtime.running = false;
        if (runtime.open?.reservationId && !runtime.closing) {
          void fetch(PAPER_RISK_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "cancel", reservationId: runtime.open.reservationId }),
            keepalive: true,
          }).catch(() => undefined);
        }
      });
      sockets.forEach(ws => ws.close());
      sockets.clear();
      runtimes.clear();
    };
  }, [load, sockets, runtimes]);

  function applyRisk(botId: string, value: any) {
    if (!value || typeof value.dailyLoss !== "number" || typeof value.reservedLoss !== "number" ||
        typeof value.dailyLossLimit !== "number") return;
    setDailyRisk(current => ({
      ...current,
      [botId]: {
        riskDate: String(value.riskDate || value.risk_date || new Date().toISOString().slice(0, 10)),
        dailyLoss: value.dailyLoss,
        reservedLoss: value.reservedLoss,
        dailyLossLimit: value.dailyLossLimit,
        remainingLossBudget: typeof value.remainingLossBudget === "number"
          ? value.remainingLossBudget
          : Math.max(0, value.dailyLossLimit - value.dailyLoss - value.reservedLoss),
      },
    }));
  }

  function cancelReservation(reservationId: string) {
    return fetch(PAPER_RISK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", reservationId }),
      keepalive: true,
    }).catch(() => undefined);
  }

  function stopPaper(botId: string, reason = "Paper simulation paused.") {
    const runtime = runtimes.get(botId);
    if (runtime) {
      runtime.running = false;
      if (runtime.open?.reservationId && !runtime.closing) {
        const reservationId = runtime.open.reservationId;
        runtime.open = null;
        void cancelReservation(reservationId);
      }
    }
    const ws = sockets.get(botId);
    if (ws) {
      sockets.delete(botId);
      ws.close();
    }
    setEngineStatus(current => ({ ...current, [botId]: reason }));
  }

  async function startPaper(bot: Bot) {
    const selection = selections.find(item => item.bot_id === bot.id);
    if (!selection || selection.control_status !== "selected" || selection.selected === false) {
      setMessage("Mark this bot selected before starting its paper simulation.");
      return;
    }
    if (sockets.has(bot.id) || startingBots.has(bot.id)) {
      setMessage("This bot's paper feed is already running or starting in this browser tab.");
      return;
    }
    startingBots.add(bot.id);
    try {
    setMessage("");
    setEngineStatus(current => ({ ...current, [bot.id]: "Checking today's server-enforced loss budget…" }));

    let risk: any;
    try {
      const response = await fetch(PAPER_RISK_ENDPOINT + "?botId=" + encodeURIComponent(bot.id), { cache: "no-store" });
      risk = await response.json();
      if (!response.ok || !risk.enabled) {
        const reason = risk.error || "Daily paper-risk protection is unavailable.";
        setEngineStatus(current => ({ ...current, [bot.id]: reason }));
        setMessage(reason);
        return;
      }
    } catch {
      const reason = "Could not verify the daily loss limit with the server. Simulation was not started.";
      setEngineStatus(current => ({ ...current, [bot.id]: reason }));
      setMessage(reason);
      return;
    }

    applyRisk(bot.id, risk);
    if (risk.limitReached) {
      const reason = "Daily paper loss budget is fully reserved or used. New entries are blocked until 00:00 UTC.";
      setEngineStatus(current => ({ ...current, [bot.id]: reason }));
      setMessage(reason);
      return;
    }

    const stake = Number(risk.stakeAmount);
    if (!Number.isFinite(stake) || stake < 10 || stake > 100) {
      setMessage("The server returned an invalid saved paper stake. Save your paper settings again.");
      return;
    }

    const market = bot.market.toLowerCase().includes("forex") ? "frxEURUSD" : "R_100";
    const runtime: Runtime = {
      prices: [], open: null, running: true, cooldown: 0, trades: 0,
      closing: false, reserving: false,
    };
    runtimes.set(bot.id, runtime);
    setEngineStatus(current => ({
      ...current,
      [bot.id]: "Connecting to public market data · daily risk checked",
    }));

    try {
      const ws = new WebSocket("wss://api.derivws.com/trading/v1/options/ws/public");
      sockets.set(bot.id, ws);

      ws.onopen = () => {
        if (!runtime.running) return;
        setEngineStatus(current => ({ ...current, [bot.id]: "Live paper simulation running · daily risk reserved per trade" }));
        ws.send(JSON.stringify({ ticks: market, subscribe: 1 }));
      };

      ws.onmessage = async event => {
        let msg: any;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.error) {
          stopPaper(bot.id, "Feed error: " + String(msg.error.message || "Unknown market-data error"));
          return;
        }
        if (msg.msg_type !== "tick" || !msg.tick) return;
        if (msg.tick.symbol && msg.tick.symbol !== market) return;

        const price = Number(msg.tick.quote);
        if (!Number.isFinite(price) || price <= 0 || !runtime.running || runtime.closing) return;
        setLivePrices(current => ({ ...current, [bot.id]: price }));
        runtime.prices = [...runtime.prices, price].slice(-22);

        if (runtime.open) {
          runtime.open.remaining -= 1;
          if (runtime.open.remaining <= 0) {
            const completed = runtime.open;
            runtime.closing = true;
            try {
              const response = await fetch(PAPER_RISK_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "settle",
                  reservationId: completed.reservationId,
                }),
              });
              const result = await response.json();
              if (!response.ok || !result.settled) {
                runtime.closing = false;
                stopPaper(bot.id, result.reason || "Paper settlement failed. Simulation stopped to preserve the risk limit.");
                return;
              }

              const trade: PaperTrade = {
                id: result.tradeId,
                bot_id: bot.id,
                market_symbol: result.marketSymbol || market,
                direction: completed.direction,
                entry_price: Number(result.entryPrice),
                exit_price: Number(result.exitPrice),
                stake_amount: completed.stake,
                pnl: Number(result.pnl),
                outcome: result.outcome,
                opened_at: result.openedAt || completed.openedAt,
                closed_at: result.closedAt || new Date().toISOString(),
              };
              runtime.open = null;
              runtime.closing = false;
              runtime.trades += 1;
              runtime.cooldown = 10;
              setPaperTrades(current => [trade, ...current].slice(0, 100));
              applyRisk(bot.id, result);

              if (result.limitReached) {
                stopPaper(bot.id, "Daily paper loss limit reached. New entries are blocked until 00:00 UTC.");
              } else if (runtime.trades >= 20) {
                stopPaper(bot.id, "20-trade session cap reached. Daily risk totals remain saved on the server.");
              } else if (runtime.running) {
                setEngineStatus(current => ({
                  ...current,
                  [bot.id]: "Paper trade saved · daily loss used $" +
                    Number(result.dailyLoss).toFixed(2) + " of $" +
                    Number(result.dailyLossLimit).toFixed(2),
                }));
              }
            } catch {
              runtime.closing = false;
              stopPaper(bot.id, "Could not confirm paper settlement with the server. Simulation stopped; reserved risk was not cleared.");
              return;
            }
          }
        } else if (runtime.reserving) {
          return;
        } else if (runtime.cooldown > 0) {
          runtime.cooldown -= 1;
        } else if (runtime.prices.length >= 21 && runtime.trades < 20) {
          const prices = runtime.prices;
          const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
          const fast = average(prices.slice(-9));
          const slow = average(prices.slice(-21));
          if (Math.abs(fast - slow) > 0) {
            const direction: "CALL" | "PUT" = fast > slow ? "CALL" : "PUT";
            runtime.reserving = true;
            try {
              const response = await fetch(PAPER_RISK_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "reserve",
                  botId: bot.id,
                  marketSymbol: market,
                  direction,
                }),
              });
              const reservation = await response.json();
              if (!response.ok || !reservation.allowed) {
                applyRisk(bot.id, reservation);
                stopPaper(bot.id, reservation.reason || "Server denied the paper-trade risk reservation.");
                return;
              }
              applyRisk(bot.id, reservation);
              if (!runtime.running) {
                await cancelReservation(reservation.reservationId);
                return;
              }
              runtime.open = {
                entry: Number(reservation.entryPrice),
                direction,
                stake: Number(reservation.stakeAmount),
                remaining: 5,
                openedAt: reservation.openedAt || new Date().toISOString(),
                reservationId: reservation.reservationId,
              };
              setEngineStatus(current => ({
                ...current,
                [bot.id]: "Paper position opened · $" + Number(reservation.stakeAmount).toFixed(2) +
                  " maximum loss reserved on server",
              }));
            } catch {
              stopPaper(bot.id, "Could not reserve the paper-trade risk with the server. Simulation stopped.");
            } finally {
              runtime.reserving = false;
            }
          }
        }
      };

      ws.onerror = () => stopPaper(bot.id, "Market data connection failed. Simulation stopped.");
      ws.onclose = () => {
        if (runtime.running) {
          stopPaper(bot.id, "Market feed disconnected. Simulation stopped.");
        }
        sockets.delete(bot.id);
      };
    } catch {
      stopPaper(bot.id, "Could not start paper feed.");
    }
    } finally {
      startingBots.delete(bot.id);
    }
  }

  async function addBot(bot: Bot) {
    if (busy) return;
    setBusy(bot.id);
    setMessage("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    const { error } = await supabase.from("customer_bots").upsert({
      customer_id: user.id, bot_id: bot.id, trading_mode: "demo",
      selected: true, control_status: "selected",
    }, { onConflict: "customer_id,bot_id,trading_mode" });
    if (error) setMessage("Could not add bot: " + error.message);
    else {
      setMessage(bot.name + " added to My Bots in paper configuration mode.");
      await load();
    }
    setBusy(null);
  }

  async function changeStatus(bot: Bot, next: Selection["control_status"]) {
    if (busy) return;
    setBusy(bot.id);
    setMessage("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    const existing = selections.find(item => item.bot_id === bot.id);
    const payload = {
      customer_id: user.id, bot_id: bot.id, trading_mode: "demo",
      selected: next === "selected", control_status: next,
    };
    const result = existing
      ? await supabase.from("customer_bots").update({
          selected: payload.selected, control_status: next,
        }).eq("id", existing.id).eq("customer_id", user.id)
      : await supabase.from("customer_bots").upsert(payload, { onConflict: "customer_id,bot_id,trading_mode" });

    if (result.error) setMessage("Could not update bot preference: " + result.error.message);
    else {
      if (next !== "selected" && sockets.has(bot.id)) stopPaper(bot.id, "Bot preference changed. Paper simulation stopped.");
      setMessage(bot.name + " preference updated to " + next + ".");
      await load();
    }
    setBusy(null);
  }

  async function saveConfig(bot: Bot) {
    const cfg = configs[bot.id];
    if (!cfg || busy) return;
    if (!Number.isFinite(cfg.stake_amount) || cfg.stake_amount < 10 || cfg.stake_amount > 100) {
      setMessage("Paper stake must be between $10 and $100.");
      return;
    }
    if (!Number.isFinite(cfg.daily_loss_limit) || cfg.daily_loss_limit === null ||
        cfg.daily_loss_limit <= 0 || cfg.daily_loss_limit < cfg.stake_amount) {
      setMessage("Daily paper loss limit must be at least the paper stake and greater than zero.");
      return;
    }

    setBusy(bot.id);
    setMessage("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    const { error } = await supabase.from("customer_bot_configurations").upsert({
      customer_id: user.id, bot_id: bot.id, trading_mode: "demo",
      stake_amount: cfg.stake_amount, daily_loss_limit: cfg.daily_loss_limit,
      updated_at: new Date().toISOString(),
    }, { onConflict: "customer_id,bot_id,trading_mode" });

    if (error) setMessage("Could not save configuration: " + error.message);
    else setMessage(
      bot.name + " daily paper settings saved. The current day's loss cap can only stay the same or decrease; a higher cap takes effect on the next UTC day."
    );
    setBusy(null);
  }

  const myBots = bots.filter(bot => selections.some(selection => selection.bot_id === bot.id));
  const activeCount = selections.filter(selection => selection.control_status === "selected").length;
  const pausedCount = selections.filter(selection => selection.control_status === "paused").length;
  const paperPnl = paperTrades.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
  const winRate = paperTrades.length
    ? Math.round(paperTrades.filter(trade => trade.outcome === "WIN").length / paperTrades.length * 100)
    : null;

  return (
    <main className="botCenterShell">
      <header className="botCenterTop">
        <Link href="/dashboard" className="botCenterBrand">TRADE SCHEME <b>FX</b></Link>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/builder">Bot Builder</Link>
          <Link href="/intelligence">Market Intelligence</Link>
          <Link href="/strategy-lab">Ultra Precision Lab</Link>
        </nav>
      </header>

      <section className="botCenterContent">
        <div className="botCenterHero">
          <div>
            <span className="botCenterEyebrow">SENFX AUTOMATION WORKSPACE</span>
            <h1>Customer <em>Bot Center</em></h1>
            <p>Browse free strategies, configure daily risk limits and run isolated paper simulations.</p>
          </div>
          <span className="botCenterSafety">PAPER MODE · NO EXECUTION</span>
        </div>

        <div className="botCenterNotice">
          <b>Daily risk protection.</b> Each bot has a separate daily loss cap. Paper positions reserve their full stake as potential loss before opening. The server verifies public Deriv entry and exit quotes, records closed losses across refreshes and devices, and blocks entries that exceed the bot's daily budget. Wins do not replenish the budget. The cap resets at 00:00 UTC. This remains illustrative paper trading, not a Deriv contract or order.
        </div>

        <div className="botCenterStats">
          <article><small>AVAILABLE BOTS</small><strong>{bots.length}</strong></article>
          <article><small>MY BOTS</small><strong>{myBots.length}</strong></article>
          <article><small>MARKED SELECTED</small><strong>{activeCount}</strong></article>
          <article><small>PAUSED PREFERENCES</small><strong>{pausedCount}</strong></article>
        </div>

        <div className="botCenterTabs" role="tablist" aria-label="Bot Center sections">
          <button className={tab === "marketplace" ? "active" : ""} onClick={() => setTab("marketplace")}>Free Marketplace</button>
          <button className={tab === "mybots" ? "active" : ""} onClick={() => setTab("mybots")}>My Bots ({myBots.length})</button>
          <button className={tab === "performance" ? "active" : ""} onClick={() => setTab("performance")}>Performance</button>
        </div>

        {message && <p className="botCenterMessage" role="status">{message}</p>}

        {loading ? (
          <div className="botCenterEmpty">Loading your secure Bot Center…</div>
        ) : tab === "performance" ? (
          <section className="botCenterPerformance">
            <div>
              <span className="botCenterEyebrow">PAPER PERFORMANCE</span>
              <h2>Saved paper simulation results</h2>
              <p>The latest 100 paper trades are loaded from your customer account. These are illustrative simulations using a simplified 1:1 outcome model, not verified broker executions or evidence of future profitability.</p>
            </div>
            <div className="botCenterPerfGrid">
              <article><small>LOADED PAPER TRADES</small><strong>{paperTrades.length}</strong></article>
              <article><small>RECENT SIMULATED P/L</small><strong>{paperPnl.toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong></article>
              <article><small>RECENT WIN RATE</small><strong>{winRate === null ? "—" : winRate + "%"}</strong></article>
            </div>
            <div className="botCenterTradeHistory">
              <h3>Recent paper trades</h3>
              {paperTrades.length === 0
                ? <p>No saved paper trades are available yet.</p>
                : paperTrades.slice(0, 20).map(trade => (
                    <article key={trade.id}>
                      <span><b>{trade.direction}</b> · {trade.market_symbol} · {new Date(trade.closed_at).toLocaleString()}</span>
                      <strong>{Number(trade.pnl).toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong>
                    </article>
                  ))}
            </div>
          </section>
        ) : (
          <section className="botCenterGrid">
            {(tab === "marketplace" ? bots : myBots).map(bot => {
              const selection = selections.find(item => item.bot_id === bot.id);
              const cfg = configs[bot.id] || { stake_amount: 10, daily_loss_limit: 20 };
              const risk = dailyRisk[bot.id];
              return (
                <article className="botCenterCard" key={bot.id}>
                  <div className="botCenterCardTop">
                    <span className="botCenterRisk">{bot.risk_level} risk</span>
                    <span className="botCenterMarket">{bot.market}</span>
                  </div>
                  <h2>{bot.name}</h2>
                  <p>{bot.description || "No strategy description has been provided."}</p>
                  <div className="botCenterStatus">
                    <span>Status preference</span>
                    <b>{selection?.control_status || "Not added"}</b>
                  </div>

                  {tab === "mybots" && (
                    <div className="botCenterConfig">
                      <label>
                        Paper stake (USD)
                        <input
                          type="number" min="10" max="100" step="0.01" required
                          value={cfg.stake_amount}
                          onChange={event => setConfigs(current => ({
                            ...current, [bot.id]: {
                              ...cfg,
                              stake_amount: event.target.value === "" ? 0 : Number(event.target.value),
                            },
                          }))}
                        />
                      </label>
                      <label>
                        Daily paper loss limit (USD)
                        <input
                          type="number" min={cfg.stake_amount} step="0.01" required
                          placeholder="e.g. 20"
                          value={cfg.daily_loss_limit ?? ""}
                          onChange={event => setConfigs(current => ({
                            ...current, [bot.id]: {
                              ...cfg,
                              daily_loss_limit: event.target.value === "" ? null : Number(event.target.value),
                            },
                          }))}
                        />
                      </label>
                      <button className="botCenterSecondary" disabled={busy !== null} onClick={() => void saveConfig(bot)}>
                        Save paper settings
                      </button>
                      {risk && (
                        <small className="botCenterEngineStatus">
                          Today's risk · Losses ${risk.dailyLoss.toFixed(2)} · Reserved ${risk.reservedLoss.toFixed(2)} · Cap ${risk.dailyLossLimit.toFixed(2)} · Resets 00:00 UTC
                        </small>
                      )}
                      <button
                        className="botCenterPrimary"
                        disabled={busy !== null || !!sockets.has(bot.id) || selection?.control_status !== "selected"}
                        onClick={() => void startPaper(bot)}
                      >
                        Start paper simulation
                      </button>
                      <button className="botCenterSecondary" disabled={!sockets.has(bot.id)} onClick={() => stopPaper(bot.id)}>
                        Pause simulation
                      </button>
                      <small className="botCenterEngineStatus">
                        {engineStatus[bot.id] || "Paper engine stopped"}
                        {livePrices[bot.id] !== undefined ? " · Live " + livePrices[bot.id] : ""}
                      </small>
                      {selection?.control_status === "selected"
                        ? <button className="botCenterSecondary" disabled={busy !== null} onClick={() => void changeStatus(bot, "paused")}>Pause preference</button>
                        : <button className="botCenterSecondary" disabled={busy !== null} onClick={() => void changeStatus(bot, "selected")}>Mark selected</button>}
                      <button className="botCenterDanger" disabled={busy !== null} onClick={() => void changeStatus(bot, "stopped")}>Mark stopped</button>
                    </div>
                  )}

                  {tab === "marketplace" && (
                    <button className="botCenterPrimary" disabled={busy !== null || !!selection} onClick={() => void addBot(bot)}>
                      {busy === bot.id ? "Saving…" : selection ? "Already in My Bots" : "Add to My Bots"}
                    </button>
                  )}
                </article>
              );
            })}
            {(tab === "marketplace" ? bots : myBots).length === 0 && (
              <div className="botCenterEmpty">
                {tab === "marketplace"
                  ? "No published bots are available yet. Check back after the administrator publishes strategies."
                  : "You have not added any bots yet. Visit the Free Marketplace to get started."}
              </div>
            )}
          </section>
        )}

        <footer className="botCenterFooter">
          <Link href="/admin/bots">Admin bot catalogue</Link>
          <span>Trade smarter. Stay in control. · Trading involves risk.</span>
        </footer>
      </section>
    </main>
  );
}
