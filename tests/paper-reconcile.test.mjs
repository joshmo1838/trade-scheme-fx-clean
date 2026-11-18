import test from "node:test";
import assert from "node:assert/strict";
import { reconcilePaperPosition } from "../lib/bots/paper-reconcile.ts";

const open = [{id:"paper-pos-1", status:"open"}];

test("a lease-reclaimed position cancels stale local open state", () => {
  assert.deepEqual(reconcilePaperPosition(true,[]), {
    safe:true,openPosition:false,changed:true,
  });
});
test("a lost reservation response recovers an open database entry", () => {
  assert.deepEqual(reconcilePaperPosition(false,open), {
    safe:true,openPosition:true,changed:true,
  });
});
test("matching database and memory states remain stable", () => {
  assert.deepEqual(reconcilePaperPosition(false,[]), {
    safe:true,openPosition:false,changed:false,
  });
  assert.deepEqual(reconcilePaperPosition(true,open), {
    safe:true,openPosition:true,changed:false,
  });
});
test("inconsistent or unexpected ledger state fails closed", () => {
  for(const rows of [[...open,...open],[{id:"paper-pos-1",status:"settled"}],
                      [{id:"",status:"open"}],[null]]) {
    const r=reconcilePaperPosition(false,rows);
    assert.equal(r.safe,false);
    assert.equal(r.openPosition,true);
  }
});
