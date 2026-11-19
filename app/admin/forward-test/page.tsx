import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { summarizeForwardTrades, type ForwardTradeRecord, type ForwardMetrics } from "@/lib/forward/metrics";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "SENFX R100 Forward Study | Admin",
  robots: { index: false, follow: false },
};
const RUN_ID = "r100-strict-v1";
type ForwardRun = {
  run_id: string;
  market_symbol: string;
  target_trades: number;
  status: string;
  updated_at: string;
  state: { completedTrades?: number } | null;
};

function CumulativeCurve({ metrics }: { metrics: ForwardMetrics }) {
  const values = metrics.curve.map(p => p.scoreR);
  const low = Math.min(...values) - 1;
  const high = Math.max(...values) + 1;
  const width = 720, height = 210, inset = 18;
  const points = metrics.curve.map(p => {
    const x = inset + p.index / Math.max(1, metrics.count) * (width - 2 * inset);
    const y = height - inset - (p.scoreR - low) / (high - low) * (height - 2 * inset);
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  const zeroY = height - inset - (0 - low) / (high - low) * (height - 2 * inset);
  return (
    <svg viewBox="0 0 720 210" role="img" aria-label={"Cumulative directional paper score by completed observation. Final score " + metrics.netScoreR + " R."} style={{ width: "100%", maxWidth: 800 }}>
      <line x1="18" y1={zeroY} x2="702" y2={zeroY} stroke="#48677c" strokeDasharray="4 6"/>
      <polyline points={points} fill="none" stroke="#49d5aa" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
      <text x="18" y="204" fill="#a9c2cf" fontSize="11">Observation 0</text>
      <text x="700" y="204" fill="#a9c2cf" fontSize="11" textAnchor="end">{metrics.count} observations</text>
      <text x="18" y="14" fill="#a9c2cf" fontSize="11">Research score (R units)</text>
    </svg>
  );
}

export default async function ForwardTestAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile, error: roleError } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (roleError || profile?.role !== "admin") redirect("/dashboard");

  let run: ForwardRun | null = null;
  let rows: ForwardTradeRecord[] = [];
  let unavailable = "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    unavailable = "Read-only research reporting is not configured.";
  } else {
    try {
      // Server-only privileged reads are performed AFTER admin-role verification.
      // No token, account identifier, customer trades or Deriv connection is sent to the browser.
      const admin = createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const [runs, trades] = await Promise.all([
        admin.from("senfx_forward_runs")
          .select("run_id,market_symbol,target_trades,status,state,updated_at")
          .eq("run_id", RUN_ID).maybeSingle(),
        admin.from("senfx_forward_trades")
          .select("signal_epoch,direction,outcome,pnl_r,closed_at")
          .eq("run_id", RUN_ID).order("signal_epoch", { ascending: true }).limit(200),
      ]);
      if (runs.error || trades.error) {
        unavailable = "The forward research records could not be verified.";
      } else {
        run = runs.data as ForwardRun | null;
        rows = (trades.data ?? []) as ForwardTradeRecord[];
      }
    } catch {
      unavailable = "The research database is unavailable.";
    }
  }

  let metrics: ForwardMetrics | null = null;
  if (!unavailable && run) {
    try { metrics = summarizeForwardTrades(rows); }
    catch { unavailable = "Inconsistent study records; statistics withheld pending review."; }
  }
  const target = Math.max(1, Math.min(200, Number(run?.target_trades) || 200));
  const recorded = metrics?.count ?? 0;
  const percent = Math.min(100, recorded / target * 100);
  const stateCount = run?.state?.completedTrades;
  const stateMatches = typeof stateCount === "number" && stateCount === recorded;
  const latest = rows.length ? rows[rows.length - 1].closed_at : null;
  const lastTrades = rows.slice(-12).reverse();

  return (
    <main className="appShell">
      <header className="dashNav">
        <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
        <div className="actions">
          <Link className="button secondary small" href="/admin">Admin</Link>
          <Link className="button secondary small" href="/dashboard">Dashboard</Link>
        </div>
      </header>
      <div className="dashContent" style={{ maxWidth: 1120 }}>
        <p className="eyebrow">ADMIN ONLY · R100 FORWARD PAPER RESEARCH</p>
        <h1>200-observation study</h1>
        <p className="muted">Independent recorded directional outcomes from the R_100 public market, not broker contracts, settled winnings, customer balances or verified investment returns.</p>
        {unavailable ? <section className="panel" role="alert"><h2>Results unavailable</h2><p>{unavailable}</p></section> :
          !run ? <section className="panel"><h2>No recorded study</h2><p>No R100 study run is present; no performance is inferred.</p></section> : (
          <>
            <section className="panel">
              <p className="eyebrow">PERSISTED RESEARCH PROGRESS · STATUS {run.status.toUpperCase()}</p>
              <h2>{recorded} / {target} recorded outcomes</h2>
              <div role="progressbar" aria-label="Recorded study progress" aria-valuemin={0} aria-valuemax={target} aria-valuenow={recorded}
                style={{ width: "100%", height: 12, borderRadius: 12, background: "#17354e", overflow: "hidden" }}>
                <div style={{ width: percent + "%", background: "#49d5aa", height: "100%" }}/>
              </div>
              <p className="muted">Latest completed observation: {latest ? new Date(latest).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC" : "none"}.
                Database state: {stateMatches ? "agrees with stored outcome count" : "requires reconciliation"}.
                Last status update: {new Date(run.updated_at).toLocaleString("en-US", { timeZone: "UTC" })} UTC.</p>
            </section>
            {metrics && <div className="dashGrid">
              <article className="panel"><p className="eyebrow">DIRECTIONAL HITS</p><h2>{metrics.wins}</h2><p>Misses: {metrics.losses}</p></article>
              <article className="panel"><p className="eyebrow">OBSERVED HIT RATE</p><h2>{metrics.hitRate === null ? "—" : metrics.hitRate.toFixed(1) + "%"}</h2><p>Only {metrics.count} saved forward observations.</p></article>
              <article className="panel"><p className="eyebrow">CUMULATIVE RESEARCH SCORE</p><h2>{metrics.netScoreR > 0 ? "+" : ""}{metrics.netScoreR} R</h2><p>+1 hit / −1 miss; not financial P/L.</p></article>
              <article className="panel"><p className="eyebrow">MAX OBSERVED DRAWDOWN</p><h2>{metrics.maxDrawdownR} R</h2><p>Longest consecutive miss streak: {metrics.longestLossStreak}</p></article>
            </div>}
            {metrics && metrics.count > 0 && <section className="panel">
              <h2>Recorded outcome sequence</h2>
              <CumulativeCurve metrics={metrics}/>
              <p className="muted">This curve measures a simplified directional +1/−1 research score. It does not include Deriv contract pricing, fees or payouts.</p>
            </section>}
            <section className="panel">
              <h2>Most recent twelve recorded observations</h2>
              {!lastTrades.length ? <p className="muted">No outcomes recorded yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 620, textAlign: "left" }}>
                    <thead><tr>{["Closed (UTC)", "Direction", "Outcome", "Research score"].map(label =>
                      <th key={label} style={{ padding: 10 }}>{label}</th>)}</tr></thead>
                    <tbody>{lastTrades.map(trade => <tr key={trade.signal_epoch}>
                      <td style={{ padding: 10 }}>{new Date(trade.closed_at).toLocaleString("en-US", { timeZone: "UTC" })}</td>
                      <td style={{ padding: 10 }}>{trade.direction}</td>
                      <td style={{ padding: 10 }}>{trade.outcome}</td>
                      <td style={{ padding: 10 }}>{Number(trade.pnl_r) > 0 ? "+1 R" : "−1 R"}</td>
                    </tr>)}</tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
        <p className="disclaimer">Research only. Nothing on this page starts, pauses or settles a bot; nothing authorizes Deriv Demo or Real orders. Short-run hit rates do not prove predictive advantage or profit.</p>
      </div>
    </main>
  );
}
