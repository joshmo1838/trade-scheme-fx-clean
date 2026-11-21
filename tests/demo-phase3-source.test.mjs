import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/senfx-deriv-demo-auto-phase3.sql",import.meta.url),"utf8");
const authorization=readFileSync(new URL("../supabase/senfx-deriv-demo-auto-phase3-authorization.sql",import.meta.url),"utf8");
test("third authorization is separately versioned, single-use and after exactly two settled buys",()=>{
 assert.match(sql,/create table if not exists public\.senfx_demo_auto_phase3_one_shots/);
 assert.match(sql,/v_prior_attempts = 2/);
 assert.match(sql,/v_prior_attempts > 2/);
 assert.match(sql,/v_auto_phase3 := true/);
 assert.match(sql,/consumed_order_id=p_order_id,consumed_at=now\(\)/);
 assert.match(sql,/status='armed' and consumed_order_id is null/);
 assert.match(sql,/v_risk\.daily_loss_limit <> 1/);
 assert.match(sql,/v_risk\.realized_loss \+ v_risk\.reserved_loss \+ v_order\.stake_amount/);
 assert.match(sql,/active_account_type = 'demo'/);
 assert.match(sql,/grant execute on function public\.senfx_demo_reserve_order\(uuid,uuid\) to service_role/);
 assert.doesNotMatch(sql,/delete from public\.deriv_demo_orders|truncate\s+public\.deriv_demo_orders/i);
});
test("grant operator must prove only one matching admin and no unresolved order",()=>{
 assert.match(authorization,/v_matches <> 1/);
 assert.match(authorization,/active_account_type='demo'/);
 assert.match(authorization,/r\.realized_loss <> 0 or r\.reserved_loss <> 0/);
 assert.match(authorization,/now\(\)\+interval '2 hours'/);
 assert.doesNotMatch(authorization,/update public\.senfx_demo_auto_one_shots/i);
});
