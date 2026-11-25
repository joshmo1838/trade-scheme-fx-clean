import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Bot Workspace | Trade Scheme FX" };
export default function Page() { return <main style={{maxWidth:960,margin:"auto",padding:"48px 24px"}}><h1>Bot workspace</h1><p>No bots available. New strategies are in development.</p><Link href="/dashboard">Return to dashboard</Link></main>; }
