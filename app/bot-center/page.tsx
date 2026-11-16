import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CustomerBotCenter from "@/app/components/CustomerBotCenter";

export default async function BotCenterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <CustomerBotCenter />;
}
