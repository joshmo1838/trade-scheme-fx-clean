import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// The API + GoTrue + PostgREST + PostgreSQL all run INSIDE isolated
// supabase start in GitHub Actions. No production identity or token is used.
const api=process.env.SENFX_TEST_REAL_API_URL;
const anon=process.env.SENFX_TEST_AUTH_ANON_KEY;
const service=process.env.SENFX_TEST_AUTH_SERVICE_KEY;
if(!api || !/^http:\/\/127\.0\.0\.1:\d+$/.test(api) || !anon || !service) {
  throw Error("Real RLS QA requires disposable loopback Supabase URL and keys.");
}
const auth=api+"/auth/v1";
const rest=api+"/rest/v1";
const BOT_A="a1000000-0000-4000-8000-000000000001";
const BOT_B="b2000000-0000-4000-8000-000000000002";
const idempotency="c3000000-0000-4000-8000-000000000003";

async function request(url, options={}) {
  const {method="GET",token=anon,payload,prefer}=options;
  const headers={
    apikey:token===service?service:anon,
    Authorization:"Bearer "+token,
    "Content-Type":"application/json",
    ...(prefer?{Prefer:prefer}:{})
  };
  const res=await fetch(url,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
  const raw=await res.text();
  let data=null;
  try {data=raw?JSON.parse(raw):null;}catch{data={error:raw.slice(0,150)};}
  return {status:res.status,ok:res.ok,data};
}
function expectOk(res,label) {
  assert.equal(res.ok,true,label+" returned "+res.status+": "+JSON.stringify(res.data).slice(0,260));
  return res.data;
}
async function signup(label) {
  const email=label+"-"+randomUUID()+"@example.invalid";
  const password="Disposable-SENFX-CI-"+randomUUID();
  expectOk(await request(auth+"/signup",{method:"POST",payload:{email,password}}),"signup");
  const tokenResponse=expectOk(await request(auth+"/token?grant_type=password",{method:"POST",payload:{email,password}}),"password login");
  assert.ok(tokenResponse?.access_token);
  const user=expectOk(await request(auth+"/user",{token:tokenResponse.access_token}),"JWT verification");
  assert.equal(user.id,tokenResponse.user.id);
  return {id:user.id,token:tokenResponse.access_token};
}
async function waitForSchema() {
  for(let n=0;n<20;n++){
    const r=await request(rest+"/bots?select=id&limit=1",{token:service});
    if(r.ok) return;
    if(n===19)assert.fail("Local PostgREST did not reload test schema: "+JSON.stringify(r.data));
    await new Promise(resolve=>setTimeout(resolve,400));
  }
}

test("real GoTrue JWT plus PostgreSQL RLS prevents cross-customer bot access",{
  timeout:60_000
},async()=>{
  await waitForSchema();
  const alice=await signup("rls-alice");
  const bob=await signup("rls-bob");
  assert.notEqual(alice.id,bob.id);
  const botRows=[{id:BOT_A,is_published:true},{id:BOT_B,is_published:true}];
  expectOk(await request(rest+"/bots",{method:"POST",token:service,
    prefer:"return=representation",payload:botRows}),"seed bots");
  expectOk(await request(rest+"/customer_bots",{method:"POST",token:service,
    prefer:"return=representation",payload:[
      {customer_id:alice.id,bot_id:BOT_A,trading_mode:"demo",selected:true,control_status:"selected"},
      {customer_id:bob.id,bot_id:BOT_B,trading_mode:"demo",selected:true,control_status:"selected"}
    ]}),"seed selections");
  expectOk(await request(rest+"/customer_bot_configurations",{method:"POST",token:service,
    prefer:"return=representation",payload:[
      {customer_id:alice.id,bot_id:BOT_A,trading_mode:"demo",stake_amount:10,daily_loss_limit:20},
      {customer_id:bob.id,bot_id:BOT_B,trading_mode:"demo",stake_amount:10,daily_loss_limit:20}
    ]}),"seed risk settings");

  // Only the server service role can call the REAL persistent control RPC.
  const queued=expectOk(await request(rest+"/rpc/senfx_queue_paper_bot_command",{
    method:"POST",token:service,payload:{
      p_customer_id:alice.id,p_bot_id:BOT_A,p_command_id:idempotency,p_action:"start"
    }}),"server-only paper Start");
  assert.equal(queued.accepted,true);
  assert.equal(queued.desiredState,"running");
  assert.equal(queued.version,1);

  const runsPath=rest+"/bot_execution_runs?select=customer_id,bot_id,desired_state,observed_state,control_version";
  const commandsPath=rest+"/bot_execution_commands?select=customer_id,bot_id,action,status,version";
  const aliceRuns=expectOk(await request(runsPath,{token:alice.token}),"Alice read own runs");
  const bobRuns=expectOk(await request(runsPath,{token:bob.token}),"Bob read runs");
  const aliceCommands=expectOk(await request(commandsPath,{token:alice.token}),"Alice read commands");
  const bobCommands=expectOk(await request(commandsPath,{token:bob.token}),"Bob read commands");
  assert.equal(aliceRuns.length,1);
  assert.equal(aliceRuns[0].customer_id,alice.id);
  assert.equal(aliceRuns[0].observed_state,"stopped","queued Start is not running execution");
  assert.deepEqual(bobRuns,[]);
  assert.equal(aliceCommands.length,1);
  assert.equal(aliceCommands[0].status,"queued");
  assert.deepEqual(bobCommands,[]);
  const attemptedFilter=expectOk(await request(runsPath+"&customer_id=eq."+alice.id,{
    token:bob.token}),"Bob filtered for Alice");
  assert.deepEqual(attemptedFilter,[]);

  // RLS + grants must deny BOTH customers direct mutations and privileged RPC.
  for(const [who,token] of [["Bob",bob.token],["Alice",alice.token]]){
    const bypass=await request(rest+"/rpc/senfx_queue_paper_bot_command",{
      method:"POST",token,payload:{
        p_customer_id:alice.id,p_bot_id:BOT_A,
        p_command_id:randomUUID(),p_action:"stop"
      }});
    assert.equal(bypass.ok,false,who+" directly executed server-only control RPC");
    const edited=await request(rest+"/bot_execution_runs?customer_id=eq."+alice.id,{
      method:"PATCH",token,payload:{desired_state:"stopped"}});
    assert.equal(edited.ok,false,who+" directly edited worker run");
    const inserted=await request(rest+"/bot_execution_commands",{
      method:"POST",token,payload:{
        id:randomUUID(),run_id:queued.runId,
        customer_id:alice.id,bot_id:BOT_A,action:"stop",
        requested_state:"stopped",version:999
      }});
    assert.equal(inserted.ok,false,who+" directly created command");
  }
  const anonRead=await request(runsPath);
  assert.equal(anonRead.ok,false,"Anonymous visitor read private paper runs");
  // Real GoTrue JWT -> PostgREST -> ACTUAL Phase 4 paper-worker SQL and RLS.
  // A service-only worker reports fresh public-feed readiness; no Deriv order.
  const workerId="senfx_ci_paper_worker_01";
  const rpc=(name,payload,token=service)=>request(rest+"/rpc/"+name,{
    method:"POST",token,payload,
  });
  const sync=expectOk(await rpc("senfx_paper_worker_sync",{
    p_run_id:queued.runId,p_worker_id:workerId,p_report:"running",
  }),"service-only paper worker ready");
  assert.equal(sync.owned,true);
  assert.equal(sync.observedState,"running");

  // The worker reserves simulated risk with a signed current command version.
  // Never substitute market price data for this mock input or call a broker API.
  const epoch=Math.floor(Date.now()/1000)-3;
  const entry=expectOk(await rpc("senfx_paper_worker_reserve",{
    p_run_id:queued.runId,p_worker_id:workerId,p_version:1,
    p_symbol:"R_100",p_direction:"CALL",p_entry:100,p_tick_epoch:epoch,
  }),"server-only paper risk reservation");
  assert.equal(entry.allowed,true,JSON.stringify(entry));
  assert.ok(entry.positionId);
  const posPath=rest+"/bot_execution_paper_positions?select=id,customer_id,status,remaining_ticks";
  const riskPath=rest+"/customer_paper_daily_risk?select=customer_id,reserved_loss,realized_loss";
  const reservesPath=rest+"/customer_paper_trade_reservations?select=customer_id,status";
  const alicePositions=expectOk(await request(posPath,{token:alice.token}),"Alice sees paper position");
  const bobPositions=expectOk(await request(posPath,{token:bob.token}),"Bob sees no paper position");
  assert.equal(alicePositions.length,1);
  assert.equal(alicePositions[0].customer_id,alice.id);
  assert.equal(alicePositions[0].status,"open");
  assert.deepEqual(bobPositions,[]);
  const aliceRisk=expectOk(await request(riskPath,{token:alice.token}),"Alice sees reserved paper risk");
  const bobRisk=expectOk(await request(riskPath,{token:bob.token}),"Bob sees no paper risk");
  assert.equal(aliceRisk.length,1);
  assert.equal(Number(aliceRisk[0].reserved_loss),10);
  assert.deepEqual(bobRisk,[]);
  const aliceReservations=expectOk(await request(reservesPath,{token:alice.token}),"Alice sees own reservation");
  assert.equal(aliceReservations.length,1);
  assert.equal(aliceReservations[0].status,"open");
  assert.deepEqual(expectOk(await request(reservesPath,{token:bob.token}),"Bob sees no reservations"),[]);

  for(const [who,token] of [["Bob",bob.token],["Alice",alice.token]]) {
    for(const [rpcName,args] of [
      ["senfx_paper_worker_sync",{p_run_id:queued.runId,p_worker_id:workerId,p_report:"stopped"}],
      ["senfx_paper_worker_reserve",{
        p_run_id:queued.runId,p_worker_id:workerId,p_version:1,
        p_symbol:"R_100",p_direction:"PUT",p_entry:100,p_tick_epoch:epoch,
      }],
      ["senfx_paper_worker_tick",{
        p_run_id:queued.runId,p_worker_id:workerId,p_version:1,
        p_quote:101,p_tick_epoch:epoch+1,
      }],
    ]) {
      const result=await rpc(rpcName,args,token);
      assert.equal(result.ok,false,who+" invoked privileged "+rpcName);
    }
    const patch=await request(rest+"/bot_execution_paper_positions?id=eq."+entry.positionId,{
      method:"PATCH",token,payload:{status:"settled"}
    });
    assert.equal(patch.ok,false,who+" modified paper position");
  }
  assert.equal((await request(posPath)).ok,false,"Anonymous visitor read paper positions");

  // A customer Stop is queued by the server and then acknowledged by the
  // actual SQL worker. It must cancel unsettled exposure, never settle it.
  const stopped=expectOk(await rpc("senfx_queue_paper_bot_command",{
    p_customer_id:alice.id,p_bot_id:BOT_A,
    p_command_id:randomUUID(),p_action:"stop",
  }),"server-only paper Stop");
  assert.equal(stopped.accepted,true);
  assert.equal(stopped.version,2);
  const stoppedSync=expectOk(await rpc("senfx_paper_worker_sync",{
    p_run_id:queued.runId,p_worker_id:workerId,p_report:"stopped",
  }),"worker acknowledges Stop");
  assert.equal(stoppedSync.observedState,"stopped");
  const positionsAfter=expectOk(await request(posPath,{token:alice.token}),"post-Stop paper positions");
  assert.equal(positionsAfter.length,1);
  assert.equal(positionsAfter[0].status,"cancelled");
  const riskAfter=expectOk(await request(riskPath,{token:alice.token}),"post-Stop paper risk");
  assert.equal(Number(riskAfter[0].reserved_loss),0);
  assert.equal(Number(riskAfter[0].realized_loss),0);
  const stale=expectOk(await rpc("senfx_paper_worker_tick",{
    p_run_id:queued.runId,p_worker_id:workerId,p_version:1,
    p_quote:101,p_tick_epoch:epoch+2,
  }),"stale worker tick");
  assert.equal(stale.accepted,false);

  const finalRuns=expectOk(await request(runsPath,{token:service}),"service audit");
  const finalCommands=expectOk(await request(commandsPath,{token:service}),"service commands");
  assert.equal(finalRuns.length,1);
  assert.equal(finalRuns[0].desired_state,"stopped");
  assert.equal(finalRuns[0].observed_state,"stopped");
  assert.equal(finalCommands.length,2);
  assert.deepEqual(expectOk(await request(runsPath,{token:bob.token}),"Bob still isolated"),[]);
  assert.deepEqual(expectOk(await request(posPath,{token:bob.token}),"Bob still sees no positions"),[]);
});
