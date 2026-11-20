import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/deriv/demo/orders/route.ts", import.meta.url), "utf8");
const consoleSource = readFileSync(new URL("../app/components/DemoTradingConsole.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/senfx-deriv-demo-one-dollar-stage-only.sql", import.meta.url), "utf8");

test("separate Demo broker buy switch, explicit consent, no buy without reservation", () => {
  assert.match(route, /if \(action === "buy"\) \{[\s\S]*?DERIV_DEMO_BROKER_BUY_ENABLED[\s\S]*?DEMO_BUY_SAFETY_HOLD/);
  assert.match(route, /confirmVirtualPurchase !== true/);
  assert.match(route, /senfx_demo_reserve_order/);
  assert.match(route, /reservation\.unlimitedDemoPractice !== false/);
  assert.match(route, /reservation\.dailyLossLimit !== 1/);
  assert.match(route, /Number\(reservation\.reservedLoss\) < 1/);
  assert.match(route, /\.eq\("status", "reserved"\)\.is\("buy_requested_at", null\)/);
  assert.match(route, /session\.request\("buy"/);
  assert.match(route, /reconcileBuyOrder\(context/);
});

test("quote and buy reject any stake other than 1 USD", () => {
  assert.match(route, /stake !== 1 \|\| context\.account\.currency !== "USD"/);
  assert.match(route, /order\.stake_amount !== 1 \|\| order\.currency !== "USD"/);
  assert.match(route, /stake > virtualBalance/);
  assert.match(route, /amount: stake/);
  assert.match(route, /stake_amount: stake/);
  assert.doesNotMatch(route, /stake !== 10|order\.stake_amount !== 10/);
});

test("Demo console shows one fixed USD virtual stake and does not claim unlimited practice", () => {
  assert.match(consoleSource, /useState\("1"\)/);
  assert.match(consoleSource, /enteredStake !== 1/);
  assert.match(consoleSource, /max="1" step="1"/);
  assert.match(consoleSource, /readOnly disabled/);
  assert.match(consoleSource, /stake: Number\(stakeText\)/);
  assert.doesNotMatch(consoleSource, /UNLIMITED DAILY DEMO PRACTICE|No SENFX daily loss cap|Fixed stake 10/);
});


test("buy re-quotes a streaming proposal and uses same authenticated session", () => {
  assert.match(route, /session = await openDerivDemoSession\(context\);[\s\S]*?session\.request\("proposal",/);
  assert.match(route, /subscribe: 1,[\s\S]*?underlying_symbol: order\.market_symbol/);
  assert.match(route, /currentAskPrice > Number\(order\.ask_price\) \|\| currentPayout < Number\(order\.payout\)/);
  assert.match(route, /\.eq\("updated_at", order\.updated_at\)/);
  assert.match(route, /buy: freshOrder\.proposal_id/);
  assert.match(route, /price: Number\(freshOrder\.ask_price\)/);
  assert.doesNotMatch(route, /buy: order\.proposal_id/);
});

test("staging-only schema proposal enforces exact 1 USD pilot amounts", () => {
  assert.match(migration, /DO NOT APPLY TO PRODUCTION/);
  assert.match(migration, /empty, isolated QA Demo tables/);
  assert.match(migration, /check \(stake_amount = 1\)/);
  assert.match(migration, /check \(ask_price > 0 and ask_price <= 1\)/);
  assert.match(migration, /check \(daily_loss_limit = 1\)/);
  assert.doesNotMatch(migration, /check \(stake_amount > 0\)/);
});
