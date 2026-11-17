type DerivAccountPromptProps = {
  compact?: boolean;
};

/**
 * Public onboarding entry point. Registration happens on Deriv's own site,
 * not inside Trade Scheme FX. No Deriv passwords or personal details are
 * collected by this component.
 */
export default function DerivAccountPrompt({ compact = false }: DerivAccountPromptProps) {
  return (
    <aside
      className={`derivAccountPrompt${compact ? " derivAccountPromptCompact" : ""}`}
      aria-label="Create a Deriv Demo account"
    >
      <div className="derivAccountPromptCopy">
        <p className="derivAccountPromptEyebrow">NEW TO DERIV?</p>
        <h2>Create your free Deriv Demo account</h2>
        <p>
          Don't have Deriv yet? Sign up directly on Deriv's official website.
          Then return to Trade Scheme FX to create or access your free SENFX
          account and connect your Deriv Demo account for practice.
        </p>
      </div>
      <a
        className="button derivAccountPromptButton"
        href="https://home.deriv.com/dashboard/signup"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Create a Deriv account on Deriv's official website (opens in a new tab)"
      >
        Create Deriv account <span aria-hidden="true">↗</span>
      </a>
      <small className="derivAccountPromptNote">
        Opens Deriv in a new tab. Deriv manages registration and eligibility.
        Trade Scheme FX is independent of Deriv.
      </small>
    </aside>
  );
}
