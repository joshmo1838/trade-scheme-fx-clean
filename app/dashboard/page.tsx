import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const name = user.user_metadata?.full_name || user.email || "Trader";

  return <main className="appShell"><header className="dashNav"><Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link><form action="/auth/signout" method="post"><button className="button secondary small">Sign out</button></form></header>
    <section className="dashContent"><p className="eyebrow">CUSTOMER DASHBOARD</p><h1>Welcome, {name}</h1><p className="muted">Your trading workspace is being set up.</p>
      <div className="actions"><Link className="button" href="/messages">Messages & support</Link><Link className="button secondary" href="/bots">Browse trading bots</Link><Link className="button secondary" href="/bot-settings">Bot settings</Link><Link className="button secondary" href="/builder">Bot Builder</Link><Link className="button secondary" href="/bulk-trader">Bulk Trader</Link><Link className="button secondary" href="/manual-trader">Manual Trader</Link><Link className="button secondary" href="/copy-trading">Copy Trading</Link><Link className="button secondary" href="/digit-tools">Digit Tools</Link><Link className="button secondary" href="/charts">Charts</Link><Link className="button secondary" href="/ai-scanner">AI Scanner</Link><Link className="button secondary" href="/history">Trading History</Link></div>
      <div className="dashGrid"><article className="panel"><p className="eyebrow">DERIV ACCOUNT</p><h2>Not connected</h2><p className="muted">Secure Deriv authorization will be added after the Deriv application is configured. Your Deriv password should never be entered here.</p><button className="button" disabled>Connect Deriv — setup pending</button></article>
      <article className="panel"><p className="eyebrow">BOT CONTROL</p><h2>Bot controls are locked</h2><p className="muted">Live bot execution is not active yet. We will enable controls only after the Deriv API connection, risk limits, and testing are complete.</p><button className="button secondary" disabled>Bot controls coming soon</button></article>
      <article className="panel"><p className="eyebrow">MEMBERSHIP</p><h2>Free</h2><p className="muted">There is no monthly platform membership charge.</p></article>
      <article className="panel"><p className="eyebrow">ACCOUNT</p><h2>Profile</h2><p className="muted">{user.email}</p><p className="muted">Account ID: {user.id}</p></article></div>
      <p className="disclaimer">Trading involves risk, including the possible loss of your capital. Trade Scheme FX does not guarantee profits or provide investment advice.</p>
      <Link className="back" href="/">← Visit homepage</Link>
    </section></main>;
}
