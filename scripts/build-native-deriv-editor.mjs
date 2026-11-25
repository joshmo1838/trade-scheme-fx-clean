import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "vendor/deriv-trading-bot");
const dist = path.join(source, "dist");
const destination = path.join(root, "public/native-deriv");

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: source,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development", HUSKY: "0" },
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

try {
  await readFile(path.join(dist, "index.html"));
} catch {
  run("npm", ["ci", "--include=dev", "--ignore-scripts"]);
  run("npm", ["run", "generate:brand-css"]);
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

const rewriteReferences = async directory => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await rewriteReferences(target);
    else if (/\.(?:html|js|css)$/.test(entry.name)) {
      const input = await readFile(target, "utf8");
      let output = input.replaceAll("/assets/", "/native-deriv/assets/")
        .replaceAll("/static/", "/native-deriv/static/");
      if (target === path.join(destination, "index.html")) {
        output = output.replace("<head>", `<head>${localStorageShim}`)
          .replace("</body>", `${safetyShim}</body>`)
          .replace("<title>Automate Your Trades | Deriv Bot</title>", "<title>Deriv Blockly Editor | Trade Scheme FX</title>");
      }
      if (output !== input) await writeFile(target, output);
    }
  }
};

await rewriteReferences(destination);
console.log("Prepared the pinned Deriv Blockly editor in public/native-deriv with broker networking disabled by frame policy.");
