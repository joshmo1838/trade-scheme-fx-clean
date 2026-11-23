"use client";
import Link from "next/link";
import DerivAccountPrompt from "@/components/DerivAccountPrompt";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [derivStatus, setDerivStatus] = useState("");

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("deriv");
    const messages: Record<string, string> = {
      identity_verified: "Deriv confirmed your identity successfully. This is a staging verification: dashboard sign-in has not yet been enabled.",
      not_ready: "Deriv sign-in is not configured for this website yet. You can still use your existing account below.",
      invalid_callback: "Deriv sign-in could not be verified securely. Please try again.",
      token_exchange_failed: "Deriv authorization failed during the secure token exchange. Please try again.",
      identity_failed: "Deriv login succeeded, but we could not verify your customer identity.",
      login_failed: "Deriv sign-in could not be completed. No customer account was accessed.",
      cancelled: "Deriv authorization was cancelled."
    };
    setDerivStatus(status ? messages[status] ?? "" : "");
  }, []);

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

  return <main className="authPage videoAuthPage"><div className="authCard">
    <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
    <p className="eyebrow">WELCOME BACK</p><h1>Log in</h1>
    <p className="muted">Connect your Deriv account to Trade Scheme FX.</p>
    <a className="button full" href="/api/auth/deriv/start">Continue with Deriv</a>
    <DerivAccountPrompt compact />
    <details style={{marginTop: "1rem"}}>
      <summary>Existing Trade Scheme FX sign-in</summary>
      <form onSubmit={submit} className="form">
        <label>Email address<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>
        <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} /></label>
        <button className="button full" disabled={busy}>{busy ? "Signing in…" : "Log in with existing account"}</button>
      </form>
    </details>
    {derivStatus && <p className="notice" role="status">{derivStatus}</p>}
    {message && <p className="notice">{message}</p>}
    <p className="muted center">New here? <Link href="/signup">Create a free account</Link></p>
    <Link className="back" href="/">← Back to home</Link>
  </div></main>;
}
