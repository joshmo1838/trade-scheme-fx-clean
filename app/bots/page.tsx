
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Bot = {
  id: string;
  name: string;
  market: string;
  description: string;
  risk_level: string;
};

type Selection = {
  id: string;
  bot_id: string;
  control_status: "stopped" | "paused" | "selected";
};

type DerivAccount = {
  account_id: string;
  balance: string | number;
  currency: string;
  status: string;
  account_type: string;
};

export default function CustomerBotsPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [activeAccount, setActiveAccount] =
    useState<DerivAccount | null>(null);
  const [accountMessage, setAccountMessage] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const [
        { data: b, error: be },
        { data: s, error: se },
      ] = await Promise.all([
        supabase
          .from("bots")
          .select("id,name,market,description,risk_level")
          .eq("is_published", true),

        supabase
          .from("customer_bots")
          .select("id,bot_id,control_status")
          .eq("customer_id", user.id),
      ]);

      if (be || se) {
        setMessage(
          be?.message || se?.message || "Unable to load bots."
        );
        return;
      }

      setBots((b || []) as Bot[]);
      setSelections((s || []) as Selection[]);

      // Retrieve the saved account selection from Supabase.
      try {
        const [accountsResponse, selectionResponse] =
          await Promise.all([
            fetch("/api/deriv/account", {
              cache: "no-store",
              credentials: "same-origin",
            }),
            fetch("/api/deriv/select-account", {
              cache: "no-store",
              credentials: "same-origin",
            }),
          ]);

        const accountsResult = await accountsResponse.json();
        const selectionResult = await selectionResponse.json();

        if (
          accountsResponse.ok &&
          accountsResult.success &&
          selectionResponse.ok &&
          selectionResult.success
        ) {
          const accountList: DerivAccount[] =
            accountsResult.accounts || [];

          const savedAccount = accountList.find(
            (account) =>
              account.account_id ===
              selectionResult.active_account_id
          );

          setActiveAccount(savedAccount || null);

          setAccountMessage(
            savedAccount
              ? ""
              : "No active Deriv account selected. Choose an account on your dashboard."
          );
        } else {
          setActiveAccount(null);
          setAccountMessage(
            "Connect Deriv and select an account on your dashboard."
          );
        }
      } catch {
        setActiveAccount(null);
        setAccountMessage(
          "Unable to retrieve your active Deriv account."
        );
      }
    } catch {
      setMessage("Unable to load your workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function choose(bot: Bot) {
    setBusy(bot.id);
    setMessage("");

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const existing = selections.find(
        (s) => s.bot_id === bot.id
      );

      let error;

      if (!existing) {
        ({ error } = await supabase
          .from("customer_bots")
          .insert({
            customer_id: user.id,
            bot_id: bot.id,
            selected: true,
            control_status: "selected",
          }));
      } else {
        const next =
          existing.control_status === "selected"
            ? "paused"
            : existing.control_status === "paused"
              ? "stopped"
              : "selected";

        ({ error } = await supabase
          .from("customer_bots")
          .update({
            selected: next === "selected",
            control_status: next,
          })
          .eq("id", existing.id));
      }

      if (error) {
        setMessage(error.message);
      } else {
        await load();
      }
    } catch {
      setMessage("Unable to update your bot selection.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="appShell">
      <header className="dashNav">
        <Link className="brand" href="/">
          TRADE SCHEME <span>FX</span>
        </Link>

        <Link
          className="button secondary small"
          href="/dashboard"
        >
          Customer dashboard
        </Link>
      </header>

      <section className="dashContent">
        <p className="eyebrow">YOUR BOT WORKSPACE</p>
        <h1>Trading bots</h1>

        <p>
          <Link
            className="button secondary small"
            href="/bot-settings"
          >
            Bot settings
          </Link>
        </p>

        <article className="panel">
          <p className="eyebrow">ACTIVE DERIV ACCOUNT</p>

          {activeAccount ? (
            <>
              <h2>
                {activeAccount.account_type.toUpperCase()} ACCOUNT
              </h2>

              <p className="muted">
                Account ID: {activeAccount.account_id}
              </p>

              <p className="muted">
                Balance:{" "}
                {Number(activeAccount.balance).toFixed(2)}{" "}
                {activeAccount.currency}
              </p>

              <p className="muted">
                Status: {activeAccount.status}
              </p>
            </>
          ) : (
            <p className="muted">
              {accountMessage ||
                "No active Deriv account selected."}
            </p>
          )}

          <Link
            className="button secondary small"
            href="/dashboard"
          >
            Manage Deriv accounts
          </Link>
        </article>

        <div className="notice">
          <strong>Demo controls only:</strong> Selecting,
          pausing, or stopping a bot here does not start or
          stop live trades. The active Deriv account is
          displayed for reference only. Live trading execution
          remains disabled.
        </div>

        {message && (
          <p className="notice">{message}</p>
        )}

        {loading ? (
          <div className="panel">
            <p className="muted">Loading your workspace...</p>
          </div>
        ) : bots.length === 0 ? (
          <div className="panel">
            <p className="muted">
              No bots are published yet. Check back when
              the platform administrator publishes a bot.
            </p>
          </div>
        ) : (
          <div className="botList">
            {bots.map((bot) => {
              const selected = selections.find(
                (s) => s.bot_id === bot.id
              );

              const status =
                selected?.control_status || "not selected";

              return (
                <article
                  className="panel botRow"
                  key={bot.id}
                >
                  <div>
                    <strong>{bot.name}</strong>

                    <p className="muted">
                      {bot.market} · {bot.risk_level} risk
                    </p>

                    <p className="muted">
                      {bot.description}
                    </p>

                    <span className="statusText">
                      Your setting: {status}
                    </span>
                  </div>

                  <button
                    className="button small"
                    disabled={busy === bot.id || loading}
                    onClick={() => choose(bot)}
                  >
                    {busy === bot.id
                      ? "Saving..."
                      : !selected
                        ? "Select bot"
                        : status === "selected"
                          ? "Pause bot"
                          : status === "paused"
                            ? "Stop bot"
                            : "Select again"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
