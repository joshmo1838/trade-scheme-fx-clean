export type QuantumStrategy = Readonly<{
  id: string;
  name: string;
  model: string;
  color: string;
  rule: string;
  version: string;
  mode: "RESEARCH";
  validated: false;
  executionEnabled: false;
}>;
export declare const STRATEGIES: ReadonlyArray<QuantumStrategy>;
