import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
  const syncWorkspaceGuidance = () => {
    const header = document.querySelector(".app-header");
    if (!header) return;
    const guestActions = [...header.querySelectorAll(".auth-actions")].find(actions =>
      /\b(?:Log in|Sign up)\b/i.test(actions.textContent || "")
    );
    if (!guestActions) return;
    guestActions.style.setProperty("display", "none", "important");
    guestActions.setAttribute("aria-hidden", "true");
    if (header.querySelector("[data-tsfx-editor-guidance]")) return;
    const note = document.createElement("div");
    note.dataset.tsfxEditorGuidance = "true";
    note.setAttribute("role", "status");
    note.textContent = "Preview only · Demo controls are in Trade Scheme FX";
    note.style.cssText = "margin-left:auto;padding:8px 12px;color:#334155;font:600 12px system-ui,sans-serif;white-space:nowrap";
    header.appendChild(note);
  };
  const apply = () => {
    if (!document.getElementById("tsfx-preview-auth-style")) {
      const style = document.createElement("style");
      style.id = "tsfx-preview-auth-style";
      style.textContent = ".app-header .auth-actions{display:none!important;visibility:hidden!important}";
      (document.head || document.documentElement).appendChild(style);
    }
    syncWorkspaceGuidance();
    const run = document.querySelector("#db-animation__run-button");
    if (run) {
      const runLabel = "Run is disabled until SENFX strategy mapping is validated";
      const runTitle = "Editing preview only. Use the existing SENFX Demo controls after strategy validation.";
      if (!run.disabled) run.disabled = true;
      if (run.getAttribute("aria-label") !== runLabel) run.setAttribute("aria-label", runLabel);
      if (run.title !== runTitle) run.title = runTitle;
      const text = run.querySelector("span");
      if (text && text.textContent !== "Run disabled") text.textContent = "Run disabled";
    }
    document.querySelectorAll('a[href*="oauth"], a[href*="authorize"]').forEach(link => {
      link.addEventListener("click", event => event.preventDefault(), { once: true });
    });
  };
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", apply, { once: true });
})();
</script>`;
const touchNumberFieldsShim = `<script>
(() => {
  const svgNamespace = "http://www.w3.org/2000/svg";
  let scheduled = false;
  const enhanceNumberFields = () => {
    scheduled = false;
    if (!window.matchMedia?.("(pointer: coarse)").matches && window.innerWidth > 768) return;
    const workspace = window.Blockly?.derivWorkspace;
    const svg = workspace?.getParentSvg?.();
    if (!svg) return;

    svg.querySelectorAll("g.blocklyEditableText").forEach(group => {
      const text = group.querySelector("text.blocklyText");
      const label = text?.textContent?.trim();
      if (!text || !/^-?\\d+(?:\\.\\d+)?$/.test(label || "") || group.querySelector(".blocklyDropdownRect")) return;
      try {
        const box = text.getBBox();
        const matrix = group.getScreenCTM();
        if (!matrix) return;
        const scaleX = Math.hypot(matrix.a, matrix.b) || 1;
        const scaleY = Math.hypot(matrix.c, matrix.d) || 1;
        const width = Math.max(box.width, 44 / scaleX);
        const height = Math.max(box.height, 44 / scaleY);
        let hitArea = group.querySelector("rect[data-tsfx-touch-hit]");
        if (!hitArea) {
          hitArea = document.createElementNS(svgNamespace, "rect");
          hitArea.dataset.tsfxTouchHit = "true";
          hitArea.setAttribute("fill", "transparent");
          hitArea.setAttribute("pointer-events", "all");
          group.insertBefore(hitArea, group.firstChild);
        }
        const bounds = {
          x: String(box.x - (width - box.width) / 2),
          y: String(box.y - (height - box.height) / 2),
          width: String(width),
          height: String(height),
        };
        for (const [name, value] of Object.entries(bounds)) {
          if (hitArea.getAttribute(name) !== value) hitArea.setAttribute(name, value);
        }
        if (group.style.touchAction !== "manipulation") group.style.touchAction = "manipulation";
      } catch {
        // Detached SVG fields can briefly reject getBBox while Blockly rerenders.
      }
    });
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhanceNumberFields);
  };
  const observe = () => {
    const workspace = window.Blockly?.derivWorkspace;
    const svg = workspace?.getParentSvg?.();
    if (!svg) return false;
    new MutationObserver(schedule).observe(svg, { childList: true, subtree: true });
    workspace.addChangeListener?.(schedule);
    schedule();
    return true;
  };
  let attempts = 0;
  const mount = () => {
    if (observe() || ++attempts >= 120) return;
    window.setTimeout(mount, 250);
  };
  mount();
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
      if (target === path.join(destination, "index.html")) {
        output = output.replace(/<script defer src="([^"]+)"><\/script>/g, '<script defer crossorigin="anonymous" src="$1"></script>');
      }
      // The root-mounted editor still emits lazy chunk URLs relative to `/`.
      // Point webpack's runtime base back at the vendored bundle so its async
      // CSS and JS chunks resolve under /native-deriv/ when the app is served
      // through the root route rewrite.
      if (target.includes(`${path.sep}static${path.sep}js${path.sep}`)) {
        output = output
          .replace('__webpack_require__.p = "/";', '__webpack_require__.p = "/native-deriv/";')
          .replace(/([A-Za-z_$][\w$]*)\.p="\/"/g, '$1.p="/native-deriv/"');

        // The upstream brand config contains HTTPS API base URLs, but this
        // editor passes the public endpoint directly to `new WebSocket`.
        // Use the matching secure WebSocket scheme and recognize Trade Scheme's
        // actual production hostname so production selects Deriv's production feed.
        output = output
          .replaceAll('bot.yourbrand.com', 'www.tradesche.com')
          .replace(
            'l=()=>{let e=window.location.hostname;return Object.values(a).includes(e)}',
            'l=()=>{let e=window.location.hostname;return Object.values(a).includes(e)||e==="trade-scheme-fx-clean.vercel.app"}',
          )
          .replace(
            /(STAGING:`\$\{)([^}]+)(\}options\/ws\/public`,PRODUCTION:`\$\{)([^}]+)(\}options\/ws\/public`)/,
            (_, stagingPrefix, stagingBase, productionPrefix, productionBase, suffix) =>
              `${stagingPrefix}${stagingBase}.replace(/^https:/,"wss:")${productionPrefix}${productionBase}.replace(/^https:/,"wss:")${suffix}`,
          );
      }
      if (target === path.join(destination, "index.html")) {
        output = output.replace("<head>", `<head>${localStorageShim}`)
          .replace("</body>", `${safetyShim}${touchNumberFieldsShim}${strategyBootstrap}</body>`)
          .replace("<title>Automate Your Trades | Deriv Bot</title>", "<title>Deriv Blockly Editor | Trade Scheme FX</title>");
      }
      if (output !== input) await writeFile(target, output);
    }
  }
};

await rewriteReferences(destination);

// The vendor's index filename is hashed before the Trade Scheme rewrites are
// applied. If we keep that upstream filename, a CDN can serve the earlier,
// unmodified bytes under the same immutable asset URL. Give the final emitted
// entry bundle a digest based on its actual rewritten contents and update the
// HTML entrypoint to force clients and edge caches onto the corrected bundle.
const htmlPath = path.join(destination, "index.html");
let html = await readFile(htmlPath, "utf8");
const entryMatch = html.match(/src="([^\"]*\/static\/js\/(index(?:\.[\w-]+)?\.js))"/);
if (!entryMatch) throw new Error("Deriv editor entry script is missing from index.html");
const oldEntryPath = path.join(destination, "static/js", entryMatch[2]);
const entryContents = await readFile(oldEntryPath);
const digest = createHash("sha256").update(entryContents).digest("hex").slice(0, 12);
const newEntryName = `index.${digest}.js`;
const newEntryPath = path.join(path.dirname(oldEntryPath), newEntryName);
await rename(oldEntryPath, newEntryPath);
html = html.replaceAll(entryMatch[2], newEntryName);
await writeFile(htmlPath, html);
console.log("Prepared the pinned Deriv Blockly editor in public/native-deriv with broker networking disabled by frame policy.");
