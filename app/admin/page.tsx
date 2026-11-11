import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  return <main className="appShell"><header className="dashNav"><Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link><Link className="button secondary small" href="/dashboard">Customer dashboard</Link></header><section className="dashContent"><p className="eyebrow">ADMIN AREA</p><h1>Platform administration</h1><div className="panel"><h2>Admin access verified</h2><p className="muted">This protected area is ready for customer, bot, and platform management modules. Those management actions are not enabled in this starter build.</p></div></section></main>;
}
