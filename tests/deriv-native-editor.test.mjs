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
  assert.match(builder, /tradePlan:d\.plan/);
  assert.match(builder, /type:'RUN_STATE'/);
  assert.match(builder, /confirmVirtualDemoAutomation:true/);
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
  assert.match(script, /run\.disabled = !\(runState\.running \|\| runState\.canRun\)/);
  assert.match(script, /text\.textContent !== label/);
  assert.match(script, /postToParent\("RUN", \{ plan \}\)/);
  assert.match(script, /Pinned Deriv Bot source is missing/);
  assert.match(script, /data-tsfx-editor-guidance/);
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
});

test("builder is no longer redirected into the empty bot-library page", async () => {
  const proxy = await read("../proxy.ts");
  assert.doesNotMatch(proxy, /redirect\(new URL\("\/bot-library"/);
});
