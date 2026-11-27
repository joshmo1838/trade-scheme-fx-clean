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

const containsFileText = async (directory, pattern) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (await containsFileText(target, pattern)) return true;
    } else if (entry.isFile() && /\.js$/.test(entry.name)) {
      if ((await readFile(target, "utf8")).includes(pattern)) return true;
    }
  }
  return false;
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
  const hasStartupFallback = entry.includes("TSFX_BLOCKLY_STARTUP_FALLBACK_V1") || await containsFileText(jsDirectory, "TSFX_BLOCKLY_STARTUP_FALLBACK_V1");
  // Never ship the vendor's development bundle: it injects React Refresh and
  // HMR clients that cannot run in the isolated production iframe.
  rebuild = entry.includes("reactRefreshEntry") || entry.includes("module.hot") || !hasStartupFallback;
} catch {
  rebuild = true;
}

const patchVendorStartup = async () => {
  const appContentPath = path.join(source, "src/app/app-content.jsx");
  let appContent = await readFile(appContentPath, "utf8");
  if (!appContent.includes("TSFX_BLOCKLY_STARTUP_FALLBACK_V1")) {
    const stateAnchor = "    const [is_loading, setIsLoading] = React.useState(true);";
    if (!appContent.includes(stateAnchor)) throw new Error("Deriv app startup state changed; update the Blockly startup patch.");
    appContent = appContent.replace(stateAnchor, `${stateAnchor}\n    const has_initialized_app = React.useRef(false);`);

    const mountAnchor = "    const changeActiveSymbolLoadingState = () => {\n        init();";
    const mountReplacement = `    const initializeStoresOnce = () => {
        if (has_initialized_app.current) return;
        has_initialized_app.current = true;
        init();
    };

    // TSFX_BLOCKLY_STARTUP_FALLBACK_V1: mount the local Blockly editor even if
    // the isolated Deriv socket cannot connect. Demo runs remain server gated.
    React.useEffect(() => {
        const fallback = window.setTimeout(() => {
            initializeStoresOnce();
            setIsLoading(false);
        }, 8000);
        return () => window.clearTimeout(fallback);
    }, []);

    const changeActiveSymbolLoadingState = () => {
        initializeStoresOnce();`;
    if (!appContent.includes(mountAnchor)) throw new Error("Deriv app initialization anchor changed; update the Blockly startup patch.");
    appContent = appContent.replace(mountAnchor, mountReplacement);

    const socketAnchor = "        if (is_api_initialized) {\n            init();";
    if (!appContent.includes(socketAnchor)) throw new Error("Deriv socket initialization anchor changed; update the Blockly startup patch.");
    appContent = appContent.replace(socketAnchor, "        if (is_api_initialized) {\n            initializeStoresOnce();");

    const symbolsAnchor = `            active_symbols.retrieveActiveSymbols(true).then(() => {
                setIsLoading(false);
            });`;
    const symbolsReplacement = `            active_symbols.retrieveActiveSymbols(true)
                .catch(error => console.warn("Deriv active-symbol refresh failed; keeping Blockly available.", error))
                .finally(() => setIsLoading(false));`;
    if (!appContent.includes(symbolsAnchor)) throw new Error("Deriv active-symbol initialization anchor changed; update the Blockly startup patch.");
    appContent = appContent.replace(symbolsAnchor, symbolsReplacement);
  }
  const fallbackLog = 'console.info("TSFX_BLOCKLY_STARTUP_FALLBACK_V1: mounting Blockly without the isolated Deriv feed.");';
  if (!appContent.includes(fallbackLog)) {
    const fallbackAnchor = "        const fallback = window.setTimeout(() => {\n            initializeStoresOnce();";
    if (!appContent.includes(fallbackAnchor)) throw new Error("Deriv Blockly startup fallback anchor changed; update the startup patch.");
    appContent = appContent.replace(fallbackAnchor, `        const fallback = window.setTimeout(() => {\n            ${fallbackLog}\n            initializeStoresOnce();`);
  }
  await writeFile(appContentPath, appContent);

  const appStorePath = path.join(source, "src/stores/app-store.ts");
  let appStore = await readFile(appStorePath, "utf8");
  const workspaceAnchor = `        blockly_store.setLoading(true);
        await DBot.initWorkspace('/', this.dbot_store, this.api_helpers_store, ui.is_mobile, false);

        blockly_store.setContainerSize();
        blockly_store.setLoading(false);`;
  const workspaceReplacement = `        blockly_store.setLoading(true);
        try {
            await DBot.initWorkspace('/', this.dbot_store, this.api_helpers_store, ui.is_mobile, false);
            blockly_store.setContainerSize();
        } catch (error) {
            console.error('Blockly workspace initialization failed:', error);
        } finally {
            blockly_store.setLoading(false);
        }`;
  if (!appStore.includes(workspaceReplacement)) {
    if (!appStore.includes(workspaceAnchor)) throw new Error("Deriv Blockly workspace initialization anchor changed; update the startup recovery patch.");
    appStore = appStore.replace(workspaceAnchor, workspaceReplacement);
    await writeFile(appStorePath, appStore);
  }
};

if (rebuild) {
  await patchVendorStartup();
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
  const strategyId = new URLSearchParams(window.location.search).get("senfx_strategy");
  const updateMobileViewport = () => {
    const height = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty("--tsfx-mobile-vh", height + "px");
    requestAnimationFrame(() => {
      const workspace = window.Blockly?.derivWorkspace;
      if (workspace) window.Blockly?.svgResize?.(workspace);
    });
  };
  updateMobileViewport();
  window.addEventListener("resize", updateMobileViewport, { passive: true });
  window.visualViewport?.addEventListener("resize", updateMobileViewport, { passive: true });
  window.visualViewport?.addEventListener("scroll", updateMobileViewport, { passive: true });
  if (!document.getElementById("tsfx-mobile-blockly-layout")) {
    const style = document.createElement("style");
    style.id = "tsfx-mobile-blockly-layout";
    style.textContent = "@media(max-width:768px){.bot{--bot-content-height:max(360px,calc(var(--tsfx-mobile-vh,100dvh) - 140px));--tab-content-height-mobile:max(400px,calc(var(--tsfx-mobile-vh,100dvh) - 126px))}.main{height:calc(var(--tsfx-mobile-vh,100dvh) - 60px)}.bot-builder{height:max(400px,calc(var(--tsfx-mobile-vh,100dvh) - 126px))}#scratch_div{height:max(360px,calc(var(--tsfx-mobile-vh,100dvh) - 140px))!important}.bot-builder .injectionDiv{height:max(360px,calc(var(--tsfx-mobile-vh,100dvh) - 164px))!important}}";
    (document.head || document.documentElement).appendChild(style);
  }
  let runState = { canRun: false, running: false, currency: null, message: "Checking the Trade Scheme FX Demo connection…" };
  const postToParent = (type, payload = {}) => {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage({ source: "TSFX_BLOCKLY", type, ...payload }, "*");
  };
  const numberInput = (block, name) => {
    const target = block?.getInputTargetBlock?.(name);
    if (!target || !["math_number", "math_number_positive"].includes(target.type)) return null;
    const value = Number(target.getFieldValue("NUM"));
    return Number.isFinite(value) ? value : null;
  };
  const currentPlan = () => {
    const workspace = window.Blockly?.derivWorkspace;
    const blocks = workspace?.getAllBlocks?.(false) || [];
    const rule = blocks.find(block => block.type === "tsfx_strategy_rule");
    const market = blocks.find(block => block.type === "trade_definition_market");
    const tradeType = blocks.find(block => block.type === "trade_definition_tradetype");
    const contractType = blocks.find(block => block.type === "trade_definition_contracttype");
    const options = blocks.find(block => block.type === "trade_definition_multiplier");
    const stopLoss = options?.getChildByType?.("multiplier_stop_loss");
    const takeProfit = options?.getChildByType?.("multiplier_take_profit");
    const currency = options?.getFieldValue?.("CURRENCY_LIST");
    return {
      strategyId: rule?.getFieldValue?.("STRATEGY"),
      marketCategory: market?.getFieldValue?.("MARKET_LIST"),
      marketSymbol: market?.getFieldValue?.("SYMBOL_LIST"),
      tradeTypeCategory: tradeType?.getFieldValue?.("TRADETYPECAT_LIST"),
      tradeType: tradeType?.getFieldValue?.("TRADETYPE_LIST"),
      contractType: contractType?.getFieldValue?.("TYPE_LIST"),
      currency,
      multiplier: Number(options?.getFieldValue?.("MULTIPLIERTYPE_LIST")),
      stake: numberInput(options, "AMOUNT"),
      perTradeStopLoss: numberInput(stopLoss, "AMOUNT"),
      perTradeTakeProfit: numberInput(takeProfit, "AMOUNT"),
      sessionStopLoss: numberInput(stopLoss, "AMOUNT"),
      sessionTakeProfit: numberInput(takeProfit, "AMOUNT"),
    };
  };
  const isSupportedPlan = () => {
    const plan = currentPlan();
    return plan.strategyId === strategyId &&
      ["multiplier", "multipliers"].includes(String(plan.tradeTypeCategory || "").toLowerCase()) &&
      ["multiplier", "multipliers"].includes(String(plan.tradeType || "").toLowerCase()) &&
      String(plan.contractType || "").toLowerCase() === "both" &&
      Boolean(runState.currency) && plan.currency === runState.currency &&
      ["USD", "AUD"].includes(String(plan.currency || "")) &&
      Number.isSafeInteger(plan.multiplier) && plan.multiplier > 0 &&
      Number.isFinite(plan.stake) && plan.stake > 0 &&
      Number.isFinite(plan.sessionStopLoss) && plan.sessionStopLoss >= plan.stake &&
      Number.isFinite(plan.sessionTakeProfit) && plan.sessionTakeProfit > 0;
  };
  let lastRunActivationAt = 0;
  const handleRun = event => {
    const touchActivation = event.type === "touchend" || (event.type === "pointerup" && event.pointerType === "touch");
    if (!touchActivation && event.type !== "click") return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const run = target?.closest?.("#db-animation__run-button");
    if (!run) return;
    const now = Date.now();
    if (now - lastRunActivationAt < 700) {
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    lastRunActivationAt = now;
    if (!strategyId || !runState.canRun && !runState.running) {
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
      postToParent("PLAN_ERROR", { code: !strategyId ? "SELECT_CURRENT_BOT_FIRST" : runState.message || "DEMO_RUN_NOT_READY" });
      return;
    }
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    if (runState.running) {
      postToParent("STOP");
      return;
    }
    if (!isSupportedPlan()) {
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
      const pendingPlan = currentPlan();
      const code = runState.currency && pendingPlan.currency !== runState.currency
        ? "BLOCKLY_CURRENCY_SYNC_REQUIRED"
        : "BLOCKLY_SETTINGS_NOT_READY";
      postToParent("PLAN_ERROR", { code });
      return;
    }
    const plan = currentPlan();
    if (!runState.currency || plan.currency !== runState.currency) {
      postToParent("PLAN_ERROR", { code: "BLOCKLY_CURRENCY_SYNC_REQUIRED" });
      return;
    }
    if (!["USD", "AUD"].includes(plan.currency)) {
      postToParent("PLAN_ERROR", { code: "UNSUPPORTED_BLOCKLY_CURRENCY" });
      return;
    }
    postToParent("RUN", { plan });
  };
  // Capture on document before the vendor's React handler. The vendor handler
  // opens its own login dialog when its isolated Deriv client is unauthenticated;
  // Trade Scheme's signed-in Demo bridge owns this Run action instead.
  document.addEventListener("pointerup", handleRun, true);
  document.addEventListener("touchend", handleRun, true);
  document.addEventListener("click", handleRun, true);
  window.addEventListener("message", event => {
    if (event.source !== window.parent || event.data?.source !== "TSFX_TRADE_SCHEME_PARENT") return;
    let host = "";
    try { host = new URL(event.origin).hostname; } catch { return; }
    if (host !== "tradesche.com" && host !== "www.tradesche.com" && !host.endsWith(".vercel.app")) return;
    if (event.data.type !== "RUN_STATE") return;
    runState = {
      canRun: event.data.canRun === true,
      running: event.data.running === true,
      currency: ["USD", "AUD"].includes(event.data.currency) ? event.data.currency : null,
      message: String(event.data.message || ""),
    };
    apply();
  });
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
    note.textContent = "Virtual Demo only · Run uses these Blockly settings";
    note.style.cssText = "margin-left:auto;padding:8px 12px;color:#334155;font:600 12px system-ui,sans-serif;white-space:nowrap";
    header.appendChild(note);
  };
  const dismissFirstRunBuilderGuide = () => {
    if (!strategyId) return;
    const dialog = document.querySelector(".dc-dialog.tour-dialog");
    const title = dialog?.querySelector(".dc-dialog__content__header")?.textContent?.trim() || "";
    if (!dialog || !/bot builder guide/i.test(title)) return;
    const skip = [...dialog.querySelectorAll("button, [role=button], .dc-dialog__button")].find(button =>
      button.textContent?.trim() === "Skip"
    );
    if (skip && !skip.dataset.tsfxDismissRequested) {
      skip.dataset.tsfxDismissRequested = "true";
      skip.click();
    }
  };
  const syncVerifiedCurrency = () => {
    if (!["USD", "AUD"].includes(runState.currency)) return;
    const workspace = window.Blockly?.derivWorkspace;
    const optionBlocks = workspace?.getAllBlocks?.(false)?.filter(block => block.type === "trade_definition_multiplier") || [];
    for (const options of optionBlocks) {
      const field = options?.getField?.("CURRENCY_LIST");
      if (field && field.getValue?.() !== runState.currency) field.setValue(runState.currency);
    }
  };
  const apply = () => {
    syncVerifiedCurrency();
    if (!document.getElementById("tsfx-preview-auth-style")) {
      const style = document.createElement("style");
      style.id = "tsfx-preview-auth-style";
      style.textContent = ".app-header .auth-actions{display:none!important;visibility:hidden!important}";
      (document.head || document.documentElement).appendChild(style);
    }
    syncWorkspaceGuidance();
    dismissFirstRunBuilderGuide();
    const run = document.querySelector("#db-animation__run-button");
    if (run) {
      run.style.setProperty("touch-action", "manipulation", "important");
      run.style.setProperty("min-height", "56px", "important");
      run.style.setProperty("-webkit-tap-highlight-color", "transparent", "important");
      const runLabel = runState.running ? "Stop virtual Demo bot" : "Run virtual Demo bot from Blockly";
      const supportedPlan = isSupportedPlan();
      const runTitle = supportedPlan ? (runState.message || "Run the selected Trade Scheme FX strategy with the settings in these Blockly blocks. Virtual Demo only.") : "Preparing the selected bot's strategy and Multiplier trade blocks.";
      const canUseRunButton = Boolean(strategyId) && (runState.running || (runState.canRun && supportedPlan));
      run.disabled = !canUseRunButton;
      if (run.getAttribute("aria-label") !== runLabel) run.setAttribute("aria-label", runLabel);
      const accessibleTitle = strategyId ? runTitle : "Open a current bot from Trade Scheme FX to connect its strategy to Blockly.";
      if (run.title !== accessibleTitle) run.title = accessibleTitle;
      const text = run.querySelector("span");
      const label = !strategyId ? "Choose a bot" : runState.running ? "Stop Demo" : runState.canRun ? (supportedPlan ? "Run Demo" : "Preparing Blocks") : "Demo unavailable";
      if (text && text.textContent !== label) text.textContent = label;
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
  const fieldByGroup = new WeakMap();
  let workspaceRef = null;
  let attachedSvg = null;
  let scheduled = false;
  let lastActivation = null;
  let activePicker = null;
  const getWorkspace = () => workspaceRef || (workspaceRef = window.Blockly?.derivWorkspace || null);
  const cacheFields = workspace => {
    for (const block of workspace.getAllBlocks?.(false) || []) {
      for (const input of block.inputList || []) {
        for (const field of input.fieldRow || []) {
          const group = field.getSvgRoot?.();
          if (group) fieldByGroup.set(group, field);
        }
      }
    }
  };
  const findField = (workspace, group) => {
    const cached = fieldByGroup.get(group);
    if (cached) return cached;
    cacheFields(workspace);
    return fieldByGroup.get(group);
  };
  const openNumberPicker = field => {
    activePicker?.remove();
    const panel = document.createElement("section");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Choose a number from 0 to 1000");
    panel.style.cssText = "position:fixed;z-index:2147483647;left:0;right:0;bottom:0;max-height:75dvh;overflow:auto;box-sizing:border-box;padding:18px 16px calc(18px + env(safe-area-inset-bottom));background:#fff;color:#102033;border-radius:16px 16px 0 0;box-shadow:0 -8px 36px rgba(0,0,0,.32);font:16px system-ui,sans-serif";
    const title = document.createElement("strong");
    title.textContent = "Select a value from 0 to 1000";
    title.style.cssText = "display:block;margin:0 0 12px;font-size:18px";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Numeric value from 0 to 1000");
    select.style.cssText = "display:block;width:100%;min-height:52px;margin:0 0 14px;padding:10px;font:16px system-ui,sans-serif;color:#102033;background:#fff;border:1px solid #64748b;border-radius:8px;touch-action:manipulation";
    for (let value = 0; value <= 1000; value++) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(value);
      select.appendChild(option);
    }
    const currentValue = Number(field.getValue?.());
    select.value = String(Number.isFinite(currentValue) ? Math.max(0, Math.min(1000, Math.round(currentValue))) : 0);
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:10px";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Apply";
    for (const button of [cancel, apply]) {
      button.style.cssText = "flex:1;min-height:48px;padding:12px;border:1px solid #64748b;border-radius:8px;background:#f1f5f9;color:#102033;font:700 16px system-ui,sans-serif;touch-action:manipulation";
    }
    const close = () => {
      panel.remove();
      if (activePicker === panel) activePicker = null;
    };
    cancel.addEventListener("click", close);
    apply.addEventListener("click", () => {
      field.setValue(select.value);
      close();
    });
    panel.append(title, select, actions);
    actions.append(cancel, apply);
    document.body.appendChild(panel);
    activePicker = panel;
  };
  const attachTouchEditorFallback = (workspace, svg) => {
    if (attachedSvg === svg) return;
    attachedSvg = svg;
    const activateNumber = event => {
      if (event.type === "pointerup" && event.pointerType !== "touch") return;
      const group = event.target?.closest?.("g.blocklyEditableText");
      if (!group?.querySelector("rect[data-tsfx-touch-hit]")) return;
      const field = findField(workspace, group);
      if (!field || (field.isCurrentlyEditable && !field.isCurrentlyEditable()) || typeof field.setValue !== "function") return;
      const now = Date.now();
      if (lastActivation?.group === group && now - lastActivation.at < 700) return;
      lastActivation = { group, at: now };
      try {
        // Open a real HTML select in the trusted touch event; this avoids relying on mobile keyboard focus in Blockly's SVG editor.
        if (event.cancelable) event.preventDefault();
        openNumberPicker(field);
      } catch {
        lastActivation = null;
      }
    };
    svg.addEventListener("pointerup", activateNumber, true);
    svg.addEventListener("touchend", activateNumber, true);
  };
  const enhanceNumberFields = () => {
    scheduled = false;
    if (!window.matchMedia?.("(pointer: coarse)").matches && window.innerWidth > 768) return;
    const workspace = getWorkspace();
    const svg = workspace?.getParentSvg?.();
    if (!svg) return;
    cacheFields(workspace);
    attachTouchEditorFallback(workspace, svg);

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
    const workspace = getWorkspace();
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
