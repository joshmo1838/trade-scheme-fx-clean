import type { ReactNode } from "react";

/**
 * Read-only presentation for customer and administrator workspace health.
 * A status must be supplied by a verified caller; this component does not
 * fetch data, infer broker execution, or perform any side effects.
 */
export type WorkspaceEvidenceState =
  | "verified"
  | "loading"
  | "stale"
  | "unavailable"
  | "simulation";

const descriptions: Record<WorkspaceEvidenceState, string> = {
  verified: "Verified from the stated source",
  loading: "Checking status; not yet verified",
  stale: "Last observation is stale; current status is unknown",
  unavailable: "Status could not be verified",
  simulation: "Simulation only; not broker execution",
};

export function WorkspaceEvidence({
  state,
  label,
  source,
  observedAt,
  children,
}: {
  state: WorkspaceEvidenceState;
  label: string;
  source?: string;
  observedAt?: string;
  children?: ReactNode;
}) {
  return (
    <section className="panel" aria-label={label}>
      <p className="eyebrow">{label}</p>
      <p role="status">
        <strong>{state.toUpperCase()}</strong> — {descriptions[state]}
      </p>
      {source && <p className="muted">Source: {source}</p>}
      {observedAt && <p className="muted">Observed: {observedAt}</p>}
      {children}
    </section>
  );
}
