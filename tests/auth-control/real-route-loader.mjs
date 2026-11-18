import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";

const root=pathResolve(dirname(fileURLToPath(import.meta.url)),"../..");
const local=path=>pathToFileURL(pathResolve(root,path)).href;
const rewrites=new Map([
  ["next/server",local("tests/auth-control/mock-next.mjs")],
  ["@/lib/supabase/server",local("tests/auth-control/real-route-supabase.mjs")],
  ["@/lib/bots/control-state",local("lib/bots/control-state.ts")],
  ["@/lib/bots/digit-matrix",local("lib/bots/digit-matrix.ts")],
]);
export function resolve(specifier,context,nextResolve) {
  if(rewrites.has(specifier)) {
    return {url:rewrites.get(specifier),shortCircuit:true};
  }
  return nextResolve(specifier,context);
}
