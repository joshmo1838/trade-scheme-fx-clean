import test from "node:test";
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {modules,moduleTargets,nativeDerivSource,executionPolicy} from "../app/dashboard/v4/registry.ts";

test("all 17 dashboard modules either render a built-in tool or route to an existing implementation",()=>{
  assert.equal(modules.length,17);
  const builtIn=new Set(["Dashboard","Automated","Charts","Bot Builder"]);
  const targets=Object.keys(moduleTargets);
  assert.equal(targets.length,modules.length-builtIn.size);
  for(const module of modules){
    if(builtIn.has(module))continue;
    const target=moduleTargets[module];
    assert.ok(target?.href,`Missing implementation route for ${module}`);
    const route=target.href.split("#")[0];
    assert.ok(existsSync(join(process.cwd(),"app",route,"page.tsx")),`Missing route ${route} for ${module}`);
  }
});

test("the mounted official editor does not claim unvalidated strategy execution",()=>{
  assert.equal(nativeDerivSource.editorReady,true);
  assert.equal(nativeDerivSource.originalStrategiesMapped,false);
  assert.equal(nativeDerivSource.arbitraryXmlExecution,false);
  assert.equal(nativeDerivSource.realMoney,false);
});

test("workspace exposes Demo and paper modes while keeping Real trading disabled",()=>{
  assert.deepEqual(executionPolicy,{realMoney:false,brokerDemo:true,paper:true});
});

test("Copy Trader is explicitly marked as a prototype rather than a live integration",()=>{
  assert.equal(moduleTargets["Copy Trader"].state,"prototype");
});

test("the complete Deriv DBot surface is the default screen and all workspace tools remain reachable",()=>{
  const workspace=readFileSync(join(process.cwd(),"app/dashboard/v4/workspace.tsx"),"utf8");
  assert.match(workspace,/useState<WorkspaceModule>\('Bot Builder'\)/);
  assert.match(workspace,/All 17 tools/);
  assert.match(workspace,/\/native-deriv\/index\.html#bot_builder/);
  assert.match(workspace,/DEMO ONLY/);
  assert.match(workspace,/REAL-MONEY TRADING DISABLED/);
});

test("the workspace account chooser exposes Demo accounts only",()=>{
  const workspace=readFileSync(join(process.cwd(),"app/dashboard/trading-workspace.tsx"),"utf8");
  assert.match(workspace,/filter\(account => account\.account_type === "demo"\)/);
  assert.match(workspace,/account\.account_type !== "demo"/);
});
