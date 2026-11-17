#!/usr/bin/env node
/**
 * Static workspace route check for SENFX.
 * Checks authored local navigation links; never calls trading endpoints.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sources = [
  "app/dashboard/trading-workspace.tsx",
  "app/page.tsx",
  "app/components/FeatureWorkspace.tsx",
  "app/components/CustomerBotCenter.tsx",
  "app/bots/page.tsx",
];
const paths = new Set();
for (const filename of sources) {
  assert.ok(existsSync(join(root, filename)), "Missing route source: " + filename);
  const source = readFileSync(join(root, filename), "utf8");
  // href="..." and href: "..."; ignore hash and query fragments.
  for (const match of source.matchAll(/\bhref\s*(?::|=)\s*["'](\/[^"'#?]*)/g)) {
    paths.add(match[1]);
  }
}
const required = [
  "/", "/dashboard", "/builder", "/ai-scanner", "/bot-center",
  "/bulk-trader", "/charts", "/intelligence", "/copy-trading",
  "/manual-trader", "/digit-tools", "/history", "/login", "/signup",
  "/bots", "/markets", "/strategy-lab", "/messages", "/bot-settings",
  "/api/deriv/connect",
];
for (const route of required) paths.add(route);
let failed = 0;
for (const route of [...paths].sort()) {
  const clean = route.replace(/\/+$/, "") || "/";
  const pathname = clean === "/" ? "" : clean;
  const targets = [
    join(root, "app", pathname, "page.tsx"),
    join(root, "app", pathname, "route.ts"),
    join(root, "app", pathname, "route.tsx"),
  ];
  if (!targets.some(existsSync)) {
    console.error("BROKEN route: " + route);
    failed += 1;
  } else {
    console.log("OK " + route);
  }
}
assert.equal(failed, 0, String(failed) + " workspace link(s) have no route");
console.log("Validated " + paths.size + " workspace routes");
