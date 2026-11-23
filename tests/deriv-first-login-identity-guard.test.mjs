import test from "node:test";
import assert from "node:assert/strict";
import { validatedDerivIdentity } from "../lib/deriv/first-login-identity-guard.mjs";

test("requires verified provider identity and configured app", () => {
  assert.deepEqual(validatedDerivIdentity({id:"123456"}, "app123"), {
    provider:"deriv",subject:"123456",providerKey:"deriv:app123:123456"
  });
  for (const value of [null, {}, {id:""}, {id:"a"}, {id:"<script>"}, {id:123}, {id:"x".repeat(129)}]) {
    assert.throws(() => validatedDerivIdentity(value, "app123"));
  }
  assert.throws(() => validatedDerivIdentity({id:"123456"}, ""));
});
test("does not allow browser email to select an account", () => {
  const value=validatedDerivIdentity({id:"123456",email:"someone@example.com",user_id:"other"}, "app123");
  assert.equal(value.providerKey,"deriv:app123:123456");
  assert.equal(Object.hasOwn(value,"email"),false);
  assert.equal(Object.hasOwn(value,"user_id"),false);
  assert.equal(Object.isFrozen(value),true);
});
