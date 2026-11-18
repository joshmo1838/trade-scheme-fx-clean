import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

/**
 * Executes the actual PAPER-only worker. Test substitutes:
 *  - a loopback-only PostgREST-shaped API (no customer/project credentials)
 *  - the deterministic test WebSocket, configured to fail permanently
 *
 * This test verifies that public-feed loss demotes observed state and
 * preserves STOP functionality. Database lease/RLS is tested separately.
 */
test("paper worker goes offline on market-feed outage and still obeys Stop", {
  timeout: 55_000,
}, async () => {
  const runId = "a5000000-0000-4000-8000-000000000005";
  const state = {
    desired:"running",
    observed:"stopped",
    syncReports:[],
    reserves:0,
    ticks:0,
    unknownRequests:[],
    workerId:null,
  };
  let child=null;
  let output="";
  const reply=(res,code,payload)=>{
    res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store"});
    res.end(JSON.stringify(payload));
  };
  const server=createServer(async(req,res)=>{
    const path=new URL(req.url||"/","http://127.0.0.1").pathname;
    let body={};
    if(req.method==="POST"){
      const chunks=[];
      for await(const chunk of req)chunks.push(chunk);
      try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}
      catch{return reply(res,400,{error:"Bad test request"});}
    }
    if(req.method==="GET" && path==="/rest/v1/bot_execution_runs"){
      return reply(res,200,[{
        id:runId,desired_state:state.desired,
        observed_state:state.observed,control_version:1,
        updated_at:new Date().toISOString(),
      }]);
    }
    if(req.method==="GET" && path==="/rest/v1/bot_execution_paper_positions"){
      return reply(res,200,[]);
    }
    if(req.method==="POST" && path==="/rest/v1/rpc/senfx_paper_worker_sync"){
      assert.equal(body.p_run_id,runId);
      assert.ok(/^senfxpaper_[0-9a-f]{32}$/.test(body.p_worker_id),
        "Only the generated process ID should reach the local RPC");
      state.workerId=body.p_worker_id;
      state.syncReports.push(body.p_report);
      state.observed=state.desired==="running"
        ? (body.p_report==="running"?"running":"starting")
        : state.desired;
      return reply(res,200,{
        owned:true,runId,botId:"b6000000-0000-4000-8000-000000000006",
        customerId:"c7000000-0000-4000-8000-000000000007",
        botName:"SENFX Synthetic Pro",botMarket:"Synthetic Indices",
        isPublished:true,desiredState:state.desired,
        observedState:state.observed,version:1,
        leaseSeconds:state.desired==="stopped"?0:20,
      });
    }
    if(req.method==="POST" && path==="/rest/v1/rpc/senfx_paper_worker_reserve"){
      state.reserves++;
      // Deny all simulated risk: this test only probes feed/Stop safety.
      return reply(res,200,{allowed:false,reason:"Test risk gate disabled"});
    }
    if(req.method==="POST" && path==="/rest/v1/rpc/senfx_paper_worker_tick"){
      state.ticks++;
      return reply(res,200,{accepted:false,reason:"No authorized paper position"});
    }
    state.unknownRequests.push(req.method+" "+path);
    return reply(res,404,{message:"Unknown/test-forbidden request"});
  });
  try {
    server.listen(0,"127.0.0.1");
    await once(server,"listening");
    const addr=server.address();
    assert.ok(addr && typeof addr==="object");
    child=spawn(process.execPath,[
      "--experimental-strip-types",
      "--import","./tests/fixtures/paper-worker-fake-feed.mjs",
      "worker/senfx-customer-paper-worker.mjs",
    ],{
      cwd:process.cwd(),
      env:{
        PATH:process.env.PATH||"",
        HOME:process.env.HOME||"",
        NODE_ENV:"test",
        SENFX_PAPER_WORKER_ENABLED:"true",
        SENFX_CI_FEED_OUTAGE_AFTER_TICKS:"210",
        SUPABASE_URL:"http://127.0.0.1:"+addr.port,
        SUPABASE_SERVICE_ROLE_KEY:"local-fake-not-production",
      },
      stdio:["ignore","pipe","pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data",chunk=>{output=(output+chunk).slice(-12_000);});
    child.stderr.on("data",chunk=>{output=(output+chunk).slice(-12_000);});
    const waitFor=async(label,condition,ms=14_000)=>{
      const until=Date.now()+ms;
      while(Date.now()<until){
        if(condition())return;
        if(child.exitCode!==null)throw Error(label+": worker exited. "+output);
        await new Promise(resolve=>setTimeout(resolve,110));
      }
      throw Error("Timeout "+label+" "+JSON.stringify(state)+"\n"+output);
    };
    await waitFor("initial feed-backed running heartbeat",
      ()=>state.syncReports.includes("running"),10_000);
    assert.equal(state.observed,"running");
    await waitFor("closed simulated public feed and repeated retry",
      ()=>output.includes("[paper-worker] could not connect public feed"),15_000);
    await waitFor("fresh database sync refuses to report running after outage",
      ()=>state.syncReports.lastIndexOf("starting")>state.syncReports.lastIndexOf("running"),
      12_000);
    assert.equal(state.observed,"starting",
      "A disconnected paper worker cannot be shown as actually running");
    const reservesAtLoss=state.reserves;
    await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal(state.reserves,reservesAtLoss,
      "Market feed outage must not create new paper risk");
    assert.equal(state.ticks,0,"No fake paper position was created");

    // STOP must remain available even with a disconnected feed.
    state.desired="stopped";
    await waitFor("Stop acknowledged with disconnected public feed",
      ()=>state.syncReports.includes("stopped") && state.observed==="stopped",
      9_000);
    const reservesAtStop=state.reserves;
    await new Promise(resolve=>setTimeout(resolve,450));
    assert.equal(state.reserves,reservesAtStop,
      "Stopped worker must never continue paper entries");
    assert.deepEqual(state.unknownRequests,[],
      "Worker attempted an unknown HTTP endpoint, possibly a broker API");
    assert.doesNotMatch(output,/broker order placed|real-money order/i);
  } finally {
    if(child && child.exitCode===null){
      child.kill("SIGTERM");
      await Promise.race([
        once(child,"exit"),
        new Promise(resolve=>setTimeout(resolve,1500)),
      ]);
      if(child.exitCode===null)child.kill("SIGKILL");
    }
    server.closeAllConnections?.();
    await new Promise(resolve=>server.close(resolve));
  }
});
