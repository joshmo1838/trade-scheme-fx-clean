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
  assert.match(component, /\/?native_deriv=1#bot_builder/);
  assert.match(component, /senfx_strategy=/);
  assert.match(component, /sandbox="allow-scripts allow-downloads"/);
  assert.doesNotMatch(component, /allow-same-origin/);
  assert.match(registry, /da24196175b5a11088d8b982dd4abe83a13a198c/);
});

test("native editor frame denies broker networking and form submissions", async () => {
  const config = await read("../next.config.ts");
  assert.match(config, /source: "\/"[\s\S]*key: "native_deriv"[\s\S]*destination: "\/native-deriv\/index\.html"/);
  assert.match(config, /source: "\/native-deriv\/:path\*"/);
  assert.match(config, /source: "\/"[\s\S]*key: "native_deriv"[\s\S]*key: "Content-Security-Policy"/);
  assert.match(config, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
  assert.match(config, /connect-src 'none'/);
  assert.match(config, /form-action 'none'/);
  assert.match(config, /frame-src 'none'/);
});

test("native editor build guards Run and rewrites the upstream asset paths", async () => {
  const script = await read("../scripts/build-native-deriv-editor.mjs");
  assert.match(script, /\/assets\/.*native-deriv/s);
  assert.match(script, /\/static\/.*native-deriv/s);
  assert.match(script, /run\.disabled = true/);
  assert.match(script, /Pinned Deriv Bot source is missing/);
});

test("builder is no longer redirected into the empty bot-library page", async () => {
  const proxy = await read("../proxy.ts");
  assert.doesNotMatch(proxy, /redirect\(new URL\("\/bot-library"/);
});
