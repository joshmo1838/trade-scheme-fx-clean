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
