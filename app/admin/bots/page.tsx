import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminBotsManager from "./AdminBotsManager";

export default async function AdminBotsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  return <AdminBotsManager />;
}
