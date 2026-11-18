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
  const finalRuns=expectOk(await request(runsPath,{token:service}),"service audit");
  const finalCommands=expectOk(await request(commandsPath,{token:service}),"service commands");
  assert.equal(finalRuns.length,1);
  assert.equal(finalRuns[0].desired_state,"running");
  assert.equal(finalRuns[0].observed_state,"stopped");
  assert.equal(finalCommands.length,1);
});
