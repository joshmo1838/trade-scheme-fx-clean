import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DERIV_PRESET_REFERENCE } from "@/lib/deriv/official-preset-reference.mjs";

export default async function DerivPresetsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const options = DERIV_PRESET_REFERENCE.filter(item => item.family === "options");
  const accumulators = DERIV_PRESET_REFERENCE.filter(item => item.family === "accumulators");
  return <main className="mx-auto max-w-6xl px-5 py-10 text-white">
    <Link href="/dashboard" className="text-sm text-cyan-300 hover:underline">← Back to dashboard</Link>
    <h1 className="mt-5 text-3xl font-bold">Deriv Strategy Templates</h1>
    <p className="mt-3 max-w-3xl text-slate-300">Research preview of documented Deriv-style strategy concepts. These templates are not yet executable bots, official imported Deriv Bot XML files, or broker orders. No real or virtual funds are used here.</p>
    {[{title:"Options",items:options},{title:"Accumulators",items:accumulators}].map(group =>
      <section key={group.title} className="mt-9">
        <h2 className="mb-4 text-xl font-semibold">{group.title} ({group.items.length})</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {group.items.map(item => <article key={item.id} className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h3 className="font-semibold">{item.name}</h3>
            <p className="mt-2 text-xs text-amber-300">Research catalog · Not implemented · Trading disabled</p>
            <p className="mt-2 text-xs text-slate-400">ID: {item.id}</p>
          </article>)}
        </div>
      </section>)}
    <p className="mt-8 text-sm text-slate-400">Existing 15 SENFX paper bots remain separate and unchanged. No strategy guarantees profits.</p>
  </main>;
}
