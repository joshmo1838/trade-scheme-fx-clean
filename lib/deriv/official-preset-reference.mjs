// Officially documented Deriv Bot quick-strategy reference catalog.
// Catalog entries are discovery metadata, NOT executable strategies or broker permissions.
// Sources: https://partners-academy.deriv.com/articles/how-to-promote-deriv-bot-as-a-deriv-partner
// https://docs.deriv.com/marketing/2025/ebook-synthetics-en-hq.pdf
// Deriv may add/remove presets; verify against the live platform before claiming completeness.
const templates = [
  ["options-martingale","Martingale","options"],
  ["options-dalembert","D'Alembert","options"],
  ["options-reverse-martingale","Reverse Martingale","options"],
  ["options-reverse-dalembert","Reverse D'Alembert","options"],
  ["options-oscars-grind","Oscar's Grind","options"],
  ["options-1326","1-3-2-6","options"],
  ["accumulators-martingale","Martingale","accumulators"],
  ["accumulators-martingale-stat-reset","Martingale on Stat Reset","accumulators"],
  ["accumulators-dalembert","D'Alembert","accumulators"],
  ["accumulators-dalembert-stat-reset","D'Alembert on Stat Reset","accumulators"],
  ["accumulators-reverse-martingale","Reverse Martingale","accumulators"],
  ["accumulators-reverse-martingale-stat-reset","Reverse Martingale on Stat Reset","accumulators"],
  ["accumulators-reverse-dalembert","Reverse D'Alembert","accumulators"],
  ["accumulators-reverse-dalembert-stat-reset","Reverse D'Alembert on Stat Reset","accumulators"],
];
export const DERIV_PRESET_REFERENCE = Object.freeze(templates.map(([id,name,family])=>Object.freeze({
  id,name,family,implementation:"not_implemented",execution:"disabled",source:"deriv_official"
})));
export function listDerivPresetReference(family) {
  if (family === undefined) return DERIV_PRESET_REFERENCE;
  if (!["options","accumulators"].includes(family)) throw new TypeError("Unsupported Deriv preset family");
  return DERIV_PRESET_REFERENCE.filter(item=>item.family===family);
}
