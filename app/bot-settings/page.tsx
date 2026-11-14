
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TradingMode = "demo" | "real";

type Settings = {
  trading_mode: TradingMode;
  stake_amount: number;
  daily_loss_limit: number | null;
};

type DerivAccount = {
  account_id: string;
  balance: string | number;
  currency: string;
  status: string;
  account_type: string;
};

const defaultSettings = (mode: TradingMode): Settings => ({
  trading_mode: mode,
  stake_amount: 10,
  daily_loss_limit: 20,
});

export default function BotSettingsPage() {
  const [settings, setSettings] = useState<Settings>(
    defaultSettings("demo")
  );
  const [activeAccount, setActiveAccount] =
    useState<DerivAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadSettings = useCallback(async () => {
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

      // Retrieve the customer's connected Deriv accounts
      // and saved account selection.
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
        throw new Error(
          "Unable to retrieve your active Deriv account. Please reconnect or select an account from your dashboard."
        );
      }

      const accountList: DerivAccount[] =
        accountsResult.accounts || [];

      const selectedAccount = accountList.find(
        (account) =>
          account.account_id ===
          selectionResult.active_account_id
      );

      if (!selectedAccount) {
        setActiveAccount(null);
        setMessage(
          "Please select an active Deriv account on your dashboard before configuring bot settings."
        );
        return;
      }

      if (
        selectedAccount.account_type !== "demo" &&
        selectedAccount.account_type !== "real"
      ) {
        throw new Error(
          "Unable to determine your Deriv account type."
        );
      }

      const mode = selectedAccount.account_type as TradingMode;

      setActiveAccount(selectedAccount);

      // Load settings only for the selected account type.
      const { data, error } = await supabase
        .from("customer_bot_settings")
        .select(
          "trading_mode,stake_amount,daily_loss_limit"
        )
        .eq("customer_id", user.id)
        .eq("trading_mode", mode)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (data) {
        setSettings({
          trading_mode: mode,
          stake_amount: Number(data.stake_amount),
          daily_loss_limit:
            data.daily_loss_limit === null
              ? null
              : Number(data.daily_loss_limit),
        });
      } else {
        setSettings(defaultSettings(mode));
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load bot settings."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const min = 10;

  const max =
    settings.trading_mode === "demo"
      ? 100
      : Number.POSITIVE_INFINITY;

  const validStake =
    Number.isFinite(settings.stake_amount) &&
    settings.stake_amount >= min &&
    settings.stake_amount <= max;

  async function save() {
    setMessage("");

    if (!activeAccount) {
      setMessage(
        "Select a Deriv account before saving settings."
      );
      return;
    }

    if (!validStake) {
      setMessage(
        settings.trading_mode === "demo"
          ? "Demo stake must be between $10 and $100."
          : "Real-account stake must be at least $10."
      );
      return;
    }

    if (
      settings.daily_loss_limit !== null &&
      (!Number.isFinite(settings.daily_loss_limit) ||
        settings.daily_loss_limit <= 0)
    ) {
      setMessage(
        "Daily loss limit must be greater than $0 or left blank."
      );
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      // Confirm the active account has not changed.
      const selectionResponse = await fetch(
        "/api/deriv/select-account",
        {
          cache: "no-store",
          credentials: "same-origin",
        }
      );

      const selectionResult =
        await selectionResponse.json();

      if (
        !selectionResponse.ok ||
        !selectionResult.success ||
        selectionResult.active_account_id !==
          activeAccount.account_id
      ) {
        throw new Error(
          "Your active Deriv account changed. Refresh settings before saving."
        );
      }

      // Save one independent row per customer and account type.
      const { error } = await supabase
        .from("customer_bot_settings")
        .upsert(
          {
            customer_id: user.id,
            trading_mode: settings.trading_mode,
            stake_amount: settings.stake_amount,
            daily_loss_limit: settings.daily_loss_limit,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "customer_id,trading_mode",
          }
        );

      if (error) {
        throw new Error(error.message);
      }

      setMessage(
        `${settings.trading_mode.toUpperCase()} account preferences saved successfully.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save your settings."
      );
    } finally {
      setSaving(false);
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
        <p className="eyebrow">CUSTOMER PREFERENCES</p>
        <h1>Bot settings</h1>

        <div className="notice">
          <strong>Settings only:</strong> These preferences
          are saved separately for Demo and Real accounts.
          They do not place trades. Live Deriv execution
          remains disabled.
        </div>

        {loading ? (
          <div className="panel">
            <p className="muted">
              Loading your account settings...
            </p>
          </div>
        ) : (
          <div
            className="panel"
            style={{ maxWidth: 680 }}
          >
            {activeAccount ? (
              <>
                <p className="eyebrow">
                  ACTIVE DERIV ACCOUNT
                </p>

                <h2>
                  {settings.trading_mode.toUpperCase()} ACCOUNT
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
                  Your settings below apply to this account type.
                </p>

                <label
                  className="fieldLabel"
                  htmlFor="stake"
                >
                  Stake per trade (USD)
                </label>

                <input
                  id="stake"
                  className="fieldInput"
                  type="number"
                  min="10"
                  max={
                    settings.trading_mode === "demo"
                      ? 100
                      : undefined
                  }
                  step="0.01"
                  value={settings.stake_amount}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      stake_amount: Number(e.target.value),
                    }))
                  }
                />

                <p className="muted">
                  {settings.trading_mode === "demo"
                    ? "Demo stake range: $10–$100."
                    : "Real stake minimum: $10. Deriv contract rules and available balance still apply."}
                </p>

                <label
                  className="fieldLabel"
                  htmlFor="loss-limit"
                >
                  Daily loss limit (USD, optional)
                </label>

                <input
                  id="loss-limit"
                  className="fieldInput"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Leave blank for no preference"
                  value={settings.daily_loss_limit ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      daily_loss_limit:
                        e.target.value === ""
                          ? null
                          : Number(e.target.value),
                    }))
                  }
                />

                <p className="muted">
                  This is a saved preference only. It is
                  not an enforced trading stop condition.
                </p>

                <button
                  className="button"
                  disabled={saving || !validStake}
                  onClick={save}
                >
                  {saving
                    ? "Saving..."
                    : "Save settings"}
                </button>

                <button
                  className="button secondary"
                  style={{ marginLeft: 10 }}
                  disabled={saving}
                  onClick={() => void loadSettings()}
                >
                  Refresh account settings
                </button>
              </>
            ) : (
              <>
                <p className="muted">
                  {message ||
                    "No active Deriv account selected."}
                </p>

                <Link
                  className="button"
                  href="/dashboard"
                >
                  Select Deriv account
                </Link>
              </>
            )}

            {message && activeAccount && (
              <p className="notice" role="status">
                {message}
              </p>
            )}
          </div>
        )}

        <p className="disclaimer">
          Trading involves risk, including the possible
          loss of capital. Never stake money you cannot
          afford to lose.
        </p>
      </section>
    </main>
  );
}
