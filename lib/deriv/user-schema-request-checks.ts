/**
 * Source-derived Deriv request contract checks from the user-provided
 * schemas.zip (archived in the Trade Scheme FX ChatGPT Library).
 * This module is intentionally offline and never sends broker orders.
 * Full schemas remain in the archived original; these checks cover only
 * the explicitly identified required fields and types.
 */
export type DerivValidation = { ok: boolean; errors: string[] };
const object = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const symbol = (x: unknown) => typeof x === "string" && /^\w{2,30}$/.test(x);

export function validateTicksRequest(input: unknown): DerivValidation {
  const errors: string[] = [];
  if (!object(input)) return { ok: false, errors: ["Expected object"] };
  if (!symbol(input.ticks) && !(Array.isArray(input.ticks) && input.ticks.every(symbol))) errors.push("Invalid ticks symbol");
  if (input.subscribe !== undefined && input.subscribe !== 1) errors.push("subscribe must be 1");
  for (const key of Object.keys(input)) if (!["ticks", "subscribe", "passthrough", "req_id"].includes(key)) errors.push("Unknown property: " + key);
  if (input.passthrough !== undefined && !object(input.passthrough)) errors.push("passthrough must be an object");
  return { ok: errors.length === 0, errors };
}

export function validateAutoStartRequiredFields(input: unknown): DerivValidation {
  const errors: string[] = [];
  if (!object(input)) return { ok: false, errors: ["Expected object"] };
  if (input.auto_start !== 1) errors.push("auto_start must equal 1");
  if (typeof input.strategy_id !== "string" || !input.strategy_id) errors.push("strategy_id required");
  if (!object(input.strategy_parameters)) errors.push("strategy_parameters object required");
  if (!object(input.contract_template)) errors.push("contract_template object required");
  else {
    for (const key of ["contract_type", "currency", "underlying_symbol"]) {
      if (typeof input.contract_template[key] !== "string" || !input.contract_template[key]) errors.push("contract_template." + key + " required");
    }
  }
  return { ok: errors.length === 0, errors };
}
