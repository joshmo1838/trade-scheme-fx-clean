import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/senfx-deriv-demo-safe-reservation.sql", import.meta.url), "utf8");

test("Demo reservation serializes on a locked account/day ledger row", () => {
  assert.match(sql, /from public\.deriv_demo_daily_risk[\s\S]*?for update/);
  assert.match(sql, /o\.id <> p_order_id and o\.status in \('reserved','open','buy_unknown'\)/);
});

test("Demo reservation enforces a finite stake and loss budget", () => {
  assert.match(sql, /v_order\.stake_amount <= 0 or v_order\.stake_amount > 10/);
  assert.match(sql, /v_risk\.realized_loss \+ v_risk\.reserved_loss \+ v_order\.stake_amount > v_risk\.daily_loss_limit/);
  assert.match(sql, /'unlimitedDemoPractice',false/);
});

test("Demo reservation fails closed on non-Demo accounts and duplicate orders", () => {
  assert.match(sql, /c\.active_account_type = 'demo'/);
  assert.match(sql, /v_order\.status in \('reserved','buy_unknown','open'\)/);
});
