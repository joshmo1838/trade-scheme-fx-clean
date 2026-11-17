import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PaperBotControlConsole from "@/app/components/PaperBotControlConsole";

export const dynamic = "force-dynamic";

export default async function BotControlsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bot-controls");
  return <PaperBotControlConsole />;
}
