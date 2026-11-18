import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluatePaperSignal, paperPreset } from "../lib/bots/paper-strategy.ts";

const worker = readFileSync("worker/senfx-customer-paper-worker.mjs", "utf8");
const sql = readFileSync("supabase/senfx-persistent-paper-worker.sql", "utf8");

test("paper worker uses public feed only and is off by default", () => {
  assert.match(worker, /SENFX_PAPER_WORKER_ENABLED\s*!==\s*"true"/);
  assert.match(worker, /wss:\/\/api\.derivws\.com\/trading\/v1\/options\/ws\/public/);
  assert.doesNotMatch(worker, /DERIV_TOKEN_ENCRYPTION_KEY|DERIV_CLIENT_ID|DERIV_DEMO_TRADING_ENABLED/);
  assert.doesNotMatch(worker, /proposal_open_contract|\bbuy\s*:\s*1|\bsell\s*:\s*1/);
  assert.match(worker, /senfx_paper_worker_reserve/);
  assert.match(worker, /senfx_paper_worker_tick/);
});

test("public-tick paper worker uses same pure strategy logic as the customer simulator", () => {
  assert.match(worker, /evaluatePaperSignal\(s\.prices,s\.rule\)/);
  assert.match(worker, /paperPreset\(\{name:data\.botName,market:data\.botMarket\}\)/);
  const rule = paperPreset({name:"SENFX Synthetic Pro",market:"Synthetic Indices"});
  assert.equal(evaluatePaperSignal(Array.from({length:21},(_,i)=>100+i),rule),"CALL");
  assert.equal(evaluatePaperSignal(Array(21).fill(100),rule),null);
});

test("worker SQL uses database lease, control version, and risk reservation RPCs", () => {
  for(const name of ["senfx_paper_worker_sync","senfx_paper_worker_reserve","senfx_paper_worker_tick"]) {
    assert.match(sql,new RegExp("create or replace function public\\."+name+"\\("));
  }
  assert.match(sql,/v_run\.control_version<>p_version/);
  assert.match(sql,/v_run\.desired_state<>'running'/);
  assert.match(sql,/lease_expires_at<=now\(\)/);
  assert.match(sql,/senfx_paper_reserve_trade/);
  assert.match(sql,/senfx_paper_settle_trade/);
  assert.match(sql,/senfx_paper_cancel_reservation/);
  assert.match(sql,/using \(customer_id = \(select auth\.uid\(\)\)\)/);
});
