import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/senfx-deriv-demo-repeatable-manual.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/deriv/demo/orders/route.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../app/components/DemoTradingConsole.tsx", import.meta.url), "utf8");

test("repeatable Deriv broker Demo is not real-money, has bounded virtual exposure", () => {
 assert.match(sql, /active_account_type = 'demo'/);
 assert.match(sql, /v_order\.stake_amount <> 1 or v_order\.currency <> 'USD'/);
 assert.match(sql, /daily_loss_limit in \(1,10\)/);
 assert.match(sql, /v_risk\.daily_loss_limit <> 10/);
 assert.match(sql, /v_risk\.realized_loss \+ v_risk\.reserved_loss \+ v_order\.stake_amount > v_risk\.daily_loss_limit/);
 assert.match(sql, /'dailyLossLimit',10/);
 assert.match(sql, /'unlimitedDemoPractice',false/);
 assert.match(sql, /status in \('reserved','open','buy_unknown'\)/);
});
test("repeatable reservation retains audits, one active order, volume ceiling and cooling period", () => {
 assert.doesNotMatch(sql,/already attempted the one-time Demo purchase/);
 assert.match(sql,/buy_requested_at is not null\) >= 50/);
 assert.match(sql,/interval '15 seconds'/);
 assert.match(sql,/where id = p_order_id and user_id = p_user_id for update/);
 assert.match(sql,/where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_day for update/);
 assert.match(sql,/Cannot migrate repeatable Demo while orders are unresolved/);
 assert.doesNotMatch(sql,/delete from public\.deriv_demo_orders/i);
});
test("server independently enforces reservation, consent and broker switches", () => {
 assert.match(route, /process\.env\.DERIV_DEMO_BROKER_BUY_ENABLED !== "true"/);
 assert.match(route, /body\?\.confirmVirtualPurchase !== true/);
 assert.match(route, /reservation\.dailyLossLimit !== 10/);
 assert.match(route, /reservation\.unlimitedDemoPractice !== false/);
 assert.match(route, /stake !== 1 \|\| context\.account\.currency !== "USD"/);
 assert.match(route, /session\.request\("buy"/);
 assert.match(route, /buy_requested_at: new Date\(\)\.toISOString\(\)/);
});
test("customer Demo trading interface describes manual repeat and the cap", () => {
 assert.match(ui, /REPEATABLE VIRTUAL DEMO/);
 assert.match(ui, /\$10 daily virtual-loss budget/);
 assert.match(ui, /Get Deriv price/);
 assert.match(ui, /Confirm and buy on DEMO/);
 assert.match(ui, /AI Auto Pilot remains a separately authorized one-shot feature/);
 assert.doesNotMatch(ui,/No SENFX daily loss cap/);
});
