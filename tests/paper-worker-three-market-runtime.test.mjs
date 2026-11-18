import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

/**
 * True three-bot worker process, with ONLY local disposable HTTP stubs and
 * a hermetic public-tick fixture. Never contacts Deriv or production Supabase.
 */
test("three bots each receive their own market, settle and stop independently", {
  timeout: 58_000,
}, async () => {
  const bots = [
    { name:"SENFX Synthetic Pro", symbol:"R_100" },
    { name:"Synthetic Trend Scout", symbol:"R_50" },
    { name:"Volatility Watch", symbol:"R_75" }
  ].map((item,index) => ({
    ...item,
    id:"11111111-1111-4111-8111-11111111111" + String(index+1),
    botId:"22222222-2222-4222-8222-22222222222" + String(index+1),
    customerId:"33333333-3333-4333-8333-333333333333",
    desired:"running",observed:"stopped",version:1,
    open:false,lastEpoch:0,remaining:0,
    reserved:0,settled:0,wrongMarket:0
  }));
  const requests = [];
  let child=null, output="";
  const reply=(res,code,data)=>{
    res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store"});
    res.end(JSON.stringify(data));
  };
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url||"/","http://127.0.0.1");
    const path=url.pathname;
    let body={};
    if(req.method==="POST") {
      const chunks=[];
      for await(const chunk of req)chunks.push(chunk);
      try {body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}
      catch {return reply(res,400,{message:"Bad test request"});}
    }
    if(req.method==="GET" && path==="/rest/v1/bot_execution_runs") {
      return reply(res,200,bots.filter(s=>s.desired!=="stopped" || s.observed!=="stopped")
        .map(s=>({id:s.id,desired_state:s.desired,observed_state:s.observed,
          control_version:s.version,updated_at:new Date().toISOString()})));
    }
    if(req.method==="GET" && path==="/rest/v1/bot_execution_paper_positions") {
      const runEq=url.searchParams.get("run_id")||"";
      return reply(res,200,bots.filter(s=>s.open && (!runEq || runEq==="eq."+s.id))
        .map(s=>({id:s.id,status:"open"})));
    }
    if(req.method==="POST" && path==="/rest/v1/rpc/senfx_paper_worker_sync") {
      const s=bots.find(x=>x.id===body.p_run_id);
      if(!s||!/^[A-Za-z0-9_-]{8,128}$/.test(body.p_worker_id)) {
        return reply(res,200,{owned:false,reason:"Unknown test run"});
      }
      s.observed=s.desired==="running"
        ? body.p_report==="running"?"running":"starting"
        : s.desired;
      if(s.desired!=="running")s.open=false;
      return reply(res,200,{
        owned:true,runId:s.id,botId:s.botId,customerId:s.customerId,
        botName:s.name,botMarket:"Synthetic Indices",isPublished:true,
        desiredState:s.desired,observedState:s.observed,version:s.version,
        leaseSeconds:s.desired==="stopped"?0:20
      });
    }
    if(req.method==="POST" && path==="/rest/v1/rpc/senfx_paper_worker_reserve") {
      const s=bots.find(x=>x.id===body.p_run_id);
      if(!s)return reply(res,200,{allowed:false,reason:"Unknown test run"});
      if(body.p_symbol!==s.symbol)s.wrongMarket++;
      if(body.p_symbol!==s.symbol || body.p_version!==s.version ||
          s.desired!=="running" || s.observed!=="running" ||
          !Number.isFinite(body.p_entry) || s.open) {
        return reply(res,200,{allowed:false,reason:"Wrong market or no risk authorization"});
      }
      s.open=true;
      s.lastEpoch=body.p_tick_epoch;
      s.remaining=5;
      s.reserved++;
      return reply(res,200,{
        allowed:true,positionId:s.id,
        reservationId:"44444444-4444-4444-8444-44444444444"+String(bots.indexOf(s)+1),
        remainingTicks:5
      });
    }
    if(req.method==="POST" && path==="/rest/v1/rpc/senfx_paper_worker_tick") {
      const s=bots.find(x=>x.id===body.p_run_id);
      if(!s||!s.open||body.p_version!==s.version||s.desired!=="running") {
        return reply(res,200,{accepted:false,reason:"No authorized open position"});
      }
      if(body.p_tick_epoch<=s.lastEpoch) {
        return reply(res,200,{accepted:true,duplicateTick:true,remainingTicks:s.remaining});
      }
      s.lastEpoch=body.p_tick_epoch;
      s.remaining--;
      if(s.remaining===0) {
        s.open=false;s.settled++;
        return reply(res,200,{accepted:true,settled:true,remainingTicks:0});
      }
      return reply(res,200,{accepted:true,settled:false,remainingTicks:s.remaining});
    }
    requests.push(req.method+" "+path);
    return reply(res,404,{message:"Unexpected endpoint (broker access forbidden)"});
  });
  try {
    server.listen(0,"127.0.0.1");
    await once(server,"listening");
    const address=server.address();
    assert.ok(address&&typeof address==="object");
    child=spawn(process.execPath,[
      "--experimental-strip-types","--import",
      "./tests/fixtures/paper-worker-three-market-feed.mjs",
      "worker/senfx-customer-paper-worker.mjs"
    ],{
      cwd:process.cwd(),
      env:{
        PATH:process.env.PATH||"",HOME:process.env.HOME||"",
        NODE_ENV:"test",SENFX_PAPER_WORKER_ENABLED:"true",
        SUPABASE_URL:"http://127.0.0.1:"+address.port,
        SUPABASE_SERVICE_ROLE_KEY:"LOCAL_TEST_ONLY"
      },
      stdio:["ignore","pipe","pipe"]
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data",chunk=>{output=(output+chunk).slice(-15000);});
    child.stderr.on("data",chunk=>{output=(output+chunk).slice(-15000);});
    const waitFor=async(label,check,ms=18_000)=>{
      const end=Date.now()+ms;
      // Date.now in parent remains REAL wall-clock.
      while(Date.now()<end) {
        if(check())return;
        if(child.exitCode!==null)throw Error("Worker exited while "+label+"\n"+output);
        await new Promise(resolve=>setTimeout(resolve,120));
      }
      throw Error("Timed out: "+label+"\n"+JSON.stringify(bots)+"\n"+output);
    };
    await waitFor("three independent market subscriptions and settlements",
      ()=>bots.every(s=>s.settled>=1),23_000);
    assert.deepEqual(bots.map(s=>s.wrongMarket),[0,0,0]);
    assert.ok(bots.every(s=>s.observed==="running"));

    // Turning off Synthetic Pro must not pause or cancel the other two bots.
    bots[0].desired="stopped";bots[0].version++;
    await waitFor("Synthetic Pro Stop acknowledgment",()=>bots[0].observed==="stopped",5_000);
    assert.ok(bots.slice(1).every(s=>s.observed==="running"));
    const beforeStop=bots[0].reserved;
    await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal(bots[0].reserved,beforeStop,"Stopped bot reserved again");

    // Pause/resume Trend Scout, while Volatility Watch remains running.
    bots[1].desired="paused";bots[1].version++;
    await waitFor("Trend Scout Pause",()=>bots[1].observed==="paused",5_000);
    assert.equal(bots[2].observed,"running");
    const beforePause=bots[1].reserved;
    await new Promise(resolve=>setTimeout(resolve,400));
    assert.equal(bots[1].reserved,beforePause,"Paused bot reserved again");
    bots[1].desired="running";bots[1].version++;
    await waitFor("Trend Scout Resume",()=>bots[1].observed==="running",5_000);

    for(const s of bots.slice(1)){s.desired="stopped";s.version++;}
    await waitFor("all paper runs Stop",()=>bots.every(s=>s.observed==="stopped"),6_000);
    assert.ok(bots.every(s=>!s.open));
    assert.deepEqual(requests,[],"Worker attempted an unfamiliar/broker API");
    assert.doesNotMatch(output,/broker order placed|real-money order/i);
  } finally {
    if(child && child.exitCode===null) {
      child.kill("SIGTERM");
      await Promise.race([once(child,"exit"),
        new Promise(resolve=>setTimeout(resolve,1400))]);
      if(child.exitCode===null)child.kill("SIGKILL");
    }
    server.closeAllConnections?.();
    await new Promise(resolve=>server.close(resolve));
  }
});
