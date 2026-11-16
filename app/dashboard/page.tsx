import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import TradingWorkspace from "./trading-workspace";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = user.user_metadata?.full_name || user.email || "Trader";
  let derivStatus = "Not connected";
  let derivExpiry: string | null = null;
  let derivError = false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    try {
      const admin = createAdminClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await admin
        .from("deriv_connections")
        .select("status, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Dashboard Deriv status check failed:", error.message);
        derivError = true;
        derivStatus = "Unable to verify connection";
      } else if (data?.status === "connected") {
        derivExpiry = data.expires_at;
        derivStatus = derivExpiry && new Date(derivExpiry).getTime() <= Date.now()
          ? "Expired"
          : "Connected";
      }
    } catch (error) {
      console.error("Dashboard Deriv status check failed:", error);
      derivError = true;
      derivStatus = "Unable to verify connection";
    }
  } else {
    derivError = true;
    derivStatus = "Unable to verify connection";
  }

  return (
    <TradingWorkspace
      name={name}
      email={user.email || ""}
      userId={user.id}
      derivStatus={derivStatus}
      derivExpiry={derivExpiry ? new Date(derivExpiry).toLocaleString() : null}
      derivError={derivError}
    />
  );
}
