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

test("the animated outer workspace stays intact and Deriv DBot opens as its own full-screen view",()=>{
  const workspace=readFileSync(join(process.cwd(),"app/dashboard/v4/workspace.tsx"),"utf8");
  const shellCss=readFileSync(join(process.cwd(),"app/dashboard/v4/workspace.module.css"),"utf8");
  const bot=readFileSync(join(process.cwd(),"app/builder/NativeDerivBuilder.tsx"),"utf8");
  assert.match(workspace,/useState<WorkspaceModule>\('Dashboard'\)/);
  assert.match(workspace,/window\.location\.assign\('\/builder'\)/);
  assert.match(workspace,/styles\.waveTwo/);
  assert.match(shellCss,/\.hero/);
  assert.match(shellCss,/@keyframes drift/);
  assert.match(bot,/position: "fixed", inset: 0/);
  assert.match(bot,/\/native-deriv\/index\.html#bot_builder/);
  assert.match(bot,/sandbox="allow-scripts allow-downloads"/);
});
