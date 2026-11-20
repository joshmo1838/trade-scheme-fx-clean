import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/deriv/demo/orders/route.ts", import.meta.url), "utf8");
const consoleSource = readFileSync(new URL("../app/components/DemoTradingConsole.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/senfx-deriv-demo-unlimited-pilot-draft.sql", import.meta.url), "utf8");

test("Demo broker buy remains hard-disabled", () => {
  assert.match(route, /if \(action === "buy"\) \{[\s\S]*?DEMO_BUY_SAFETY_HOLD/);
  assert.doesNotMatch(route, /session\.request\("buy"/);
});
test("Demo quote uses customer stake and virtual balance guard", () => {
  assert.match(route, /const stake = body\?\.stake/);
  assert.match(route, /stake > virtualBalance/);
  assert.match(route, /amount: stake/);
  assert.match(route, /stake_amount: stake/);
  assert.match(route, /stakeAmount: stake/);
});
test("Demo console supplies editable stake to quote", () => {
  assert.match(consoleSource, /type="number"/);
  assert.match(consoleSource, /stake: Number\(stakeText\)/);
  assert.doesNotMatch(consoleSource, /const DEMO_STAKE = 10/);
});
test("Migration is explicitly review-only and preserves positive stake", () => {
  assert.match(migration, /DO NOT APPLY TO PRODUCTION/);
  assert.match(migration, /check \(stake_amount > 0\)/);
  assert.match(migration, /check \(ask_price > 0\)/);
});
