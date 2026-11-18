import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { GET, POST } from "../../app/api/bot-control/route.ts";
import { NextRequest } from "./mock-next.mjs";
import { ALICE_BOT, BOB_BOT, reset, state } from "./state.mjs";

const base = process.env.SENFX_TEST_REAL_AUTH_URL;
if (!base || !base.startsWith("http://127.0.0.1:")) {
  throw Error("Real Auth CI must only target an ephemeral local GoTrue server.");
}
const origin = "https://trade-scheme-qa.invalid";

async function postAuth(endpoint, payload) {
  const response = await fetch(base+endpoint, {
    method:"POST",
    headers:{"Content-Type":"application/json","apikey":"local-auth-ci-placeholder"},
    body:JSON.stringify(payload),
  });
  const data = await response.json();
  assert.equal(response.ok,true,"Local GoTrue rejected signup/login: "+JSON.stringify({
    status:response.status,error:data.error||data.msg||data.message,
  }));
  return data;
}
async function createVerifiedUser(label) {
  const email=label+"-"+randomUUID()+"@example.invalid";
  const password="Local-CI-Auth-Password-"+randomUUID();
  await postAuth("/signup",{email,password});
  const data=await postAuth("/token?grant_type=password",{email,password});
  assert.ok(data.access_token,"GoTrue did not issue an access token");
  assert.ok(data.user?.id,"GoTrue did not return the user id");
  const response=await fetch(base+"/user",{headers:{
    Authorization:"Bearer "+data.access_token, apikey:"local-auth-ci-placeholder",
  }});
  assert.equal(response.status,200,"Auth did not verify its own token");
  const verified=await response.json();
  assert.equal(verified.id,data.user.id);
  return {id:verified.id,token:data.access_token};
}
function request(botId,action,commandId,extra={}) {
  return new NextRequest(origin+"/api/bot-control",{
    method:"POST",
    headers:{"Content-Type":"application/json",origin},
    body:JSON.stringify({botId,action,commandId,...extra}),
  });
}
function select(user) {
  state.currentToken=user?.token ?? null;
  // This is NOT passed to the production route. Used only by the fake
  // database read adapter to assert that the route filters by verified ID.
  state.currentUser=user?.id ?? null;
}

test("GoTrue-signed tokens gate the real paper-control API route and tenant reads",{
  timeout:45_000,
},async()=>{
  reset();
  process.env.SENFX_BOT_CONTROL_ENABLED="true";
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://ci-senfx.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY="CI-SERVICE-ROLE-ONLY";

  const alice=await createVerifiedUser("alice");
  const bob=await createVerifiedUser("bob");
  assert.notEqual(alice.id,bob.id);
  state.ownedBots.set(ALICE_BOT,alice.id);
  state.ownedBots.set(BOB_BOT,bob.id);
  const uid1="d0000000-0000-4000-8000-000000000001";
  const uid2="d0000000-0000-4000-8000-000000000002";

  select(null);
  assert.equal((await GET()).status,401);
  assert.equal((await POST(request(ALICE_BOT,"start",uid1))).status,401);

  select(alice);
  let response=await POST(request(ALICE_BOT,"start",uid1,{customerId:bob.id,userId:bob.id}));
  assert.equal(response.status,202);
  let payload=await response.json();
  assert.equal(payload.executed,false);
  assert.equal(payload.brokerOrderPlaced,false);
  assert.equal(payload.version,1);
  assert.equal(state.adminCalls[0].args.p_customer_id,alice.id);
  assert.equal(state.commands.length,1);

  // Identical verified token and idempotency key never creates another run.
  assert.equal((await POST(request(ALICE_BOT,"start",uid1))).status,202);
  assert.equal(state.commands.length,1);
  const aliceData=await (await GET()).json();
  assert.equal(aliceData.runs.length,1);
  assert.equal(aliceData.runs[0].customer_id,alice.id);

  select(bob);
  const bobData=await (await GET()).json();
  assert.deepEqual(bobData.runs,[]);
  assert.deepEqual(bobData.commands,[]);
  response=await POST(request(ALICE_BOT,"stop",uid2));
  assert.equal(response.status,409);
  assert.equal(state.commands.length,1);

  // Changing only a fixture user ID cannot override the signed identity.
  select(alice);
  state.currentUser=bob.id;
  assert.equal((await GET()).status,503);
  state.currentUser=alice.id;

  // A corrupted token must be rejected by the real GoTrue /user endpoint.
  state.currentToken=alice.token.slice(0,-2)+"xx";
  assert.equal((await GET()).status,401);
  assert.equal((await POST(request(ALICE_BOT,"pause",uid2))).status,401);
  assert.equal(state.commands.length,1);

  select(alice);
  assert.equal((await POST(request(ALICE_BOT,"pause",uid2))).status,202);
  assert.equal(state.commands[1].customer_id,alice.id);
  assert.equal(state.commands[1].requested_state,"paused");
});
