"use client";

import { useEffect, useRef, useState } from "react";
import type { ObservedTick } from "@/lib/bots/digit-matrix";

type Props = {
  botId: string;
  observations: readonly ObservedTick[];
  fresh: boolean;
  minTicks: number;
};

/** Manual, read-only AI explanations. Never called from a bot execution path. */
export default function SenfxOpenAIExplanation({ botId, observations, fresh, minTicks }: Props) {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const requestVersion = useRef(0);

  useEffect(() => {
    requestVersion.current++;
    setExplanation("");
    setError("");
    setLoading(false);
    setReady(false);
    setChecking(true);
    const controller = new AbortController();
    fetch("/api/ai-research", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) return { ready: false };
        return await response.json() as { ready?: boolean };
      })
      .then(value => { if (!controller.signal.aborted) setReady(value.ready === true); })
      .catch(() => { if (!controller.signal.aborted) setReady(false); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => { controller.abort(); requestVersion.current++; };
  }, [botId]);

  async function explain() {
    if (loading || !ready || !fresh || observations.length < minTicks) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    setExplanation("");
    try {
      const response = await fetch("/api/ai-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          botId,
          observations: observations.slice(-80).map(tick => ({
            epoch: tick.epoch, price: tick.price, digit: tick.digit,
          })),
        }),
      });
      const body = await response.json() as { botId?: string; explanation?: string; error?: string };
      if (requestVersion.current !== version) return;
      if (!response.ok || body.botId !== botId || !body.explanation) {
        setError(body.error || "AI research explanation unavailable.");
      } else {
        setExplanation(body.explanation);
      }
    } catch {
      if (requestVersion.current === version) setError("Network unavailable. No trades were affected.");
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }

  const enough = fresh && observations.length >= minTicks;
  return <div>
    <p>Optional OpenAI explanation of the selected bot's recent public-tick sample. This is descriptive research, not entry approval or a prediction.</p>
    <button type="button" disabled={!ready || !enough || loading || checking} onClick={explain}>
      {loading ? "Analyzing observations…" : "Explain recent ticks with OpenAI"}
    </button>
    <p role="status" aria-live="polite">
      {checking ? "Checking optional AI setup…" : !ready ? "OpenAI research not enabled on this deployment." :
        !enough ? "Waiting for enough fresh public ticks." : "Ready for manual AI explanation."}
    </p>
    {error && <p role="alert">{error}</p>}
    {explanation && <p role="status" style={{ whiteSpace: "pre-wrap" }}>{explanation}</p>}
    <small>Not connected to Deriv broker buys. Does not modify any of the 15 strategies, bot signals, controls, stakes, or orders.</small>
  </div>;
}
