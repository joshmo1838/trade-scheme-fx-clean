import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MessageThread from "@/app/components/MessageThread";

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let { data: conversation } = await supabase
    .from("conversations").select("id").eq("customer_id", user.id).maybeSingle();

  if (!conversation) {
    const { data, error } = await supabase
      .from("conversations").insert({ customer_id: user.id }).select("id").single();
    if (error) {
      const retry = await supabase.from("conversations").select("id").eq("customer_id", user.id).maybeSingle();
      conversation = retry.data;
    } else conversation = data;
  }

  return <main className="appShell"><header className="dashNav"><Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link><Link className="button secondary small" href="/dashboard">Customer dashboard</Link></header>
    <section className="dashContent"><p className="eyebrow">CUSTOMER SUPPORT</p><h1>Messages</h1><p className="muted">Talk directly with the Trade Scheme FX team in your account.</p>
      {conversation ? <MessageThread conversationId={conversation.id} currentUserId={user.id} heading="Trade Scheme FX Support"/> : <div className="panel"><p className="notice">Your message conversation could not be created. Please contact support or try again.</p></div>}
    </section></main>;
}
