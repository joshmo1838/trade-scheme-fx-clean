
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import DerivAccounts from "./deriv-accounts";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const name =
    user.user_metadata?.full_name || user.email || "Trader";

  let derivStatus = "Not connected";
  let derivExpiry: string | null = null;
  let derivError = false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    try {
      const admin = createAdminClient(supabaseUrl, serviceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      const { data, error } = await admin
        .from("deriv_connections")
        .select("status, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error(
          "Dashboard Deriv status check failed:",
          error.message
        );
        derivError = true;
        derivStatus = "Unable to verify connection";
      } else if (data?.status === "connected") {
        derivExpiry = data.expires_at;

        if (
          derivExpiry &&
          new Date(derivExpiry).getTime() <= Date.now()
        ) {
          derivStatus = "Expired";
        } else {
          derivStatus = "Connected";
        }
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

  const expiryText = derivExpiry
    ? new Date(derivExpiry).toLocaleString()
    : null;

  return (
    <main className="appShell">
      <header className="dashNav">
        <Link className="brand" href="/">
          TRADE SCHEME <span>FX</span>
        </Link>

        <form action="/auth/signout" method="post">
          <button className="button secondary small">
            Sign out
          </button>
        </form>
      </header>

      <section className="dashContent">
        <p className="eyebrow">CUSTOMER DASHBOARD</p>

        <h1>Welcome, {name}</h1>

        <p className="muted">
          Your trading workspace is being set up.
        </p>

        <div className="actions">
          <Link className="button" href="/messages">
            Messages & support
          </Link>
          <Link className="button secondary" href="/bots">
            Browse trading bots
          </Link>
          <Link className="button secondary" href="/bot-settings">
            Bot settings
          </Link>
          <Link className="button secondary" href="/builder">
            Bot Builder
          </Link>
          <Link className="button secondary" href="/bulk-trader">
            Bulk Trader
          </Link>
          <Link className="button secondary" href="/manual-trader">
            Manual Trader
          </Link>
          <Link className="button secondary" href="/copy-trading">
            Copy Trading
          </Link>
          <Link className="button secondary" href="/digit-tools">
            Digit Tools
          </Link>
          <Link className="button secondary" href="/charts">
            Charts
          </Link>
          <Link className="button secondary" href="/ai-scanner">
            AI Scanner
          </Link>
          <Link className="button secondary" href="/history">
            Trading History
          </Link>
        </div>

        <div className="dashGrid">
          <article className="panel">
            <p className="eyebrow">DERIV CONNECTION</p>

            <h2>{derivStatus}</h2>

            {derivStatus === "Connected" ? (
              <>
                <p className="muted">
                  Your Deriv account is authorized.
                </p>

                {expiryText && (
                  <p className="muted">
                    Connection expiry: {expiryText}
                  </p>
                )}
              </>
            ) : derivStatus === "Expired" ? (
              <>
                <p className="muted">
                  Your Deriv authorization has expired.
                </p>
                <Link className="button" href="/api/deriv/connect">
                  Reconnect Deriv Account
                </Link>
              </>
            ) : (
              <>
                <p className="muted">
                  {derivError
                    ? "We could not verify your Deriv connection."
                    : "Connect your Deriv account to continue."}
                </p>

                {!derivError && (
                  <Link className="button" href="/api/deriv/connect">
                    Connect Deriv Account
                  </Link>
                )}
              </>
            )}
          </article>

          {derivStatus === "Connected" && (
            <DerivAccounts userId={user.id} />
          )}

          <article className="panel">
            <p className="eyebrow">BOT CONTROL</p>
            <h2>Bot controls are locked</h2>
            <p className="muted">
              Live bot execution is not active yet. We will enable
              controls only after the Deriv API connection, risk
              limits, and testing are complete.
            </p>
            <button className="button secondary" disabled>
              Bot controls coming soon
            </button>
          </article>

          <article className="panel">
            <p className="eyebrow">MEMBERSHIP</p>
            <h2>Free</h2>
            <p className="muted">
              There is no monthly platform membership charge.
            </p>
          </article>

          <article className="panel">
            <p className="eyebrow">ACCOUNT</p>
            <h2>Profile</h2>
            <p className="muted">{user.email}</p>
            <p className="muted">Account ID: {user.id}</p>
          </article>
        </div>

        <p className="disclaimer">
          Trading involves risk, including the possible loss of
          your capital. Trade Scheme FX does not guarantee profits
          or provide investment advice.
        </p>

        <Link className="back" href="/">
          ← Visit homepage
        </Link>
      </section>
    </main>
  );
}
