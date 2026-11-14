
"use client";

import { useCallback, useEffect, useState } from "react";

type DerivAccount = {
  account_id: string;
  balance: string | number;
  currency: string;
  status: string;
  account_type: string;
};

export default function DerivAccounts({
  userId,
}: {
  userId: string;
}) {
  const [accounts, setAccounts] = useState<DerivAccount[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const storageKey = `deriv-active-account-${userId}`;

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/deriv/account", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Unable to retrieve Deriv accounts."
        );
      }

      const accountList: DerivAccount[] = result.accounts || [];
      setAccounts(accountList);

      const savedAccount = window.localStorage.getItem(storageKey);

      const validSavedAccount = accountList.some(
        (account) => account.account_id === savedAccount
      );

      const nextSelected = validSavedAccount
        ? savedAccount!
        : accountList.find(
            (account) => account.account_type === "demo"
          )?.account_id || accountList[0]?.account_id || "";

      setSelected(nextSelected);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load Deriv accounts."
      );
    } finally {
      setLoading(false);
    }
  }, [storageKey]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  async function chooseAccount(accountId: string) {
    if (saving || accountId === selected) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/deriv/select-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          account_id: accountId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Could not save your account selection."
        );
      }

      setSelected(result.active_account_id);

      window.localStorage.setItem(
        storageKey,
        result.active_account_id
      );

      setMessage("Your account selection was saved securely.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save account selection."
      );
    } finally {
      setSaving(false);
    }
  }

  const activeAccount = accounts.find(
    (account) => account.account_id === selected
  );

  return (
    <article className="panel">
      <p className="eyebrow">DERIV ACCOUNTS</p>
      <h2>Your connected accounts</h2>

      <p className="muted">
        Choose which Deriv account you want to use.
      </p>

      {loading && (
        <p className="muted">Loading your Deriv accounts...</p>
      )}

      {error && (
        <p role="alert" style={{ color: "#ef4444" }}>
          {error}
        </p>
      )}

      {message && (
        <p role="status" style={{ color: "#22c55e" }}>
          {message}
        </p>
      )}

      {!loading && !error && accounts.length === 0 && (
        <p className="muted">
          No Deriv accounts were returned.
        </p>
      )}

      {!loading && !error && accounts.length > 0 && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "14px",
              marginTop: "18px",
            }}
          >
            {accounts.map((account) => {
              const isDemo = account.account_type === "demo";
              const isSelected = selected === account.account_id;

              return (
                <div
                  key={account.account_id}
                  style={{
                    border: isSelected
                      ? "2px solid #22c55e"
                      : "1px solid #29415e",
                    borderRadius: "12px",
                    padding: "16px",
                    background: isSelected
                      ? "rgba(34,197,94,0.08)"
                      : "rgba(255,255,255,0.02)",
                  }}
                >
                  <p className="eyebrow">
                    {isDemo ? "DEMO ACCOUNT" : "REAL ACCOUNT"}
                  </p>

                  <h2 style={{ fontSize: "25px" }}>
                    {Number(account.balance).toFixed(2)}{" "}
                    {account.currency}
                  </h2>

                  <p className="muted">
                    Status: {account.status}
                  </p>

                  <p className="muted">
                    ID: {account.account_id}
                  </p>

                  <button
                    className={
                      isSelected ? "button" : "button secondary"
                    }
                    onClick={() => chooseAccount(account.account_id)}
                    disabled={
                      saving ||
                      account.status !== "active" ||
                      isSelected
                    }
                  >
                    {saving
                      ? "Saving..."
                      : isSelected
                      ? "Selected"
                      : "Select account"}
                  </button>
                </div>
              );
            })}
          </div>

          {activeAccount && (
            <p className="muted" style={{ marginTop: "16px" }}>
              Active selection:{" "}
              {activeAccount.account_type.toUpperCase()} (
              {activeAccount.account_id})
            </p>
          )}

          <button
            className="button secondary"
            onClick={loadAccounts}
            disabled={loading || saving}
            style={{ marginTop: "12px" }}
          >
            Refresh balances
          </button>
        </>
      )}

      <p className="muted" style={{ marginTop: "18px" }}>
        Account selections are verified by the server and saved
        in Supabase. Selecting an account does not execute trades
        or move money.
      </p>
    </article>
  );
}
