import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { workspaceCommands, searchWorkspaceCommands } from "../lib/workspace/commands.ts";

test("Quick Switch routes are unique local workspace pages", () => {
  const ids = new Set();
  const paths = new Set();
  for (const command of workspaceCommands) {
    assert.ok(!ids.has(command.id), "Duplicate command ID " + command.id);
    assert.ok(!paths.has(command.href), "Duplicate command destination " + command.href);
    assert.match(command.href, /^\/[a-z0-9/-]+$/);
    assert.ok(existsSync(join(process.cwd(), "app", command.href, "page.tsx")),
      "Missing command destination: " + command.href);
    assert.ok(command.label.trim() && command.description.trim() && command.section.trim());
    ids.add(command.id);
    paths.add(command.href);
  }
});

test("Search accepts useful synonyms and whitespace", () => {
  assert.equal(searchWorkspaceCommands("   ", 3).length, 3);
  assert.equal(searchWorkspaceCommands("candle")[0]?.href, "/charts");
  assert.equal(searchWorkspaceCommands("  BOT BUILDER  ")[0]?.href, "/builder");
  assert.equal(searchWorkspaceCommands("contact")[0]?.href, "/messages");
  assert.equal(searchWorkspaceCommands("risk exposure").some(item => item.href === "/bot-controls"), true);
  assert.equal(searchWorkspaceCommands("paper manual")[0]?.href, "/manual-trader");
  assert.deepEqual(searchWorkspaceCommands("this-tool-does-not-exist"), []);
});

test("Search is capped and deterministic, with no external navigation", () => {
  const first = searchWorkspaceCommands("paper", 4);
  assert.deepEqual(first, searchWorkspaceCommands("paper", 4));
  assert.ok(first.length <= 4);
  assert.deepEqual(searchWorkspaceCommands("paper", 0), []);
  for (const command of searchWorkspaceCommands("", 100)) {
    assert.ok(command.href.startsWith("/") && !command.href.startsWith("//"));
  }
});

test("Paper trading destinations are not misleadingly labeled as live execution", () => {
  for (const route of ["/bot-controls", "/manual-trader", "/history"]) {
    const command = workspaceCommands.find(item => item.href === route);
    assert.ok(command && /paper|simulat|practice/i.test(command.label + " " + command.description));
  }
});
