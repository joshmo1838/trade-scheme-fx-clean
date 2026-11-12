import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: customers, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="appShell">
      <header className="dashNav">
        <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
        <Link className="button secondary small" href="/dashboard">Customer dashboard</Link>
      </header>
      <section className="dashContent">
        <p className="eyebrow">ADMIN AREA</p>
        <h1>Platform administration</h1>
        <div className="panel adminIntro">
          <h2>Admin access verified</h2>
          <p className="muted">You are signed in as an administrator. View customers and message them privately inside the platform.</p>
        </div>
        <div className="actions"><Link className="button" href="/admin/bots">Manage trading bots</Link></div>
        <div className="adminSectionHead">
          <div><p className="eyebrow">CUSTOMER MANAGEMENT</p><h2>Registered customers</h2></div>
          <span className="customerCount">{customers?.length ?? 0} accounts</span>
        </div>
        {error ? (
          <div className="panel"><p className="notice">Could not load customer records. Run the SQL migration in supabase/admin-customer-email.sql in your Supabase SQL Editor, then refresh this page.</p></div>
        ) : !customers?.length ? (
          <div className="panel"><p className="muted">No customer profiles were found yet.</p></div>
        ) : (
          <div className="customerList">
            {customers.map((customer) => {
              const subject = encodeURIComponent("A message from Trade Scheme FX");
              const body = encodeURIComponent(
                `Hello ${customer.full_name || "there"},\n\n\n\nRegards,\nTrade Scheme FX`
              );
              const href = customer.email
                ? `mailto:${customer.email}?subject=${subject}&body=${body}`
                : null;
              return (
                <article className="customerRow" key={customer.id}>
                  <div className="customerDetails">
                    <strong>{customer.full_name || "Trade Scheme FX customer"}</strong>
                    <span>{customer.email || "Email not available"}</span>
                    <small>Role: {customer.role}</small>
                  </div>
                  {href ? (
                    <div className="customerActions"><Link className="button small" href={`/admin/messages/${customer.id}`}>Message customer</Link>{href && <a className="button secondary small" href={href}>Email customer</a>}</div>
                  ) : (
                    <span className="muted smallText">No email address</span>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <p className="disclaimer">Selecting “Email customer” opens your device's email app with the customer's address filled in. You review and send the message yourself. This page does not send email automatically.</p>
        <Link className="back" href="/">← Visit homepage</Link>
      </section>
    </main>
  );
}
