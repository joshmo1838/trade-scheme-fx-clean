import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";

const root=pathResolve(dirname(fileURLToPath(import.meta.url)),"../..");
const f = path => pathToFileURL(pathResolve(root,path)).href;
const rewrites=new Map([
  ["next/server", f("tests/auth-control/mock-next.mjs")],
  ["@/lib/supabase/server", f("tests/auth-control/mock-supabase.mjs")],
  ["@supabase/supabase-js", f("tests/auth-control/mock-admin.mjs")],
  ["@/lib/bots/control-state", f("lib/bots/control-state.ts")],
  ["@/lib/bots/digit-matrix", f("lib/bots/digit-matrix.ts")],
]);
export function resolve(specifier,context,nextResolve) {
  if(rewrites.has(specifier)) return {url:rewrites.get(specifier),shortCircuit:true};
  return nextResolve(specifier,context);
}
