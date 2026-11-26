export const quantumDemoContracts: Readonly<Record<string, Readonly<Record<string, string>>>>;

export function mapQuantumDemoSignal(
  strategyId: string,
  signal: { kind: string; barrier?: unknown },
): { contract_type: string; duration: 1; duration_unit: 't'; barrier?: string } | null;
