export type DemoStrategyValidation = Readonly<{
  status: "passed";
  strategyVersion: string;
  evaluationMethod: "chronological-block-bootstrap";
  predeclaredCriteriaPassed: true;
  evidenceDigest: string;
  effectiveSampleSize: number;
  probabilityLowerBound: number;
  costsPerTrade: number;
  validatedAt: string;
  configuration: Readonly<{
    marketSymbol: string;
    currency: string;
    contractFamily: string;
    contractType: string;
    duration: number | null;
    durationUnit: string | null;
    barrier: string | null;
    multiplier: number | null;
  }>;
}>;

export type QuantumStrategy = Readonly<{
  id: string;
  name: string;
  model: string;
  color: string;
  rule: string;
  version: string;
  mode: "RESEARCH" | "DEMO_VALIDATED";
  validated: boolean;
  executionEnabled: boolean;
  validation: DemoStrategyValidation | null;
}>;
export declare const STRATEGIES: ReadonlyArray<QuantumStrategy>;
