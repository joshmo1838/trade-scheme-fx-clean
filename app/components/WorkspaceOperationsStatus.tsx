"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  summarizePaperOperations,
  type PaperApiSnapshot,
  type PaperOperationsSummary,
} from "@/lib/workspace/paper-operations";

/** Account-scoped, GET-only snapshot. Never mutates a bot or places an order. */
export default function WorkspaceOperationsStatus({
  derivStatus,
}: {
  derivStatus: string;
}) {
  const [snapshot, setSnapshot] = useState<PaperApiSnapshot | null>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [clock, setClock] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestNumber = useRef(0);
  const requestController = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const current = ++requestNumber.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const response = await fetch("/api/bot-control", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const data: PaperApiSnapshot & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data?.error || "Paper controls unavailable.");
      const checkedAt = Date.now();
      summarizePaperOperations(data, checkedAt); // Reject a malformed response.
      if (current !== requestNumber.current) return;
      setSnapshot(data);
      setLastChecked(checkedAt);
      setClock(checkedAt);
      setError("");
    } catch (cause) {
      if (current !== requestNumber.current) return;
      if (controller.signal.aborted) return;
      // Fail closed: never leave an old active-worker claim on the dashboard.
      setSnapshot(null);
      setLastChecked(null);
      setError(cause instanceof Error ? cause.message : "Paper status cannot be verified.");
    } finally {
      if (current === requestNumber.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const polling = window.setInterval(() => {
      setClock(Date.now());
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        ++requestNumber.current;
        requestController.current?.abort();
        setSnapshot(null);
        setLastChecked(null);
      } else {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearInterval(polling);
      document.removeEventListener("visibilitychange", visibility);
      ++requestNumber.current;
      requestController.current?.abort();
    };
  }, [refresh]);

  let summary: PaperOperationsSummary | null = null;
  if (snapshot && lastChecked !== null) {
    try {
      summary = summarizePaperOperations(snapshot, clock || Date.now());
    } catch {
      summary = null;
    }
  }
  const active = summary?.state === "verified-paper-worker";
  const connected = derivStatus === "Connected";
  const derivLabel = connected ? "Connected" :
    derivStatus === "Expired" ? "Connection expired" :
    derivStatus === "Unable to verify connection" ? "Unable to verify" : "Not connected";

  return (
    <aside className="senfxOpsStatus" aria-label="Account and paper control verification">
      <div className="senfxOpsStatusHead">
        <div>
          <p className="senfxOpsEyebrow">ACCOUNT & PAPER CONTROL</p>
          <h3>Operations status</h3>
        </div>
        <button
          className="senfxOpsRefresh"
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh paper bot status"
        >↻ Refresh</button>
      </div>

      <section className="senfxOpsAccount">
        <span className="senfxOpsField">DERIV ACCOUNT LINK</span>
        <strong>{derivLabel}</strong>
        <small>Connection status does not mean broker orders are enabled.</small>
        <Link href={connected ? "/dashboard" : "/api/deriv/connect"}>
          {connected ? "Review Deriv accounts in the header" : "Connect or reconnect Deriv"} ↗
        </Link>
      </section>

      <section className="senfxOpsWorker">
        <span className="senfxOpsField">HOSTED PAPER WORKER</span>
        <strong className={active ? "senfxOpsPositive" : "senfxOpsNeutral"}>
          {loading && !summary ? "Checking status…" :
           error || !summary ? "Verification unavailable" :
           summary.state === "disabled" ? "Not enabled" :
           active ? "Verified paper simulation" : "Not verified running"}
        </strong>
        <p role="status">{error || summary?.note ||
          "Checking the authenticated control service."}</p>
      </section>

      <div className="senfxOpsMetrics">
        <div>
          <span>Verified paper workers</span>
          <strong>{summary?.verifiedPaperWorkers ?? "—"}</strong>
        </div>
        <div>
          <span>Shown open positions</span>
          <strong>{summary?.visibleOpenPositions ?? "—"}</strong>
        </div>
        <div>
          <span>Shown queued requests</span>
          <strong>{summary?.visiblePendingCommands ?? "—"}</strong>
        </div>
      </div>
      <p className="senfxOpsCaveat">
        Counts are from a capped account-specific snapshot, not a complete trading history.
        No Deriv Demo or Real contracts are purchased here.
        {lastChecked !== null ? " Last verified at " + new Date(lastChecked).toLocaleTimeString() + "." : ""}
      </p>
      <div className="senfxOpsActions">
        <Link href="/bot-controls">Paper bot controls ↗</Link>
        <Link href="/history">Paper history ↗</Link>
        <Link href="/risk-center">Risk planning ↗</Link>
      </div>
      <p className="senfxOpsFooter">Real-money bot execution: disabled · Read-only monitoring</p>
    </aside>
  );
}
