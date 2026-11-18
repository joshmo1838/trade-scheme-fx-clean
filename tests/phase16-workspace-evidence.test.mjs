import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("shared evidence component exposes explicit uncertainty and simulation states", () => {
  const source = read("app/components/WorkspaceEvidence.tsx");
  for (const state of ["verified", "loading", "stale", "unavailable", "simulation"]) {
    assert.match(source, new RegExp('"' + state + '"'));
  }
  assert.match(source, /Simulation only; not broker execution/);
  assert.match(source, /Last observation is stale; current status is unknown/);
  assert.doesNotMatch(source, /fetch\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(/);
});

test("admin view retains server-side role gate and never converts failed totals to zero", () => {
  const source = read("app/admin/page.tsx");
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /profile\?\.role !== "admin"/);
  assert.match(source, /redirect\("\/dashboard"\)/);
  assert.ok(source.includes('state={error || !countsAvailable ? "unavailable" : "verified"}'));
  assert.ok(source.includes('botCountError ? "Unavailable" : botCount ?? "Unavailable"'));
  assert.ok(source.includes('selectionCountError ? "Unavailable" : selectionCount ?? "Unavailable"'));
});

test("customer workspace separates account connection from paper simulation", () => {
  const source = read("app/dashboard/trading-workspace.tsx");
  assert.match(source, /label="Deriv account connection"/);
  assert.match(source, /label="Paper practice" state="simulation"/);
  assert.match(source, /Connected does not mean a bot is running/);
  assert.match(source, /not broker transactions or verified returns/);
});
