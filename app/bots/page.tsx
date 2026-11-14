
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TradingMode = "demo" | "real";

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
  trading_mode: TradingMode;
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

      // Retrieve the customer's active Deriv account.
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
        !accountsResponse.ok ||
        !accountsResult.success ||
        !selectionResponse.ok ||
        !selectionResult.success
      ) {
        setActiveAccount(null);
        setSelections([]);
        setAccountMessage(
          "Connect Deriv and select an account on your dashboard."
        );
        setBots([]);
        return;
      }

      const accountList: DerivAccount[] =
        accountsResult.accounts || [];

      const savedAccount = accountList.find(
        (account) =>
          account.account_id ===
          selectionResult.active_account_id
      );

      if (
        !savedAccount ||
        (savedAccount.account_type !== "demo" &&
          savedAccount.account_type !== "real")
      ) {
        setActiveAccount(null);
        setSelections([]);
        setAccountMessage(
          "No valid active Deriv account found. Please select an account on your dashboard."
        );
        setBots([]);
        return;
      }

      const mode = savedAccount.account_type as TradingMode;

      setActiveAccount(savedAccount);
      setAccountMessage("");

      // Load published bots and selections for this account type.
      const [
        { data: botData, error: botError },
        { data: selectionData, error: selectionError },
      ] = await Promise.all([
        supabase
          .from("bots")
          .select("id,name,market,description,risk_level")
          .eq("is_published", true),

        supabase
          .from("customer_bots")
          .select("id,bot_id,control_status,trading_mode")
          .eq("customer_id", user.id)
          .eq("trading_mode", mode),
      ]);

      if (botError || selectionError) {
        setMessage(
          botError?.message ||
            selectionError?.message ||
            "Unable to load bots."
        );
        return;
      }

      setBots((botData || []) as Bot[]);
      setSelections((selectionData || []) as Selection[]);
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
    if (!activeAccount || busy) return;

    const mode = activeAccount.account_type as TradingMode;

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

      // Confirm that the selected account has not changed.
      const response = await fetch(
        "/api/deriv/select-account",
        {
          cache: "no-store",
          credentials: "same-origin",
        }
      );

      const result = await response.json();

      if (
        !response.ok ||
        !result.success ||
        result.active_account_id !== activeAccount.account_id
      ) {
        throw new Error(
          "Your active Deriv account changed. Refresh the workspace before updating bots."
        );
      }

      const existing = selections.find(
        (selection) =>
          selection.bot_id === bot.id &&
          selection.trading_mode === mode
      );

      let error;

      if (!existing) {
        ({ error } = await supabase
          .from("customer_bots")
          .insert({
            customer_id: user.id,
            bot_id: bot.id,
            trading_mode: mode,
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
          .eq("id", existing.id)
          .eq("customer_id", user.id)
          .eq("trading_mode", mode));
      }

      if (error) {
        throw new Error(error.message);
      }

      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update your bot selection."
      );
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
          <strong>Configuration only:</strong> Bot selections
          are saved independently for Demo and Real accounts.
          Selecting, pausing, or stopping a bot does not
          execute trades. Live trading remains disabled.
        </div>

        {message && (
          <p className="notice" role="alert">
            {message}
          </p>
        )}

        {loading ? (
          <div className="panel">
            <p className="muted">
              Loading your workspace...
            </p>
          </div>
        ) : !activeAccount ? (
          <div className="panel">
            <p className="muted">
              Select a valid Deriv account to view its bot
              configurations.
            </p>
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
                (selection) =>
                  selection.bot_id === bot.id &&
                  selection.trading_mode ===
                    activeAccount.account_type
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
                      {activeAccount.account_type.toUpperCase()}{" "}
                      setting: {status}
                    </span>
                  </div>

                  <button
                    className="button small"
                    disabled={busy !== null || loading}
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

        <button
          className="button secondary"
          style={{ marginTop: "16px" }}
          onClick={() => void load()}
          disabled={loading || busy !== null}
        >
          Refresh workspace
        </button>
      </section>
    </main>
  );
}
