import test from "node:test";
import assert from "node:assert/strict";
import { isVerifiedDemoAccount, validateDemoOtpUrl, validateDemoOtpResponse } from "../lib/deriv/demo-otp-guard.mjs";

const accounts = [
  { account_id: "DOT90004580", account_type: "demo" },
  { account_id: "CR1234567", account_type: "real" }
];
const valid = "wss://api.derivws.com/trading/v1/options/ws/demo?otp=sample-test-only";
test("accepts only account owned by connected user and marked demo", () => {
  assert.equal(isVerifiedDemoAccount(accounts, "DOT90004580"), true);
  assert.equal(isVerifiedDemoAccount(accounts, "CR1234567"), false);
  assert.equal(isVerifiedDemoAccount(accounts, "DOT99999999"), false);
  assert.equal(isVerifiedDemoAccount([], "DOT90004580"), false);
});
test("accepts exact Deriv demo WebSocket OTP endpoint", () => {
  assert.equal(validateDemoOtpUrl(valid), true);
  assert.equal(validateDemoOtpResponse({ data: { url: valid }, meta: {} }), true);
});
test("rejects real account and attacker endpoints", () => {
  for (const url of [
    "wss://api.derivws.com/trading/v1/options/ws/real?otp=x",
    "wss://evil.example/trading/v1/options/ws/demo?otp=x",
    "ws://api.derivws.com/trading/v1/options/ws/demo?otp=x",
    "wss://api.derivws.com.evil.example/trading/v1/options/ws/demo?otp=x",
    "wss://api.derivws.com/trading/v1/options/ws/demo",
    "wss://api.derivws.com/trading/v1/options/ws/demo?otp=x&otp=y",
    "wss://api.derivws.com/trading/v1/options/ws/demo?otp=x&buy=1",
    "wss://api.derivws.com/trading/v1/options/ws/demo?otp=x#fragment"
  ]) assert.equal(validateDemoOtpUrl(url), false, url);
  assert.equal(validateDemoOtpResponse({ data: { url: "secret" } }), false);
});
