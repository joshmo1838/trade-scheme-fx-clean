import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {STRATEGIES} from "../lib/quantum/strategy-catalog.mjs";
import {createStrategyBootstrap} from "../lib/quantum/strategy-builder-reference.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "vendor/deriv-trading-bot");
const dist = path.join(source, "dist");
const destination = path.join(root, "public/native-deriv");

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: source,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production", HUSKY: "0" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
};

try {
  await readFile(path.join(source, "package-lock.json"));
  await readFile(path.join(source, ".git"));
} catch {
  throw new Error("Pinned Deriv Bot source is missing. Initialize vendor/deriv-trading-bot before building.");
}

let rebuild = false;
try {
  await readFile(path.join(dist, "index.html"));
  const jsDirectory = path.join(dist, "static/js");
  const entryName = (await readdir(jsDirectory)).find(name => /^index(?:\.[\w-]+)?\.js$/.test(name));
  if (!entryName) throw new Error("Deriv entry bundle is missing");
  const entry = await readFile(path.join(jsDirectory, entryName), "utf8");
  // Never ship the vendor's development bundle: it injects React Refresh and
  // HMR clients that cannot run in the isolated production iframe.
  rebuild = entry.includes("reactRefreshEntry") || entry.includes("module.hot");
} catch {
  rebuild = true;
}

if (rebuild) {
  run("npm", ["ci", "--include=dev", "--ignore-scripts"]);
  run("npm", ["run", "generate:brand-css"]);
  await rm(dist, { recursive: true, force: true });
  run("npm", ["run", "build"]);
}

await rm(destination, { recursive: true, force: true });
await mkdir(path.dirname(destination), { recursive: true });
await cp(dist, destination, { recursive: true });

const localStorageShim = `<script>
(() => {
  const memoryStorage = () => {
    const values = new Map();
    return {
      get length() { return values.size; },
      key(index) { return [...values.keys()][index] ?? null; },
      getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
      setItem(key, value) { values.set(String(key), String(value)); },
      removeItem(key) { values.delete(String(key)); },
      clear() { values.clear(); }
    };
  };
  for (const name of ["localStorage", "sessionStorage"]) {
    try { window[name].setItem("__tsfx_check", "1"); window[name].removeItem("__tsfx_check"); }
    catch { Object.defineProperty(window, name, { configurable: false, value: memoryStorage() }); }
  }
})();
</script>`;

const safetyShim = `<script>
(() => {
  const debug = new URLSearchParams(window.location.search).has("native_debug");
  let diagnostic;
  const report = message => {
    if (!debug) return;
    if (!diagnostic) {
      diagnostic = document.createElement("pre");
      diagnostic.style.cssText = "position:fixed;z-index:2147483647;left:8px;right:8px;bottom:8px;max-height:40vh;overflow:auto;margin:0;padding:12px;background:#450a0a;color:#fff;font:12px/1.4 monospace;white-space:pre-wrap";
      document.body.appendChild(diagnostic);
    }
    diagnostic.textContent = String(message);
  };
  if (debug) {
    window.addEventListener("error", event => {
      const target = event.target;
      report("Runtime error: " + (event.message || event.error?.message || event.type) + "\\n" + (event.filename || target?.src || target?.href || target?.tagName || "unknown source") + ":" + event.lineno + ":" + event.colno);
    }, true);
    window.addEventListener("unhandledrejection", event => report("Unhandled rejection: " + (event.reason?.stack || event.reason)));
    document.addEventListener("securitypolicyviolation", event => report("CSP blocked " + event.violatedDirective + ": " + event.blockedURI + "\\n" + event.originalPolicy));
    setTimeout(() => {
      if (!document.querySelector("#root")?.childElementCount) report("No React UI mounted in #root after 8 seconds. Check browser errors and asset/CSP failures.");
    }, 8000);
  }
  const apply = () => {
    const run = document.querySelector("#db-animation__run-button");
    if (run) {
      run.disabled = true;
      run.setAttribute("aria-label", "Run is disabled until SENFX strategy mapping is validated");
      run.title = "Editing preview only. Use the existing SENFX Demo controls after strategy validation.";
      const text = run.querySelector("span");
      if (text) text.textContent = "Run disabled";
    }
    document.querySelectorAll('a[href*="oauth"], a[href*="authorize"]').forEach(link => {
      link.addEventListener("click", event => event.preventDefault(), { once: true });
    });
  };
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", apply, { once: true });
})();
</script>`;
const strategyBootstrap = createStrategyBootstrap(STRATEGIES);

const rewriteReferences = async directory => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await rewriteReferences(target);
    else if (/\.(?:html|js|css)$/.test(entry.name)) {
      const input = await readFile(target, "utf8");
      let output = input.replaceAll("/assets/", "/native-deriv/assets/")
        .replaceAll("/static/", "/native-deriv/static/");
      // The root-mounted editor still emits lazy chunk URLs relative to `/`.
      // Point webpack's runtime base back at the vendored bundle so its async
      // CSS and JS chunks resolve under /native-deriv/ when the app is served
      // through the root route rewrite.
      if (target.includes(`${path.sep}static${path.sep}js${path.sep}`)) {
        output = output
          .replace('__webpack_require__.p = "/";', '__webpack_require__.p = "/native-deriv/";')
          .replace(/([A-Za-z_$][\w$]*)\.p="\/"/g, '$1.p="/native-deriv/"');
      }
      if (target === path.join(destination, "index.html")) {
        output = output.replace("<head>", `<head>${localStorageShim}`)
          .replace("</body>", `${safetyShim}${strategyBootstrap}</body>`)
          .replace("<title>Automate Your Trades | Deriv Bot</title>", "<title>Deriv Blockly Editor | Trade Scheme FX</title>");
      }
      if (output !== input) await writeFile(target, output);
    }
  }
};

await rewriteReferences(destination);
console.log("Prepared the pinned Deriv Blockly editor in public/native-deriv with broker networking disabled by frame policy.");
