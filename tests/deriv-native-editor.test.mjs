import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("builder route mounts the pinned official Blockly bundle in a sandbox", async () => {
  const [page, component, registry] = await Promise.all([
    read("../app/builder/page.tsx"),
    read("../app/builder/NativeDerivBuilder.tsx"),
    read("../app/dashboard/v4/registry.ts"),
  ]);
  assert.match(page, /NativeDerivBuilder/);
  assert.match(component, /trade-scheme-fx-clean\.vercel\.app/);
  assert.match(component, /native_deriv=1#bot_builder/);
  assert.match(component, /senfx_strategy=/);
  assert.match(component, /sandbox="allow-scripts allow-downloads allow-same-origin"/);
  assert.match(registry, /da24196175b5a11088d8b982dd4abe83a13a198c/);
});

test("selected bot workspace uses Blockly Run as its Demo control", async () => {
  const builder=await read("../app/builder/NativeDerivBuilder.tsx");
  assert.match(builder, /inset:'44px 0 0'/);
  assert.match(builder, /height:'calc\(100dvh - 44px\)'/);
  assert.match(builder, /event\.source!==frame\.current\?\.contentWindow/);
  assert.match(builder, /tradePlan:\{\.\.\.d\.plan,strategyId:strategy\?\.id\}/);
  assert.match(builder, /type:'RUN_STATE'/);
  assert.match(builder, /confirmVirtualDemoAutomation:true/);
  assert.match(builder, /canRun:r\.ok&&!!strategy\?\.id/);
  assert.match(builder, /Another bot is already running/);
  assert.match(builder, /trustedEditorOrigins\.has\(event\.origin\)/);
  assert.match(builder, /postMessage\(\{source:'TSFX_TRADE_SCHEME_PARENT'/);
  assert.match(builder, /Submitting Blockly Demo run/);
  const controlRoute = await read("../app/api/deriv/demo/v4/bots/control/route.ts");
  assert.match(controlRoute, /\[quantum-demo-control\] command received/);
  assert.match(controlRoute, /\[quantum-demo-control\] run accepted/);
  assert.match(controlRoute, /function rejectControl\(code:string,status=400\)/);
});

test("premium workspace sends bot starts through its selected Blockly workspace", async () => {
  const premium = await read("../app/dashboard/v4/PremiumBotWorkspace.tsx");
  assert.match(premium, /BLOCKLY CONTROL/);
  assert.match(premium, /builder\?strategyId=/);
  assert.doesNotMatch(premium, /QuantumDemoRunControl/);
  assert.match(premium, /A Demo order is sent only when the strategy and safety checks allow one/);
});

test("native editor frame denies broker networking and form submissions", async () => {
  const config = await read("../next.config.ts");
  assert.match(config, /source: "\/"[\s\S]*key: "native_deriv"[\s\S]*destination: "\/native-deriv\/index\.html"/);
  assert.match(config, /source: "\/native-deriv\/:path\*"/);
  assert.match(config, /source: "\/"[\s\S]*key: "native_deriv"[\s\S]*key: "Content-Security-Policy"/);
  assert.match(config, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
  assert.match(config, /connect-src wss:\/\/api\.derivws\.com\/trading\/v1\/options\/ws\/public wss:\/\/staging-api\.derivws\.com\/trading\/v1\/options\/ws\/public/);
  assert.match(config, /fonts\.googleapis\.com/);
  assert.match(config, /fonts\.gstatic\.com/);
  assert.match(config, /https:\/\/\*\.vercel\.app/);
  assert.match(config, /https:\/\/www\.tradesche\.com/);
  assert.match(config, /form-action 'none'/);
  assert.match(config, /frame-src 'none'/);
});

test("native editor build guards Run and rewrites the upstream asset paths", async () => {
  const script = await read("../scripts/build-native-deriv-editor.mjs");
  assert.match(script, /\/assets\/.*native-deriv/s);
  assert.match(script, /\/static\/.*native-deriv/s);
  assert.match(script, /__webpack_require__\.p = .*native-deriv/);
  assert.match(script, /reactRefreshEntry/);
  assert.match(script, /NODE_ENV: "production"/);
  assert.match(script, /crossorigin="anonymous"/);
  assert.match(script, /bot\.yourbrand\.com.*www\.tradesche\.com/);
  assert.match(script, /trade-scheme-fx-clean\.vercel\.app/);
  assert.match(script, /replace\(\/\^https:/);
  assert.match(script, /wss:/);
  assert.match(script, /createHash\("sha256"\)/);
  assert.match(script, /Deriv editor entry script is missing/);
  assert.match(script, /html\.replaceAll\(entryMatch\[2\], newEntryName\)/);
  assert.match(script, /const canUseRunButton = Boolean\(strategyId\) && \(runState\.running \|\| \(runState\.canRun && supportedPlan\)\)/);
  assert.match(script, /Choose a bot/);
  assert.match(script, /SELECT_CURRENT_BOT_FIRST/);
  assert.match(script, /document\.addEventListener\("pointerup", handleRun, true\)/);
  assert.match(script, /document\.addEventListener\("touchend", handleRun, true\)/);
  assert.match(script, /document\.addEventListener\("click", handleRun, true\)/);
  assert.match(script, /target\?\.closest\?\.\("#db-animation__run-button"\)/);
  assert.match(script, /now - lastRunActivationAt < 700/);
  assert.match(script, /if \(!run\) return;\s+const now = Date\.now\(\);/);
  assert.match(script, /run\.style\.setProperty\("touch-action", "manipulation", "important"\)/);
  assert.match(script, /text\.textContent !== label/);
  assert.match(script, /postToParent\("RUN", \{ plan \}\)/);
  assert.match(script, /Pinned Deriv Bot source is missing/);
  assert.match(script, /data-tsfx-editor-guidance/);
  assert.match(script, /dismissFirstRunBuilderGuide/);
  assert.match(script, /bot builder guide/i);
  assert.match(script, /if \(skip && !skip\.dataset\.tsfxDismissRequested\)/);
  assert.match(script, /skip\.click\(\)/);
  assert.match(script, /\.app-header \.auth-actions\{display:none!important;visibility:hidden!important\}/);
  assert.match(script, /Virtual Demo only.*Run uses these Blockly settings/);
  assert.match(script, /touchNumberFieldsShim/);
  assert.match(script, /pointer: coarse/);
  assert.match(script, /rect\[data-tsfx-touch-hit\]/);
  assert.match(script, /44 \/ scaleX/);
  assert.match(script, /44 \/ scaleY/);
  assert.match(script, /touchAction = "manipulation"/);
  assert.match(script, /attachTouchEditorFallback/);
  assert.match(script, /addEventListener\("pointerup", activateNumber, true\)/);
  assert.match(script, /addEventListener\("touchend", activateNumber, true\)/);
  assert.match(script, /openNumberPicker\(field\)/);
  assert.match(script, /value <= 1000/);
  assert.match(script, /Select a value from 0 to 1000/);
  assert.match(script, /field\.setValue\(select\.value\)/);
  assert.match(script, /containsFileText/);
  assert.match(script, /patchVendorStartup/);
  assert.match(script, /TSFX_BLOCKLY_STARTUP_FALLBACK_V1/);
  assert.match(script, /}, 8000\)/);
  assert.match(script, /keeping Blockly available/);
  assert.match(script, /finally \{[\s\S]*blockly_store\.setLoading\(false\)/);
});

test("builder is no longer redirected into the empty bot-library page", async () => {
  const proxy = await read("../proxy.ts");
  assert.doesNotMatch(proxy, /redirect\(new URL\("\/bot-library"/);
});

test("verified Demo currency is reflected in the Blockly stake block", async () => {
  const [route, builder, script] = await Promise.all([
    read("../app/api/deriv/demo/v4/bots/control/route.ts"),
    read("../app/builder/NativeDerivBuilder.tsx"),
    read("../scripts/build-native-deriv-editor.mjs"),
  ]);
  assert.match(route, /includeDemoCurrency/);
  assert.match(route, /demoCurrency/);
  assert.match(builder, /includeDemoCurrency=1/);
  assert.match(builder, /currency:demoCurrency/);
  assert.match(script, /syncVerifiedCurrency/);
  assert.match(script, /field\.setValue\(runState\.currency\)/);
});

test("selected bot restores a supported Multiplier Blockly plan before enabling Run", async () => {
  const [bootstrap, builder, editor] = await Promise.all([
    read("../lib/quantum/strategy-builder-reference.mjs"),
    read("../app/builder/NativeDerivBuilder.tsx"),
    read("../scripts/build-native-deriv-editor.mjs"),
  ]);
  assert.match(bootstrap, /TRADETYPECAT_LIST/);
  assert.match(bootstrap, /trade_definition_multiplier/);
  assert.match(bootstrap, /preservedStake/);
  assert.match(bootstrap, /strategy\.id/);
  assert.match(builder, /d\.plan\?\.strategyId!==strategy\.id/);
  assert.match(editor, /isSupportedPlan/);
  assert.match(editor, /Preparing Blocks/);
});

test("Blockly Run UI calculates supported plan before using it", async () => {
  const script = await read("../scripts/build-native-deriv-editor.mjs");
  const applyStart = script.indexOf("const apply = () => {");
  const runStart = script.indexOf('const run = document.querySelector("#db-animation__run-button")', applyStart);
  const runEnd = script.indexOf("document.querySelectorAll", runStart);
  assert.ok(applyStart >= 0 && runStart > applyStart && runEnd > runStart);
  const runUi = script.slice(runStart, runEnd);
  const supportedPlanAt = runUi.indexOf("const supportedPlan = isSupportedPlan();");
  const runTitleAt = runUi.indexOf("const runTitle = supportedPlan ?");
  assert.ok(supportedPlanAt >= 0 && runTitleAt > supportedPlanAt);
});

test("Blockly trade option currency is synchronized across every option block", async () => {
  const script = await read("../scripts/build-native-deriv-editor.mjs");
  assert.match(script, /optionBlocks\s*=\s*workspace\?\.getAllBlocks\?\.\(false\)\?\.filter\(block => block\.type === "trade_definition_multiplier"\)/);
  assert.match(script, /if \(field && field\.getValue\?\.\(\) !== runState\.currency\) field\.setValue\(runState\.currency\)/);
});

test("Blockly Run stays disabled until a verified Demo currency is available", async () => {
  const component = await read("../app/builder/NativeDerivBuilder.tsx");
  assert.match(component, /!!verifiedCurrency&&d\.controlsEnabled/);
  assert.match(component, /serverCurrency\|\|demoCurrency/);
  assert.match(component, /if\(serverCurrency\)setDemoCurrency\(serverCurrency\)/);
  assert.match(component, /Connect a verified Deriv Demo account to sync its currency/);
});

test("Deriv Demo context repairs account type from the verified Deriv account list", async () => {
  const source = await read("../lib/deriv/demo-server.ts");
  assert.match(source, /if \(!connection\.active_account_id\)/);
  assert.match(source, /\.eq\("active_account_id", connection\.active_account_id\)/);
  assert.match(source, /if \(account\.account_type !== "demo"\)/);
  assert.match(source, /DEMO_ACCOUNT_SELECTION_SYNC_FAILED/);
});

test("Deriv reconnect saves only an active verified Demo account selection", async () => {
  const callback = await read("../app/api/deriv/callback/route.ts");
  assert.match(callback, /trading\/v1\/options\/accounts/);
  assert.match(callback, /account\.account_type === "demo"/);
  assert.match(callback, /active_account_id: selectedDemo\?\.account_id/);
  assert.match(callback, /active_account_type: selectedDemo \? "demo" : null/);
});
