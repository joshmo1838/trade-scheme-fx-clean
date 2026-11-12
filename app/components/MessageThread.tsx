"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Message = { id: string; sender_id: string; body: string; created_at: string };

export default function MessageThread({
  conversationId, currentUserId, heading
}: { conversationId: string; currentUserId: string; heading: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  async function loadMessages() {
    const supabase = createClient();
    const { data, error } = await supabase.from("messages")
      .select("id,sender_id,body,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) { setError(error.message); return; }
    setMessages((data || []) as Message[]);
  }

  useEffect(() => {
    const supabase = createClient();
    loadMessages();
    const channel = supabase.channel(`messages-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${conversationId}`
      }, () => { loadMessages(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const clean = body.trim();
    if (!clean || busy) return;
    setBusy(true); setError("");
    const supabase = createClient();
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: currentUserId, body: clean
    });
    if (error) setError(error.message);
    else { setBody(""); await loadMessages(); }
    setBusy(false);
  }

  return <section className="messagePanel">
    <div className="messageHeader"><div><p className="eyebrow">PRIVATE IN-APP MESSAGES</p><h2>{heading}</h2></div><span className="livePill">● LIVE THREAD</span></div>
    <div className="messageList">
      {messages.length === 0 && <p className="emptyMessages">No messages yet. Send the first message to start this conversation.</p>}
      {messages.map(m => <div key={m.id} className={`messageBubble ${m.sender_id === currentUserId ? "mine" : "theirs"}`}>
        <p>{m.body}</p><time>{new Date(m.created_at).toLocaleString()}</time>
      </div>)}
      <div ref={bottom}/>
    </div>
    <form className="messageComposer" onSubmit={send}>
      <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Write a message..." maxLength={4000} rows={3}/>
      <button className="button" disabled={busy || !body.trim()}>{busy ? "Sending..." : "Send message"}</button>
    </form>
    {error && <p className="notice">{error}</p>}
    <p className="messagePrivacy">Messages are visible to the customer and authorized Trade Scheme FX administrators.</p>
  </section>;
}
