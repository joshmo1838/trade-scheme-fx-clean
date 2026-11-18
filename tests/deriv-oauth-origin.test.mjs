import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const connect = readFileSync("app/api/deriv/connect/route.ts", "utf8");
const callback = readFileSync("app/api/deriv/callback/route.ts", "utf8");

test("OAuth start and callback enforce the configured host", () => {
  for (const source of [connect, callback]) {
    assert.match(source, /process\.env\.DERIV_OAUTH_ORIGIN/);
    assert.match(source, /const DEFAULT_ORIGIN = "https:\/\/www\.tradesche\.com";/);
    assert.match(source, /request\.nextUrl\.origin !== origin/);
    assert.match(source, /url\.protocol !== "https:"/);
    assert.doesNotMatch(source, /domain:\s*COOKIE_DOMAIN/);
  }
});

test("OAuth redirect and token exchange share the same callback", () => {
  assert.match(connect, /authUrl\.searchParams\.set\("redirect_uri", \x60\$\{origin\}\/api\/deriv\/callback\x60\)/);
  assert.match(callback, /redirect_uri: \x60\$\{origin\}\/api\/deriv\/callback\x60/);
  assert.match(callback, /state !== expectedState/);
  assert.match(callback, /user\.id !== userId/);
});

test("OAuth cookies are host-only and do not expose credentials", () => {
  assert.match(connect, /httpOnly: true/);
  assert.match(connect, /sameSite: "lax"/);
  assert.match(callback, /clearCookies\(/);
  assert.doesNotMatch(connect, /console\.log\([^)]*verifier/);
});

const disconnect = readFileSync("app/api/deriv/disconnect/route.ts", "utf8");
const workspace = readFileSync("app/dashboard/trading-workspace.tsx", "utf8");

test("disconnect is authenticated, same-origin and blocked when trading controls are enabled", () => {
  assert.match(disconnect, /request\.headers\.get\("origin"\) !== request\.nextUrl\.origin/);
  assert.match(disconnect, /supabase\.auth\.getUser\(\)/);
  assert.match(disconnect, /SENFX_BOT_CONTROL_ENABLED/);
  assert.match(disconnect, /DERIV_DEMO_TRADING_ENABLED/);
  assert.match(disconnect, /DERIV_LIVE_TRADING_ENABLED/);
  assert.match(disconnect, /\.delete\(\)\.eq\("user_id", user\.id\)/);
});

test("connected account menu has functional disconnect with confirmation and separate reconnect", () => {
  assert.match(workspace, /window\.confirm\("Disconnect this Deriv account/);
  assert.match(workspace, /fetch\("\/api\/deriv\/disconnect"/);
  assert.match(workspace, /Disconnect Deriv/);
  assert.match(workspace, /Reconnect Deriv/);
  assert.match(workspace, /Connect Deriv/);
});

test("missing or invalid token expiry fails closed before database storage", () => {
  assert.match(callback, /Number\.isFinite\(expiresInSeconds\)/);
  assert.match(callback, /expiresInSeconds <= 0/);
  assert.match(callback, /expires_at: new Date\(Date\.now\(\) \+ expiresInSeconds \* 1000\)\.toISOString\(\)/);
  assert.doesNotMatch(callback, /expires_at:[\s\S]*?: null,/);
});
