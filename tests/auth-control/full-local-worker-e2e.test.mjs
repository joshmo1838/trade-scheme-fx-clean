import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { GET as getBotControl, POST as postBotControl } from "../../app/api/bot-control/route.ts";
import { NextRequest } from "./mock-next.mjs";

/**
 * Full LOCAL integration: real GoTrue-signed customer sessions,
 * actual PostgREST + PostgreSQL Phase 3/4 RPCs, and ACTUAL paper worker
 * process using an isolated fake public-tick WebSocket.
 *
 * No production project URL/key, customer data or Deriv broker order exists.
 * Supabase must already be running at loopback in the disposable CI stack.
 */
const api = process.env.SENFX_TEST_REAL_API_URL;
const anon = process.env.SENFX_TEST_AUTH_ANON_KEY;
const service = process.env.SENFX_TEST_AUTH_SERVICE_KEY;
if (!api || !/^http:\/\/127\.0\.0\.1:\d+$/.test(api) ||
    !anon || !service || anon===service) {
  throw Error("Full worker integration is restricted to disposable local Supabase.");
}
const rest=api+"/rest/v1";
const auth=api+"/auth/v1";
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const browserOrigin="https://senfx-local-test.invalid";
process.env.SENFX_BOT_CONTROL_ENABLED="true";
process.env.NEXT_PUBLIC_SUPABASE_URL=api;
process.env.SUPABASE_SERVICE_ROLE_KEY=service;

async function customerPost(token,botId,action,commandId=randomUUID(),extra={},origin=browserOrigin) {
  process.env.SENFX_TEST_CUSTOMER_JWT=token;
  const response=await postBotControl(new NextRequest(browserOrigin+"/api/bot-control",{
    method:"POST",
    headers:{"Content-Type":"application/json",origin},
    body:JSON.stringify({botId,action,commandId,...extra})
  }));
  const data=await response.json();
  return {status:response.status,data};
}
async function customerGet(token){
  process.env.SENFX_TEST_CUSTOMER_JWT=token;
  const response=await getBotControl();
  return {status:response.status,data:await response.json()};
}


async function call(path,{method="GET",token=service,body,prefer}={}){
  const resp=await fetch(path,{
    method,headers:{
      apikey:token===service?service:anon,
      Authorization:"Bearer "+token,
      "Content-Type":"application/json",
      ...(prefer?{Prefer:prefer}:{})
    },
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const raw=await resp.text();
  let data;
  try{data=raw?JSON.parse(raw):null;}
  catch{data={error:"Unexpected non-JSON response"};}
  if(!resp.ok) {
    throw Error(method+" "+new URL(path).pathname+" returned "+resp.status+
      ": "+JSON.stringify(data).slice(0,300));
  }
  return data;
}
async function localUser(label){
  const email=label+"-"+randomUUID()+"@example.invalid";
  const password="CI-disposable-only-"+randomUUID();
  await call(auth+"/signup",{method:"POST",token:anon,body:{email,password}});
  const login=await call(auth+"/token?grant_type=password",{
    method:"POST",token:anon,body:{email,password}
  });
  assert.ok(login.access_token);
  const checked=await call(auth+"/user",{token:login.access_token});
  assert.equal(checked.id,login.user.id);
  return {id:checked.id,token:login.access_token};
}

test("signed customer -> real SQL paper Start -> actual worker settlement -> Pause/Resume/Stop",{
  timeout:95_000
},async()=>{
  const alice=await localUser("worker-alice");
  const bob=await localUser("worker-bob");
  assert.notEqual(alice.id,bob.id);
  const bot=randomUUID();
  await call(rest+"/bots",{
    method:"POST",prefer:"return=minimal",
    body:{id:bot,name:"SENFX Synthetic Pro",market:"Synthetic Indices",is_published:true}
  });
  await call(rest+"/customer_bots",{method:"POST",body:{
    customer_id:alice.id,bot_id:bot,trading_mode:"demo",
    selected:true,control_status:"selected"
  }});
  await call(rest+"/customer_bot_configurations",{method:"POST",body:{
    customer_id:alice.id,bot_id:bot,trading_mode:"demo",
    stake_amount:10,daily_loss_limit:20
  }});
  // Actual customer API: real GoTrue JWT -> route identity -> local
  // service-only SQL RPC. Caller-provided IDs must NEVER grant authority.
  assert.equal((await customerGet("")).status,401,"Anonymous session read controls");
  assert.equal((await customerPost("invalid-jwt",bot,"start")).status,401,
    "Malformed signed session invoked control");
  assert.equal((await customerPost(alice.token,bot,"start",randomUUID(),{},
    "https://attacker.invalid")).status,403,"Cross-site POST was accepted");
  assert.equal((await customerPost(bob.token,bot,"start")).status,409,
    "Different signed user controlled another user's bot");
  const startKey=randomUUID();
  const startedResponse=await customerPost(alice.token,bot,"start",startKey,{
    customerId:bob.id,userId:bob.id,
  });
  assert.equal(startedResponse.status,202,JSON.stringify(startedResponse));
  const started=startedResponse.data;
  assert.equal(started.accepted,true);
  assert.equal(started.version,1);
  assert.equal(started.executed,false);
  assert.equal(started.brokerOrderPlaced,false);
  const idempotent=await customerPost(alice.token,bot,"start",startKey);
  assert.equal(idempotent.status,202);
  assert.equal(idempotent.data.duplicate,true);
  assert.equal(idempotent.data.version,1);
  const queuedStatus=await customerGet(alice.token);
  assert.equal(queuedStatus.status,200);
  assert.equal(queuedStatus.data.enabled,true);
  assert.equal(queuedStatus.data.workerAttached,false,
    "Queued Start must not be advertised as running");
  assert.equal(queuedStatus.data.runs.length,1);
  assert.equal(queuedStatus.data.runs[0].observed_state,"stopped");
  assert.equal((await customerGet(bob.token)).data.runs.length,0,
    "Route exposed a signed-in foreign customer's paper bot");
  const runId=started.runId;
  let child,log="";
  const runRows=()=>call(rest+"/bot_execution_runs?select=id,customer_id,desired_state,observed_state,control_version&id=eq."+runId);
  const ownTrades=()=>call(rest+"/customer_paper_trades?select=id,customer_id,bot_id,pnl&bot_id=eq."+bot,{token:alice.token});
  const userRows=(path,token)=>call(rest+"/"+path+"?select=id,customer_id&customer_id=eq."+alice.id,{token});
  const wait=async(label,check,deadlineMs=35_000)=>{
    const end=Date.now()+deadlineMs;
    while(Date.now()<end){
      if(child?.exitCode!==null)throw Error("Worker exited before "+label+": "+log);
      try{const result=await check();if(result)return result;}catch(error){
        // Retry only bounded read/connection races; never repeat writes/RPCs.
        if(Date.now()>end-1500)throw error;
      }
      await sleep(260);
    }
    throw Error("Timed out waiting for "+label+"; worker tail: "+log);
  };
  try{
    child=spawn(process.execPath,[
      "--experimental-strip-types",
      "--import","./tests/fixtures/paper-worker-fake-feed.mjs",
      "worker/senfx-customer-paper-worker.mjs",
    ],{
      cwd:process.cwd(),
      env:{
        PATH:process.env.PATH||"",HOME:process.env.HOME||"",
        NODE_ENV:"test",
        SENFX_PAPER_WORKER_ENABLED:"true",
        SENFX_CI_REAL_TICK_INTERVAL_MS:"650",
        SENFX_CI_REAL_TICK_START_LAG_SECONDS:"9",
        SUPABASE_URL:api,SUPABASE_SERVICE_ROLE_KEY:service
      },
      stdio:["ignore","pipe","pipe"]
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data",x=>{log=(log+x).slice(-6000);});
    child.stderr.on("data",x=>{log=(log+x).slice(-6000);});

    await wait("worker heartbeat reports running",async()=>{
      const result=await customerGet(alice.token);
      return result.status===200 &&
        result.data.runs[0]?.observed_state==="running" &&
        result.data.runs[0]?.workerConnected===true;
    },20_000);
    const runningStatus=await customerGet(bob.token);
    assert.equal(runningStatus.status,200);
    assert.equal(runningStatus.data.workerAttached,false);
    assert.deepEqual(runningStatus.data.runs,[]);

    // This trade is written ONLY by the actual child worker through the
    // actual Phase 4 SQL RPCs; nothing directly injects paper trades.
    const first=await wait("actual worker records simulated paper settlement",
      async()=>{const rows=await ownTrades();return rows.length?rows:null;},35_000);
    assert.ok(first.length>=1);
    assert.equal(first[0].customer_id,alice.id);
    assert.equal(first[0].bot_id,bot);
    assert.deepEqual(await userRows("customer_paper_trades",bob.token),[],
      "Foreign signed user cannot see the worker's settled trade");
    assert.equal((await call(rest+"/bot_execution_runs?select=id&customer_id=eq."+alice.id,{
      token:bob.token})).length,0,"Bob cannot see Alice's running paper bot");

    const paused=await customerPost(alice.token,bot,"pause");
    assert.equal(paused.status,202,JSON.stringify(paused));
    assert.equal(paused.data.accepted,true);
    await wait("Pause acknowledged by actual child worker",async()=>{
      const rows=await runRows();return rows[0]?.observed_state==="paused";
    },13_000);
    assert.equal((await call(rest+"/bot_execution_paper_positions?select=id&status=eq.open&run_id=eq."+runId)).length,0,
      "Pause must cancel open simulated risk");

    const resumed=await customerPost(alice.token,bot,"resume");
    assert.equal(resumed.status,202,JSON.stringify(resumed));
    assert.equal(resumed.data.accepted,true);
    await wait("Resume acknowledged by actual child worker",async()=>{
      const rows=await runRows();return rows[0]?.observed_state==="running";
    },13_000);

    const stopped=await customerPost(alice.token,bot,"stop");
    assert.equal(stopped.status,202,JSON.stringify(stopped));
    assert.equal(stopped.data.accepted,true);
    await wait("Stop acknowledged by actual child worker",async()=>{
      const rows=await runRows();return rows[0]?.observed_state==="stopped";
    },13_000);
    assert.equal((await call(rest+"/bot_execution_paper_positions?select=id&status=eq.open&run_id=eq."+runId)).length,0);
    const risk=await call(rest+"/customer_paper_daily_risk?select=reserved_loss&customer_id=eq."+alice.id+"&bot_id=eq."+bot);
    assert.ok(risk.length);
    assert.equal(Number(risk[0].reserved_loss),0,"Stop left open daily paper exposure");
    const commands=await call(rest+"/bot_execution_commands?select=action,status&run_id=eq."+runId);
    assert.deepEqual(commands.map(c=>c.action).sort(),["pause","resume","start","stop"]);
    assert.ok(commands.every(c=>c.status==="acknowledged"),"All commands must be acknowledged, not merely queued");
    const finalGet=await customerGet(alice.token);
    assert.equal(finalGet.status,200);
    assert.equal(finalGet.data.workerAttached,false,"Stop must end worker connection");
    assert.equal(finalGet.data.runs[0].observed_state,"stopped");
    assert.equal((await customerGet(bob.token)).data.runs.length,0);
    assert.match(log,/paper risk reserved/,"Worker never reserved its own simulated paper risk");
    assert.match(log,/paper trade recorded/,"Worker never settled its own simulated paper trade");
    assert.doesNotMatch(log,/broker order placed|real-money order/i);
  } finally {
    if(child && child.exitCode===null){
      child.kill("SIGTERM");
      await Promise.race([once(child,"exit"),sleep(1500)]);
      if(child.exitCode===null)child.kill("SIGKILL");
    }
    // No cleanup of customer data is needed: the entire Supabase test stack
    // is disposed of after the CI job and never talks to hosted production.
  }
});
