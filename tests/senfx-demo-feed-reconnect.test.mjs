import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(
 new URL("../worker/senfx-deriv-demo-15bot-worker.mjs",import.meta.url),"utf8");

test("temporary public WebSocket disconnection uses bounded reconnect, not stopping the session immediately",()=>{
 assert.match(source,/const FEED_RECONNECT_LIMIT=3/);
 assert.match(source,/recoverTransientPublicFeed\("socket error"\)/);
 assert.match(source,/recoverTransientPublicFeed\("socket closed"\)/);
 assert.match(source,/if\(feed===ws&&!finishing\)/);
 assert.match(source,/if\(feedReconnectAttempts>FEED_RECONNECT_LIMIT\)/);
 assert.match(source,/if\(!feed&&Date\.now\(\)>=feedReconnectAt\)startPublicFeed\(\)/);
 assert.doesNotMatch(source,/stopOwnedRun\("Public feed disconnected; no guessing or auto retry/);
});
test("reconnect invalidates tick history and suspends new buys until fresh subscription",()=>{
 const reconnection=source.slice(source.indexOf("function recoverTransientPublicFeed("),source.indexOf("function startPublicFeed("));
 assert.match(reconnection,/stopFeed\(\)/);
 assert.match(reconnection,/lastTickReceived=0/);
 assert.match(reconnection,/feedEstablishedAt=0/);
 const start=source.slice(source.indexOf("function startPublicFeed("),source.indexOf("async function poll("));
 assert.match(start,/feedReady=false/);
 assert.match(start,/feedEstablishedAt=Date\.now\(\)/);
 assert.match(start,/feedReady=true/);
 const reserve=source.slice(source.indexOf("async function executeSignal("),source.indexOf("function recoverTransientPublicFeed("));
 assert.match(reserve,/finishing\|\|!feedReady\|\|!feed\|\|!await verifyLease\(version\)/);
 assert.match(reserve,/!permitted\|\|finishing\|\|!feedReady\|\|!feed/);
 assert.match(reserve,/finishing\|\|!feedReady\|\|!feed\|\|!await verifyControl\(version\)/);
});
test("a broker buy remains a strictly single-attempt Demo-only operation",()=>{
 assert.match(source,/const ACTIVE=\[/);
 assert.match(source,/active_account_type!=="demo"/);
 assert.match(source,/url\.pathname!=="\/trading\/v1\/options\/ws\/demo"/);
 assert.match(source,/senfx_demo_bots_mark_attempt/);
 assert.match(source,/No retry of buy under ANY failure/);
 assert.match(source,/Unresolved or unknown Demo purchase after restart/);
 assert.match(source,/Stop All remains authoritative|operator must restart/);
 assert.match(source,/const reply=await session\.request\("buy"/);
 assert.equal((source.match(/session\.request\("buy"/g)||[]).length,1);
});