import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/senfx-deriv-demo-safe-reservation.sql", import.meta.url), "utf8");

test("reservation locks verified customer connection and account/day risk ledger", () => {
  assert.match(sql, /from public\.deriv_connections c[\s\S]*?active_account_type = 'demo'[\s\S]*?for update/);
  assert.match(sql, /from public\.deriv_demo_daily_risk[\s\S]*?for update/);
  assert.match(sql, /o\.id <> p_order_id and o\.status in \('reserved','open','buy_unknown'\)/);
});

test("reservation enforces exact 1 USD virtual stake and a hard 1 USD loss cap", () => {
  assert.match(sql, /v_order\.stake_amount <> 1 or v_order\.currency <> 'USD'/);
  assert.match(sql, /values \(p_user_id,v_order\.account_id,v_day,v_order\.currency,1\)/);
  assert.match(sql, /v_risk\.daily_loss_limit <> 1/);
  assert.match(sql, /v_risk\.realized_loss \+ v_risk\.reserved_loss \+ v_order\.stake_amount > v_risk\.daily_loss_limit/);
  assert.match(sql, /'dailyLossLimit',1/);
  assert.match(sql, /'unlimitedDemoPractice',false/);
});

test("one-time pilot denies second attempt after prior buy request", () => {
  assert.match(sql, /o\.user_id = p_user_id and o\.buy_requested_at is not null/);
  assert.match(sql, /already attempted the one-time Demo purchase/);
  assert.match(sql, /v_order\.status in \('reserved','buy_unknown','open'\)/);
});

test("service-only RPC and no automatic broker order placement", () => {
  assert.match(sql, /revoke all on function public\.senfx_demo_reserve_order\(uuid,uuid\) from public,anon,authenticated/);
  assert.match(sql, /grant execute on function public\.senfx_demo_reserve_order\(uuid,uuid\) to service_role/);
  assert.doesNotMatch(sql, /session\.request\("buy"/);
});
