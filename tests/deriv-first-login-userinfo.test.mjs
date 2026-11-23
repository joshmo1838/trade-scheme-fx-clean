import test from "node:test";
import assert from "node:assert/strict";
import { derivUserinfoFromNickname } from "../lib/deriv/first-login-userinfo.ts";

const uuid = "3d8f2010-78c4-4e3a-8ad9-63d14b3a2d80";

test("normalizes documented Deriv identity into a subject without leaking nickname or email", () => {
  const userinfo = derivUserinfoFromNickname({
    data: { external_reference_id: uuid.toUpperCase(), nickname: "private-user" },
    errors: [], metadata: {}
  });
  assert.deepEqual(userinfo, { sub: uuid, id: uuid });
  assert.equal("email" in userinfo, false);
  assert.equal("nickname" in userinfo, false);
  assert.equal(Object.isFrozen(userinfo), true);
});

test("rejects invalid, error and account-only payloads", () => {
  for (const payload of [
    null, [], {}, { data: {}, errors: [] },
    { data: { loginid: "VRTC123", account_id: "CR123" }, errors: [] },
    { data: { external_reference_id: uuid }, errors: [{ code: "invalid_token" }] },
    { data: { external_reference_id: uuid } },
    { data: { external_reference_id: "CR123" }, errors: [] },
    { data: { external_reference_id: "123456" }, errors: [] }
  ]) {
    assert.throws(() => derivUserinfoFromNickname(payload));
  }
});

test("different Deriv identities remain distinct", () => {
  const other = "8e1a75bf-814f-4fa1-9e3c-5cbdb6e053df";
  const a = derivUserinfoFromNickname({ data: { external_reference_id: uuid }, errors: [] });
  const b = derivUserinfoFromNickname({ data: { external_reference_id: other }, errors: [] });
  assert.notEqual(a.sub, b.sub);
});
