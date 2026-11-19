import Link from "next/link";
import { WorkspaceEvidence } from "@/app/components/WorkspaceEvidence";
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

  const { count: botCount, error: botCountError } = await supabase.from("bots").select("id", { count: "exact", head: true });
  const { count: publishedBotCount, error: publishedBotCountError } = await supabase.from("bots").select("id", { count: "exact", head: true }).eq("is_published", true);
  const { count: selectionCount, error: selectionCountError } = await supabase.from("customer_bots").select("id", { count: "exact", head: true });
  const countsAvailable = !botCountError && !publishedBotCountError && !selectionCountError && botCount !== null && publishedBotCount !== null && selectionCount !== null;

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
        <WorkspaceEvidence
          label="Administrative data access"
          state={error || !countsAvailable ? "unavailable" : "verified"}
          source="Authenticated, role-gated Supabase profile and aggregate queries"
        >
          <p className="muted">{error ? "One or more administrative queries could not be verified. Review unavailable metrics below." : "Customer profile access was checked. Aggregate counts are verified only when every query succeeds."}</p>
        </WorkspaceEvidence>
        <div className="actions"><Link className="button" href="/admin/bots">Manage trading bots</Link><Link className="button secondary" href="/admin/forward-test">R100 forward study</Link><Link className="button secondary" href="/admin/bots">Publish / unpublish bots</Link></div>
        <div className="dashGrid">
          <article className="panel"><p className="eyebrow">CUSTOMER ACCOUNTS</p><h2>{error ? "Unavailable" : customers?.length ?? 0}</h2><p>Registered platform profiles.</p></article>
          <article className="panel"><p className="eyebrow">BOT PROFILES</p><h2>{botCountError ? "Unavailable" : botCount ?? "Unavailable"}</h2><p>{publishedBotCountError ? "Unavailable" : publishedBotCount ?? "Unavailable"} currently published.</p></article>
          <article className="panel"><p className="eyebrow">CUSTOMER BOT SELECTIONS</p><h2>{selectionCountError ? "Unavailable" : selectionCount ?? "Unavailable"}</h2><p>Saved bot preferences across customer accounts.</p></article>
        </div>
        <div className="adminSectionHead">
          <div><p className="eyebrow">CUSTOMER MANAGEMENT</p><h2>Registered customers</h2></div>
          <span className="customerCount">{error ? "Count unavailable" : `${customers?.length ?? 0} accounts`}</span>
        </div>
        {error ? (
          <div className="panel"><p className="notice">Could not load customer records. Contact platform support to review database access and query status; do not run schema changes from this page.</p></div>
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
