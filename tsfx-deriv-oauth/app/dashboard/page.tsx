
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const name =
    user.user_metadata?.full_name ||
    user.email ||
    "Trader";

  // Retrieve this customer's Deriv connection securely.
  let connection = null;
  let connectionCheckFailed = false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRole) {
    try {
      const admin = createSupabaseAdmin(
        supabaseUrl,
        serviceRole,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        }
      );

      const {
        data,
        error
      } = await admin
        .from("deriv_connections")
        .select("status, connected_at, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Dashboard Deriv status check failed:", {
          code: error.code,
          message: error.message
        });

        connectionCheckFailed = true;
      } else {
        connection = data;
      }
    } catch (error) {
      console.error("Dashboard Deriv lookup failed:", {
        errorType:
          error instanceof Error
            ? error.name
            : "UnknownError"
      });

      connectionCheckFailed = true;
    }
  } else {
    connectionCheckFailed = true;
  }

  const expiresAt = connection?.expires_at
    ? new Date(connection.expires_at)
    : null;

  const isExpired =
    expiresAt !== null &&
    !Number.isNaN(expiresAt.getTime()) &&
    expiresAt.getTime() <= Date.now();

  const isConnected =
    connection?.status === "connected" &&
    !isExpired;

  const expiryText =
    expiresAt && !Number.isNaN(expiresAt.getTime())
      ? new Intl.DateTimeFormat("en-US", {
          dateStyle: "long",
          timeStyle: "short",
          timeZone: "UTC"
        }).format(expiresAt) + " UTC"
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
            <p className="eyebrow">DERIV ACCOUNT</p>

            {connectionCheckFailed ? (
              <>
                <h2>Unable to verify connection</h2>

                <p className="muted">
                  We could not retrieve your Deriv connection status.
                  Please try again later.
                </p>
              </>
            ) : isConnected ? (
              <>
                <h2>Connected</h2>

                <p className="muted">
                  Your Deriv authorization record has been saved.
                </p>

                {expiryText && (
                  <p className="muted">
                    Authorization expiry: {expiryText}
                  </p>
                )}

                <p className="muted">
                  Account authorization is saved. Trading
                  functionality still requires separate testing.
                </p>

                <Link
                  className="button secondary"
                  href="/api/deriv/connect"
                >
                  Reconnect Deriv Account
                </Link>
              </>
            ) : isExpired ? (
              <>
                <h2>Connection expired</h2>

                <p className="muted">
                  Your Deriv authorization has expired.
                  Reconnect your account to continue.
                </p>

                <Link
                  className="button"
                  href="/api/deriv/connect"
                >
                  Reconnect Deriv Account
                </Link>
              </>
            ) : (
              <>
                <h2>Not connected</h2>

                <p className="muted">
                  Connect your own Deriv account securely.
                  Your Deriv password should never be entered here.
                </p>

                {process.env.DERIV_OAUTH_ENABLED === "true" ? (
                  <Link
                    className="button"
                    href="/api/deriv/connect"
                  >
                    Connect Deriv Account
                  </Link>
                ) : (
                  <button className="button" disabled>
                    Deriv connection awaiting approval
                  </button>
                )}
              </>
            )}
          </article>

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

            <p className="muted">
              Account ID: {user.id}
            </p>
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
