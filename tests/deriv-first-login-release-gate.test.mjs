import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDerivLoginGate } from "../lib/deriv/first-login-release-gate.mjs";

test("release gate fails closed with missing evidence", () => {
  assert.equal(evaluateDerivLoginGate({}).ready,false);
  assert.equal(evaluateDerivLoginGate({providerIdentityGuarantee:true}).ready,false);
  assert.equal(evaluateDerivLoginGate(null).ready,false);
});
test("release gate requires every independently verified condition", () => {
  const keys=["providerIdentityGuarantee","sameCustomerRepeatedLogin","differentCustomerIsolation","multipleAccountStability","supabaseSessionBridge","oauthReplayAndPkce","endToEndBrowserLogin"];
  const all=Object.fromEntries(keys.map(k=>[k,true]));
  assert.equal(evaluateDerivLoginGate(all).ready,true);
  for(const key of keys) assert.equal(evaluateDerivLoginGate({...all,[key]:false}).ready,false);
});
