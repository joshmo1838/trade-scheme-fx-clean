import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDemoOrderGate } from "../lib/deriv/demo-execution-gate.mjs";
const base = { customerConfirmed:true, accountType:"demo", brokerVerifiedDemo:true,
  emergencyStopped:false, riskStateVerified:true, stake:5, dailyLoss:0,
  openOrders:0, aggregateExposure:0, requestId:"12345678-1234-1234-1234-123456789012" };
const enabled = { enabled:true };
test("disabled by default", () => assert.equal(evaluateDemoOrderGate(base).code,"DEMO_EXECUTION_DISABLED"));
test("verified demo with consent passes", () => assert.equal(evaluateDemoOrderGate(base,enabled).allowed,true));
for (const [name, change, code] of [
  ["real account",{accountType:"real"},"VERIFIED_DEMO_ACCOUNT_REQUIRED"],
  ["unverified account",{brokerVerifiedDemo:false},"VERIFIED_DEMO_ACCOUNT_REQUIRED"],
  ["missing consent",{customerConfirmed:false},"CUSTOMER_CONFIRMATION_REQUIRED"],
  ["emergency stop",{emergencyStopped:true},"EMERGENCY_STOP_ACTIVE"],
  ["unknown stop",{emergencyStopped:undefined},"EMERGENCY_STOP_ACTIVE"],
  ["unverified ledger",{riskStateVerified:false},"RISK_STATE_UNVERIFIED"],
  ["open order",{openOrders:1},"OPEN_ORDER_LIMIT"],
  ["fractional open orders",{openOrders:0.5},"OPEN_ORDER_LIMIT"],
  ["reserved exposure without order",{aggregateExposure:1},"RISK_STATE_UNVERIFIED"],
  ["missing idempotency",{requestId:""},"IDEMPOTENCY_KEY_REQUIRED"],
  ["zero stake",{stake:0},"INVALID_STAKE"],
  ["negative stake",{stake:-1},"INVALID_RISK_STATE"],
  ["invalid loss",{dailyLoss:NaN},"INVALID_RISK_STATE"],
]) test(name,()=>assert.equal(evaluateDemoOrderGate({...base,...change},enabled).code,code));
test("no SENFX stake or cumulative daily loss ceiling",()=>{
  for (const stake of [0.01,10,10.01,100,1000000]) {
    assert.equal(evaluateDemoOrderGate({...base,stake,dailyLoss:1000000},enabled).allowed,true);
  }
});
test("malformed and non-finite numeric inputs fail closed",()=>{
  for (const input of [null,undefined,{}, {...base,stake:Infinity},{...base,stake:"100"},
    {...base,openOrders:-1},{...base,aggregateExposure:NaN},{...base,dailyLoss:Infinity},
    {...base,brokerVerifiedDemo:"true"},{...base,customerConfirmed:"true"}]) {
    assert.equal(evaluateDemoOrderGate(input,enabled).allowed,false);
  }
});
test("no override may expand concurrent order count or reintroduce hidden caps",()=>{
  for (const limits of [{maxOpenOrders:2},{maxStake:10},{maxDailyLoss:20},
    {maxOpenOrders:0.5},{maxOpenOrders:Infinity}]) {
    assert.equal(evaluateDemoOrderGate(base,{enabled:true,limits}).code,"INVALID_RISK_LIMITS");
  }
  assert.equal(evaluateDemoOrderGate(base,{enabled:true,limits:{maxOpenOrders:1}}).allowed,true);
});
test("pure guard cannot guarantee concurrent idempotency; SQL must enforce atomically",()=>{
  assert.equal(evaluateDemoOrderGate(base,enabled).allowed,true);
  assert.equal(evaluateDemoOrderGate({...base},enabled).allowed,true);
});

test("idempotency key must be exact UUID shape, not permissive hyphen padding",()=>{
  const malformed = [
    "12345678-1234-1234-1234-123456789012-",
    "12345678---------------------------",
    "12345678-1234-1234-1234-12345678901z",
    "12345678123412341234123456789012",
    "12345678-1234-1234-1234-123456789012extra",
    " 12345678-1234-1234-1234-123456789012",
  ];
  for (const requestId of malformed) assert.equal(evaluateDemoOrderGate({...base,requestId},enabled).code,"IDEMPOTENCY_KEY_REQUIRED");
  assert.equal(evaluateDemoOrderGate({...base,requestId:"ABCDEF12-1234-1234-1234-123456789ABC"},enabled).allowed,true);
});

test("malformed execution configuration fails closed without throwing",()=>{
  for (const config of [null,false,0,"enabled",[],{enabled:false},{enabled:true,limits:[]},{enabled:true,limits:null,extra:"ignored"}]) {
    const result = evaluateDemoOrderGate(base,config);
    if (config?.enabled === true && config?.limits === null) {
      assert.equal(result.allowed,true);
    } else {
      assert.equal(result.allowed,false);
    }
  }
  assert.equal(evaluateDemoOrderGate(base,{enabled:true,limits:[]}).code,"INVALID_RISK_LIMITS");
});
