import test from "node:test";
import assert from "node:assert/strict";
import { DERIV_PRESET_REFERENCE, listDerivPresetReference } from "../lib/deriv/official-preset-reference.mjs";

test("official reference catalog has unique IDs and explicit disabled execution", () => {
  assert.equal(DERIV_PRESET_REFERENCE.length, 14);
  assert.equal(new Set(DERIV_PRESET_REFERENCE.map(item=>item.id)).size, 14);
  assert.ok(DERIV_PRESET_REFERENCE.every(item=>item.execution==="disabled" && item.implementation==="not_implemented"));
  assert.ok(DERIV_PRESET_REFERENCE.every(item=>Object.isFrozen(item)));
});
test("reference filters separate options from accumulators", () => {
  assert.equal(listDerivPresetReference("options").length, 6);
  assert.equal(listDerivPresetReference("accumulators").length, 8);
  assert.throws(()=>listDerivPresetReference("forex"), TypeError);
});
