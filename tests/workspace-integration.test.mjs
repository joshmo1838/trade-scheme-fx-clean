import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = path => readFileSync(join(root, path), "utf8");

test("Integrated customer dashboard imports all three completed workspace features", () => {
  const dashboard = source("app/dashboard/trading-workspace.tsx");
  assert.match(dashboard, /<WorkspaceQuickSwitch\s*\/>/);
  assert.match(dashboard, /<LiveCandleChart embedded\s*\/>/);
  assert.match(dashboard, /<WorkspaceOperationsStatus derivStatus=\{derivStatus\}/);
  for (const href of ["/charts","/risk-center","/bot-center","/bot-controls"]) {
    assert.ok(dashboard.includes('href="' + href + '"'), "Missing user workflow link to " + href);
    assert.ok(existsSync(join(root,"app",href,"page.tsx")), "Missing customer destination: " + href);
  }
});

test("Risk Command Center is cross-linked from quick search and read-only operations", () => {
  assert.match(source("lib/workspace/commands.ts"), /id: "risk-center".*href: "\/risk-center"/);
  assert.match(source("app/components/WorkspaceOperationsStatus.tsx"), /href="\/risk-center"/);
  assert.match(source("app/bot-settings/page.tsx"), /href="\/risk-center"/);
  assert.match(source("app/components/BulkRiskPlanner.tsx"), /href="\/risk-center"/);
});

test("Live status remains read-only and simulated, not live broker trading", () => {
  const ops = source("app/components/WorkspaceOperationsStatus.tsx");
  assert.match(ops, /method: "GET"/);
  assert.match(ops, /No Deriv Demo or Real contracts are purchased here/);
  assert.match(source("lib/workspace/paper-operations.ts"), /hasCurrentPaperLease/);
  assert.match(source("app/components/PortfolioRiskCenter.tsx"), /Scenario calculator/);
});

test("Integrated source includes route checks and validation for each upgrade", () => {
  const ci = source(".github/workflows/ci.yml");
  for(const name of ["test:workspace","test:operations","test:integration","test:engine"]) {
    assert.ok(ci.includes(name),"Missing CI validation: " + name);
  }
  assert.match(source("app/layout.tsx"), /workspace-operations-deck\.css/);
  assert.match(source("app/components/workspace-operations-deck.css"), /senfxWorkflowSteps/);
  assert.match(source("app/globals.css"), /workspaceQuickSwitchOverlay/);
});
