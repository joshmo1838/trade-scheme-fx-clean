import { register } from "node:module";

if (process.env.SENFX_QA_OFFLINE !== "yes") {
  throw new Error("Offline mock loader is only permitted in the controlled test process.");
}
register(new URL("./mock-supabase-loader.mjs", import.meta.url), import.meta.url);
