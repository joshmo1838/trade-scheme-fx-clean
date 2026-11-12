import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MessageThread from "@/app/components/MessageThread";

export default async function AdminCustomerMessages({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: customer } = await supabase.from("profiles")
    .select("id,full_name,email").eq("id", customerId).maybeSingle();
  if (!customer) notFound();

  let { data: conversation } = await supabase.from("conversations")
    .select("id").eq("customer_id", customerId).maybeSingle();

  if (!conversation) {
    const { data, error } = await supabase.from("conversations")
      .insert({ customer_id: customerId }).select("id").single();
    if (error) {
      const retry = await supabase.from("conversations").select("id").eq("customer_id", customerId).maybeSingle();
      conversation = retry.data;
    } else conversation = data;
  }

  return <main className="appShell"><header className="dashNav"><Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link><Link className="button secondary small" href="/admin">Back to admin</Link></header>
    <section className="dashContent"><p className="eyebrow">ADMIN CUSTOMER SUPPORT</p><h1>{customer.full_name || "Customer"}</h1><p className="muted">{customer.email}</p>
      {conversation ? <MessageThread conversationId={conversation.id} currentUserId={user.id} heading={`Conversation with ${customer.full_name || customer.email || "customer"}`}/> : <div className="panel"><p className="notice">Could not create a conversation. Run the messaging SQL migration and try again.</p></div>}
    </section></main>;
}
