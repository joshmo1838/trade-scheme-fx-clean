import test from "node:test";
import assert from "node:assert/strict";
import { POST, GET } from "../../app/api/bot-control/route.ts";
import { NextRequest } from "./mock-next.mjs";
import { state, reset, ALICE, BOB, ALICE_BOT, BOB_BOT } from "./state.mjs";

const origin = "https://trade-scheme-qa.invalid";
const cmd = n => "a0000000-0000-4000-8000-" + String(n).padStart(12,"0");
function request({botId=ALICE_BOT,action="start",commandId=cmd(1),sameOrigin=true,body={},raw}={}) {
  const headers={"Content-Type":"application/json"};
  if(sameOrigin===true) headers.origin=origin;
  if(sameOrigin===false) headers.origin="https://attacker.invalid";
  return new NextRequest(origin + "/api/bot-control",{
    method:"POST",headers,body:raw===undefined
      ? JSON.stringify({botId,action,commandId,...body}) : raw,
  });
}
const json = response => response.json();
function useAlice(){state.currentUser=ALICE;process.env.SENFX_BOT_CONTROL_ENABLED="true";}
function init() {
  reset();
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://ci-senfx.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY="CI-SERVICE-ROLE-ONLY";
  process.env.SENFX_BOT_CONTROL_ENABLED="true";
}

test("no session rejects all writes and reads before privileged RPC",async()=>{
  init();
  const get=await GET();
  assert.equal(get.status,401);
  const post=await POST(request());
  assert.equal(post.status,401);
  assert.equal(state.adminCalls.length,0);
  assert.equal(get.headers.get("cache-control"),"no-store, max-age=0");
});

test("disabled feature gate blocks even an authenticated customer",async()=>{
  init();useAlice();
  delete process.env.SENFX_BOT_CONTROL_ENABLED;
  const get=await GET(), body=await json(get);
  assert.equal(get.status,200);
  assert.equal(body.enabled,false);
  assert.deepEqual(body.runs,[]);
  const post=await POST(request());
  assert.equal(post.status,503);
  assert.equal(state.adminCalls.length,0);
});

test("same-origin check prevents cross-site or missing-origin POST",async()=>{
  init();useAlice();
  for(const sameOrigin of [false,null]) {
    const post=await POST(request({sameOrigin}));
    assert.equal(post.status,403);
  }
  assert.equal(state.adminCalls.length,0);
});

test("reject malformed JSON, oversized payload, unknown action and invalid IDs",async()=>{
  init();useAlice();
  const cases=[
    [request({raw:"{invalid"}),400],
    [request({raw:" ".repeat(2050)}),413],
    [request({action:"buy"}),400],
    [request({botId:"not-a-uuid"}),400],
    [request({commandId:"garbage"}),400],
  ];
  for(const [req,expected] of cases) {
    const res=await POST(req); assert.equal(res.status,expected);
  }
  assert.equal(state.adminCalls.length,0);
});

test("signed-in owner queues Start; replay is idempotent and no brokerage occurs",async()=>{
  init();useAlice();
  const one=await POST(request());
  assert.equal(one.status,202);
  const body=await json(one);
  assert.equal(body.accepted,true);
  assert.equal(body.duplicate,false);
  assert.equal(body.desiredState,"running");
  assert.equal(body.version,1);
  assert.equal(body.executed,false);
  assert.equal(body.brokerOrderPlaced,false);
  assert.equal(body.mode,"paper");
  assert.equal(state.adminCalls.length,1);
  assert.equal(state.adminCalls[0].args.p_customer_id,ALICE);
  assert.equal(state.adminCalls[0].args.p_bot_id,ALICE_BOT);
  assert.equal(state.commands.length,1);
  const repeated=await POST(request());
  const dupe=await json(repeated);
  assert.equal(repeated.status,202);
  assert.equal(dupe.duplicate,true);
  assert.equal(dupe.version,1);
  assert.equal(state.commands.length,1);
});

test("body-supplied customer ID cannot override verified session",async()=>{
  init();useAlice();
  const response=await POST(request({body:{customerId:BOB,userId:BOB}}));
  assert.equal(response.status,202);
  assert.equal(state.adminCalls[0].args.p_customer_id,ALICE);
});

test("cross-customer bot selection rejects and never exposes foreign status",async()=>{
  init();useAlice();
  const foreign=await POST(request({botId:BOB_BOT}));
  assert.equal(foreign.status,409);
  assert.equal(state.commands.length,0);

  const own=await POST(request({botId:ALICE_BOT}));
  assert.equal(own.status,202);
  state.currentUser=BOB;
  const get=await GET(), body=await json(get);
  assert.equal(get.status,200);
  assert.deepEqual(body.runs,[]);
  assert.deepEqual(body.commands,[]);
  const foreignStop=await POST(request({action:"stop",botId:ALICE_BOT,commandId:cmd(2)}));
  assert.equal(foreignStop.status,409);
  assert.equal(state.commands.length,1);
});

test("Start, Pause, Resume and Stop revisions are monotonic and queued",async()=>{
  init();useAlice();
  const actions=["start","pause","resume","stop"];
  const states=["running","paused","running","stopped"];
  for(let i=0;i<actions.length;i++) {
    const res=await POST(request({action:actions[i],commandId:cmd(i+1)}));
    assert.equal(res.status,202);
    const body=await json(res);
    assert.equal(body.version,i+1);
    assert.equal(body.desiredState,states[i]);
    assert.equal(body.executed,false);
  }
  const get=await GET(), data=await json(get);
  assert.equal(data.runs.length,1);
  assert.equal(data.runs[0].desired_state,"stopped");
  assert.equal(data.runs[0].workerConnected,false);
  assert.equal(data.workerAttached,false);
  assert.equal(data.commands.length,4);
});

test("GET requires heartbeat AND unexpired lease before online status",async()=>{
  init();useAlice();
  await POST(request());
  const run=state.rows[0];
  run.observed_state="running";
  run.heartbeat_at=new Date().toISOString();
  run.lease_expires_at=new Date(Date.now()+18_000).toISOString();
  let response=await json(await GET());
  assert.equal(response.workerAttached,true);
  assert.equal(response.runs[0].workerConnected,true);

  run.lease_expires_at=new Date(Date.now()-1000).toISOString();
  response=await json(await GET());
  assert.equal(response.workerAttached,false);

  run.lease_expires_at=new Date(Date.now()+18_000).toISOString();
  run.heartbeat_at=new Date(Date.now()-60_000).toISOString();
  response=await json(await GET());
  assert.equal(response.workerAttached,false);
});

test("DB outages fail closed with 503, not phantom worker status or order",async()=>{
  init();useAlice();
  state.failReads=true;
  const read=await GET();
  assert.equal(read.status,503);
  state.failWrites=true;
  const write=await POST(request());
  assert.equal(write.status,503);
  assert.equal(state.commands.length,0);
});
