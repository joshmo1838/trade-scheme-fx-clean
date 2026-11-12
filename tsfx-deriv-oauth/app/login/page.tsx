 "use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = "/dashboard";
    } catch (err) { setMessage(err instanceof Error ? err.message : "Unable to sign in."); }
    finally { setBusy(false); }
  }

  return <main className="authPage"><div className="authCard"><Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link><p className="eyebrow">WELCOME BACK</p><h1>Log in</h1><p className="muted">Access your customer dashboard.</p>
    <form onSubmit={submit} className="form"><label>Email address<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} /></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} /></label><button className="button full" disabled={busy}>{busy ? "Signing in…" : "Log in"}</button></form>
    {message && <p className="notice">{message}</p>}<p className="muted center">New here? <Link href="/signup">Create a free account</Link></p><Link className="back" href="/">← Back to home</Link></div></main>;
}
