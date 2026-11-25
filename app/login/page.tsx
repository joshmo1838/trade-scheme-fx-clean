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
  const [opening, setOpening] = useState(true);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("deriv");
    if (!status) {
      window.location.replace("/api/auth/deriv/start");
      return;
    }
    const messages: Record<string, string> = {
      identity_verified: "Deriv confirmed your identity successfully. This is a staging verification: dashboard sign-in has not yet been enabled.",
      not_ready: "Deriv sign-in is not configured for this website yet. You can still use your existing account below.",
      invalid_callback: "Deriv sign-in could not be verified securely. Please try again.",
      token_exchange_failed: "Deriv authorization failed during the secure token exchange. Please try again.",
      identity_failed: "Deriv login succeeded, but we could not verify your customer identity.",
      login_failed: "Deriv sign-in could not be completed. No customer account was accessed.",
      cancelled: "Deriv authorization was cancelled."
    };
    setDerivStatus(messages[status] ?? "Unable to complete Deriv sign-in. Please retry.");
    setOpening(false);
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

  if (opening) return <main className="authPage videoAuthPage"><div className="authCard" role="status" aria-live="polite" aria-busy="true" style={{textAlign:"center"}}>
    <style>{`@keyframes derivOrbit { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { .derivOrbit { animation: none !important; } }`}</style>
    <p className="eyebrow">TRADE SCHEME FX 3.0</p>
    <div className="derivOrbit" aria-hidden="true" style={{width:76,height:76,margin:"24px auto",border:"3px solid #164e63",borderTopColor:"#67e8f9",borderRadius:"50%",animation:"derivOrbit 1.2s linear infinite"}} />
    <h1>Getting ready...</h1><p className="muted">Opening secure Deriv authentication.</p>
    <a href="/api/auth/deriv/start">Continue with Deriv if not redirected</a>
  </div></main>;

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
