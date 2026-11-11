 "use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/auth/callback` }
      });
      if (error) throw error;
      setMessage(data.session ? "Account created. You can now log in." : "Check your email to confirm your account, then log in.");
    } catch (err) { setMessage(err instanceof Error ? err.message : "Unable to create account."); }
    finally { setBusy(false); }
  }

  return <main className="authPage"><div className="authCard"><Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link><p className="eyebrow">FREE CUSTOMER ACCOUNT</p><h1>Create account</h1><p className="muted">No monthly platform membership fee.</p>
    <form onSubmit={submit} className="form"><label>Full name<input required value={name} onChange={e=>setName(e.target.value)} autoComplete="name" /></label><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" /></label><label>Password<input type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" /><small>Use at least 8 characters.</small></label><button className="button full" disabled={busy}>{busy ? "Creating account…" : "Create free account"}</button></form>
    {message && <p className="notice">{message}</p>}<p className="muted center">Already registered? <Link href="/login">Log in</Link></p><Link className="back" href="/">← Back to home</Link></div></main>;
}
