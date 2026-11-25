import test from "node:test";
import assert from "node:assert/strict";
import { validatedDerivIdentity } from "../lib/deriv/first-login-identity-guard.mjs";

test("fails closed on trading account listings, emails and unverified sources", () => {
  for (const identity of [
    null, {}, {id:"123456"}, {account_id:"DOT90004580"},
    {email:"person@example.com"}, {subject:"123456"},
    {subject:"123456",source:"browser"},
    {subject:"<script>",source:"verified_deriv_user_endpoint"},
    {subject:"ab",source:"verified_deriv_user_endpoint"}
  ]) {
    assert.throws(() => validatedDerivIdentity(identity,"app123"));
  }
});
test("normalizes only a separately verified stable user subject", () => {
  const result=validatedDerivIdentity({
    source:"verified_deriv_user_endpoint",subject:"123456",email:"untrusted@example.com"
  },"app123");
  assert.deepEqual(result,{provider:"deriv",subject:"123456",providerKey:"deriv:app123:123456"});
  assert.equal(Object.hasOwn(result,"email"),false);
  assert.equal(Object.isFrozen(result),true);
  assert.throws(()=>validatedDerivIdentity({source:"verified_deriv_user_endpoint",subject:"123456"},""));
});
