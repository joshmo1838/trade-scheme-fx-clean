import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DemoTradingConsole from "@/app/components/DemoTradingConsole";

export const dynamic = "force-dynamic";

export default async function DemoTradingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/demo-trading");

  return <DemoTradingConsole />;
}
