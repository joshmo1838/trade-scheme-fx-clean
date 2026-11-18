"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { nextBotDesiredState, paperBotDisplayStatus } from "@/lib/bots/control-state";

type PaperBot = { id: string; name: string; market: string };
type Selection = { bot_id: string; selected: boolean; control_status: string };
type Run = {
  id: string; bot_id: string; mode: string; desired_state: string;
  observed_state: string; control_version: number;
  heartbeat_at: string | null; lease_expires_at: string | null;
  last_error: string | null; updated_at: string; workerConnected?: boolean;
};
type Command = {
  id: string; bot_id: string; action: string; requested_state: string;
  version: number; status: string; created_at: string;
};
type OpenPosition = {
  id: string; bot_id: string; status: string; remaining_ticks: number; entered_at: string;
};
type DailyRisk = {
  bot_id: string; risk_date: string; daily_loss_limit: number | string;
  realized_loss: number | string; reserved_loss: number | string;
};
type ControlResponse = {
  enabled?: boolean; workerAttached?: boolean; mode?: string;
  runs?: Run[]; commands?: Command[];
  positions?: OpenPosition[]; dailyRisk?: DailyRisk[];
  message?: string; error?: string;
};

export default function PaperBotControlConsole() {
  const [bots, setBots] = useState<PaperBot[]>([]);
  const [selection, setSelection] = useState<Selection[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [dailyRisk, setDailyRisk] = useState<DailyRisk[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [workerAttached, setWorkerAttached] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusClock, setStatusClock] = useState(() => Date.now());
  const [lastStatusCheck, setLastStatusCheck] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setEnabled(false);
        setWorkerAttached(false);
        setRuns([]);
        setCommands([]);
        setPositions([]);
        setDailyRisk([]);
        setLastStatusCheck(null);
        setError("Please sign in to see your paper bots.");
        return;
      }
      const [botsResult, selectedResult, controlResponse] = await Promise.all([
        supabase.from("bots").select("id,name,market").eq("is_published", true).order("name"),
        supabase.from("customer_bots").select("bot_id,selected,control_status")
          .eq("customer_id", user.id).eq("trading_mode", "demo"),
        fetch("/api/bot-control", { cache: "no-store", credentials: "same-origin" }),
      ]);
      const result: ControlResponse = await controlResponse.json();
      if (botsResult.error || selectedResult.error || !controlResponse.ok) {
        throw new Error(result.error || "Unable to fetch customer paper bot controls.");
      }
      setBots((botsResult.data || []) as PaperBot[]);
      setSelection((selectedResult.data || []) as Selection[]);
      setEnabled(result.enabled === true);
      setWorkerAttached(result.workerAttached === true);
      setRuns(result.runs || []);
      setCommands(result.commands || []);
      setPositions(result.positions || []);
      setDailyRisk(result.dailyRisk || []);
      setLastStatusCheck(Date.now());
      setMessage(result.message || "");
    } catch (cause) {
      setEnabled(false);
      setWorkerAttached(false);
      setRuns([]);
      setCommands([]);
      setPositions([]);
      setDailyRisk([]);
      setLastStatusCheck(null);
      setError(cause instanceof Error ? cause.message : "Unable to fetch paper controls.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshWorkerState = useCallback(async () => {
    try {
      const response = await fetch("/api/bot-control", {
        cache: "no-store", credentials: "same-origin",
      });
      const result: ControlResponse = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to refresh worker verification.");
      setEnabled(result.enabled === true);
      setWorkerAttached(result.workerAttached === true);
      setRuns(result.runs || []);
      setCommands(result.commands || []);
      setPositions(result.positions || []);
      setDailyRisk(result.dailyRisk || []);
      setLastStatusCheck(Date.now());
      setError("");
    } catch (cause) {
      // Network loss or an expired sign-in must never leave old "running"
      // state or enabled buttons on screen.
      setEnabled(false);
      setWorkerAttached(false);
      setRuns([]);
      setCommands([]);
      setPositions([]);
      setDailyRisk([]);
      setLastStatusCheck(null);
      setError(cause instanceof Error ? cause.message : "Worker verification unavailable.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      setStatusClock(Date.now());
      if (document.visibilityState === "visible") void refreshWorkerState();
    }, 6_000);
    const onVisible = () => {
      setStatusClock(Date.now());
      if (document.visibilityState === "visible") void refreshWorkerState();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, refreshWorkerState]);

  async function requestCommand(botId: string, action: "start" | "pause" | "resume" | "stop") {
    if (!enabled || busy) return;
    setBusy(botId);
    setError("");
    setMessage("");
    try {
      const commandId = crypto.randomUUID();
      const response = await fetch("/api/bot-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ botId, commandId, action }),
      });
      const result = await response.json();
      if (!response.ok || result.accepted !== true) {
        throw new Error(result.error || "Paper bot control was rejected.");
      }
      setMessage("Saved " + action.toUpperCase() + " request #" + result.version +
        ". This is only a queued PAPER request; no worker or broker trade is confirmed.");
      await refreshWorkerState();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to queue paper command.");
    } finally {
      setBusy("");
    }
  }

  const myBots = bots.filter(bot => selection.some(row => row.bot_id === bot.id));
  return (
    <main className="wrap" style={{paddingTop: 30, paddingBottom: 60}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:15,flexWrap:"wrap"}}>
        <div>
          <p className="eyebrow">TRADE SCHEME FX · CONTROL PLANE</p>
          <h1>Persistent paper bot controls</h1>
          <p className="muted">Review saved customer commands and the actual reported worker state independently.</p>
        </div>
        <Link className="button secondary" href="/dashboard">← Dashboard</Link>
      </div>
      <section className="panel" style={{margin:"20px 0",borderColor:enabled?"#396a86":"#926e38"}}>
        <h2>{enabled ? "Command queue available" : "Server bot control not enabled yet"}</h2>
        <p>{enabled && workerAttached
          ? "Commands are available. Check each bot's actual worker state before assuming it is running."
          : "No verified persistent customer bot worker is connected. This control plane does not buy Deriv Demo or Real contracts."}</p>
        <p className="muted">Paper research mode only · Demo broker purchases disabled · Real-money execution disabled</p>
        <p className="muted" style={{fontSize:12}}>
          {lastStatusCheck === null
            ? "Worker verification unavailable."
            : "Last worker status check: " + new Date(lastStatusCheck).toLocaleTimeString() +
              " · Automatic refresh every 6 seconds while this page is visible."}
        </p>
        <button type="button" className="button secondary" disabled={loading || !!busy}
          onClick={() => void refresh()}>Refresh verified status</button>
      </section>
      {error && <p role="alert" style={{color:"#ffafb8"}}>{error}</p>}
      {message && <p role="status" className="muted">{message}</p>}
      {loading ? <p>Loading your paper controls…</p> :
        myBots.length === 0 ? <section className="panel">
          <p>No published paper bots have been added to your account.</p>
          <Link href="/bot-center">Open Bot Center ↗</Link>
        </section> :
        <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
          {myBots.map(bot => {
            const run = runs.find(row => row.bot_id === bot.id);
            const desired = run?.desired_state || "stopped";
            const actual = run?.observed_state || "stopped";
            const latest = commands.find(row => row.bot_id === bot.id);
            const status = paperBotDisplayStatus(run || null, statusClock);
            const openPositions = positions.filter(row => row.bot_id === bot.id);
            const risk = dailyRisk.find(row => row.bot_id === bot.id);
            const reserved = risk ? Number(risk.reserved_loss) : null;
            const used = risk ? Number(risk.realized_loss) : null;
            const dailyLimit = risk ? Number(risk.daily_loss_limit) : null;
            const canUse = enabled && !busy;
            const sel = selection.find(row => row.bot_id === bot.id);
            return (
              <article key={bot.id} className="panel" style={{display:"flex",flexDirection:"column",gap:9}}>
                <p className="eyebrow" style={{margin:0}}>PAPER · {bot.market}</p>
                <h2 style={{margin:0}}>{bot.name}</h2>
                <p style={{margin:0,fontSize:13}}>Requested: <strong>{desired.toUpperCase()}</strong></p>
                <p style={{margin:0,fontSize:13}}>
                  Worker status: <strong>{status.label}</strong>
                </p>
                <p className="muted" style={{fontSize:12,margin:0}}>{status.detail}</p>
                <p className="muted" style={{fontSize:12,margin:0}}>
                  Last reported state: {actual.toUpperCase()} · {run?.workerConnected ? "Backend lease reported active" : "No verified backend lease"}
                </p>
                <p className="muted" style={{fontSize:12,margin:0}}>
                  {run?.heartbeat_at
                    ? "Last worker heartbeat: " + new Date(run.heartbeat_at).toLocaleString() +
                      (run.workerConnected ? " (lease active)" : " (stale or disconnected)")
                    : "No verified worker heartbeat"}
                </p>
                {latest && <p className="muted" style={{fontSize:12,margin:0}}>
                  Latest command: {latest.action} · {latest.status} · revision {latest.version}
                </p>}
                <div style={{borderTop:"1px solid #324658",paddingTop:9,marginTop:3}}>
                  <p style={{margin:0,fontSize:13}}>
                    Open simulated positions: <strong>{openPositions.length}</strong>
                    {openPositions.length > 0 &&
                      " · remaining " + openPositions[0].remaining_ticks + " paper ticks"}
                  </p>
                  {risk && reserved !== null && used !== null && dailyLimit !== null &&
                   Number.isFinite(reserved) && Number.isFinite(used) && Number.isFinite(dailyLimit)
                    ? <p style={{margin:"6px 0 0",fontSize:13}}>
                        Paper risk (UTC): <strong>{"$" + reserved.toFixed(2) + " reserved"}</strong>
                        {" · $" + used.toFixed(2) + " realized loss"}
                        {" · $" + dailyLimit.toFixed(2) + " daily cap"}
                      </p>
                    : <p className="muted" style={{margin:"6px 0 0",fontSize:12}}>
                        No verified paper-risk ledger record available for today.
                      </p>}
                  {openPositions.length > 0 && <p role="status" style={{fontSize:12,margin:"6px 0 0"}}>
                    Open PAPER exposure is recorded. A queued Stop is not proof of cancellation.
                  </p>}
                </div>
                {run?.last_error && <p role="alert">{run.last_error}</p>}
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
                  {(["start","pause","resume","stop"] as const).map(action => {
                    const allowed = nextBotDesiredState(desired, action) !== null;
                    return <button type="button" key={action}
                      className={action === "stop" ? "button secondary small" : "button small"}
                      disabled={!canUse || !allowed ||
                        ((action === "start" || action === "resume") && !sel?.selected)}
                      onClick={() => void requestCommand(bot.id,action)}>
                      {busy===bot.id ? "Saving…" : action.charAt(0).toUpperCase()+action.slice(1)}
                    </button>;
                  })}
                </div>
                <p className="muted" style={{fontSize:11,margin:0}}>
                  A command changes desired state only. It never confirms execution.
                </p>
              </article>
            );
          })}
        </section>
      }
    </main>
  );
}
