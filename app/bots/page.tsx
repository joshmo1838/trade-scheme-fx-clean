
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

type BotConfig = {
  stake_amount: number;
  daily_loss_limit: number | null;
};

type SavedConfig = BotConfig & {
  bot_id: string;
};

export default function CustomerBotsPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [configs, setConfigs] = useState<Record<string, BotConfig>>({});
  const [activeAccount, setActiveAccount] =
    useState<DerivAccount | null>(null);
  const [accountMessage, setAccountMessage] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState<string | null>(null);
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
        setConfigs({});
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
          account.account_id === selectionResult.active_account_id
      );

      if (
        !savedAccount ||
        (savedAccount.account_type !== "demo" &&
          savedAccount.account_type !== "real")
      ) {
        setActiveAccount(null);
        setSelections([]);
        setConfigs({});
        setAccountMessage(
          "No valid active Deriv account found. Please select an account on your dashboard."
        );
        setBots([]);
        return;
      }

      const mode = savedAccount.account_type as TradingMode;

      setActiveAccount(savedAccount);
      setAccountMessage("");

      const [
        { data: botData, error: botError },
        { data: selectionData, error: selectionError },
        { data: configData, error: configError },
        { data: accountSettings, error: settingsError },
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

        supabase
          .from("customer_bot_configurations")
          .select("bot_id,stake_amount,daily_loss_limit")
          .eq("customer_id", user.id)
          .eq("trading_mode", mode),

        supabase
          .from("customer_bot_settings")
          .select("stake_amount,daily_loss_limit")
          .eq("customer_id", user.id)
          .eq("trading_mode", mode)
          .maybeSingle(),
      ]);

      if (botError || selectionError || configError || settingsError) {
        throw new Error(
          botError?.message ||
            selectionError?.message ||
            configError?.message ||
            settingsError?.message ||
            "Unable to load bot configurations."
        );
      }

      const botList = (botData || []) as Bot[];
      const selectionList = (selectionData || []) as Selection[];
      const savedConfigs = (configData || []) as SavedConfig[];

      const defaultStake = accountSettings
        ? Number(accountSettings.stake_amount)
        : 10;

      const defaultLossLimit = accountSettings
        ? accountSettings.daily_loss_limit === null
          ? null
          : Number(accountSettings.daily_loss_limit)
        : 20;

      const nextConfigs: Record<string, BotConfig> = {};

      botList.forEach((bot) => {
        const saved = savedConfigs.find(
          (config) => config.bot_id === bot.id
        );

        nextConfigs[bot.id] = saved
          ? {
              stake_amount: Number(saved.stake_amount),
              daily_loss_limit:
                saved.daily_loss_limit === null
                  ? null
                  : Number(saved.daily_loss_limit),
            }
          : {
              stake_amount: defaultStake,
              daily_loss_limit: defaultLossLimit,
            };
      });

      setBots(botList);
      setSelections(selectionList);
      setConfigs(nextConfigs);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load your workspace."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function verifyActiveAccount() {
    if (!activeAccount) {
      throw new Error("No active Deriv account selected.");
    }

    const response = await fetch("/api/deriv/select-account", {
      cache: "no-store",
      credentials: "same-origin",
    });

    const result = await response.json();

    if (
      !response.ok ||
      !result.success ||
      result.active_account_id !== activeAccount.account_id
    ) {
      throw new Error(
        "Your active Deriv account changed. Refresh the workspace."
      );
    }

    return activeAccount.account_type as TradingMode;
  }

  async function choose(bot: Bot) {
    if (!activeAccount || busy || savingConfig) return;

    setBusy(bot.id);
    setMessage("");

    try {
      const mode = await verifyActiveAccount();
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
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

      if (error) throw new Error(error.message);

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

  function updateConfig(
    botId: string,
    field: keyof BotConfig,
    value: number | null
  ) {
    setConfigs((current) => ({
      ...current,
      [botId]: {
        ...current[botId],
        [field]: value,
      },
    }));
  }

  async function saveConfig(bot: Bot) {
    if (!activeAccount || busy || savingConfig) return;

    const config = configs[bot.id];

    if (!config) return;

    const mode = activeAccount.account_type as TradingMode;

    if (
      !Number.isFinite(config.stake_amount) ||
      config.stake_amount < 10 ||
      (mode === "demo" && config.stake_amount > 100)
    ) {
      setMessage(
        mode === "demo"
          ? "Demo stake must be between $10 and $100."
          : "Real stake must be at least $10."
      );
      return;
    }

    if (
      config.daily_loss_limit !== null &&
      (!Number.isFinite(config.daily_loss_limit) ||
        config.daily_loss_limit <= 0)
    ) {
      setMessage(
        "Daily loss limit must be greater than $0 or left blank."
      );
      return;
    }

    setSavingConfig(bot.id);
    setMessage("");

    try {
      const verifiedMode = await verifyActiveAccount();

      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { error } = await supabase
        .from("customer_bot_configurations")
        .upsert(
          {
            customer_id: user.id,
            bot_id: bot.id,
            trading_mode: verifiedMode,
            stake_amount: config.stake_amount,
            daily_loss_limit: config.daily_loss_limit,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "customer_id,bot_id,trading_mode",
          }
        );

      if (error) throw new Error(error.message);

      setMessage(
        `${bot.name} ${verifiedMode.toUpperCase()} configuration saved successfully.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save bot configuration."
      );
    } finally {
      setSavingConfig(null);
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
            General bot settings
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
          <strong>Configuration only:</strong> Each bot has
          independent Demo and Real settings. Saving settings
          does not execute trades. Live trading remains disabled.
        </div>

        {message && (
          <p className="notice" role="alert">
            {message}
          </p>
        )}

        {loading ? (
          <div className="panel">
            <p className="muted">Loading your workspace...</p>
          </div>
        ) : !activeAccount ? (
          <div className="panel">
            <p className="muted">
              Select a valid Deriv account to view bot configurations.
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

              const config = configs[bot.id] || {
                stake_amount: 10,
                daily_loss_limit: null,
              };

              return (
                <article
                  className="panel botRow"
                  key={bot.id}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
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

                    <div style={{ marginTop: "18px" }}>
                      <p className="eyebrow">
                        {activeAccount.account_type.toUpperCase()}{" "}
                        BOT CONFIGURATION
                      </p>

                      <label
                        className="fieldLabel"
                        htmlFor={`stake-${bot.id}`}
                      >
                        Stake per trade (USD)
                      </label>

                      <input
                        id={`stake-${bot.id}`}
                        className="fieldInput"
                        type="number"
                        min="10"
                        max={
                          activeAccount.account_type === "demo"
                            ? 100
                            : undefined
                        }
                        step="0.01"
                        value={config.stake_amount}
                        onChange={(event) =>
                          updateConfig(
                            bot.id,
                            "stake_amount",
                            event.target.value === ""
                              ? 0
                              : Number(event.target.value)
                          )
                        }
                      />

                      <p className="muted">
                        {activeAccount.account_type === "demo"
                          ? "Demo stake range: $10–$100."
                          : "Real stake minimum: $10. Deriv contract rules and available balance still apply."}
                      </p>

                      <label
                        className="fieldLabel"
                        htmlFor={`loss-${bot.id}`}
                      >
                        Daily loss limit (USD, optional)
                      </label>

                      <input
                        id={`loss-${bot.id}`}
                        className="fieldInput"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Leave blank for no limit preference"
                        value={config.daily_loss_limit ?? ""}
                        onChange={(event) =>
                          updateConfig(
                            bot.id,
                            "daily_loss_limit",
                            event.target.value === ""
                              ? null
                              : Number(event.target.value)
                          )
                        }
                      />

                      <button
                        className="button secondary small"
                        disabled={
                          savingConfig !== null ||
                          busy !== null
                        }
                        onClick={() => void saveConfig(bot)}
                        style={{ marginTop: "12px" }}
                      >
                        {savingConfig === bot.id
                          ? "Saving configuration..."
                          : "Save bot configuration"}
                      </button>
                    </div>
                  </div>

                  <button
                    className="button small"
                    disabled={
                      busy !== null ||
                      savingConfig !== null ||
                      loading
                    }
                    onClick={() => void choose(bot)}
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
          disabled={loading || busy !== null || savingConfig !== null}
        >
          Refresh workspace
        </button>
      </section>
    </main>
  );
}
