"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import "./workspace-ai-orb.css";

const WORKSPACE_PATHS = ["/dashboard", "/workspace", "/intelligence", "/digit-matrix", "/bot-library", "/bot-research", "/strategy-lab", "/bot-center", "/bots", "/trading"];

export default function WorkspaceAIOrb() {
  const pathname = usePathname() ?? "";
  const [expanded, setExpanded] = useState(false);
  const [online, setOnline] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const inWorkspace = WORKSPACE_PATHS.some(path => pathname === path || pathname.startsWith(path + "/"));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReducedMotion(media.matches);
    update();
    motion();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    media.addEventListener("change", motion);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      media.removeEventListener("change", motion);
    };
  }, []);
  if (!inWorkspace) return null;
  const state = !online ? "Offline" : "Research ready";
  return (
    <aside className="senfx-ai-orb-dock" aria-label="SENFX AI workspace assistant">
      {expanded && (
        <section className="senfx-ai-orb-panel" aria-live="polite">
          <strong>SENFX Intelligence</strong>
          <p>{online ? "Workspace is online. AI market analysis and paper trading are not implied to be running." : "Browser is offline. Live data cannot be confirmed."}</p>
          <span className="senfx-ai-orb-status">{state}</span>
          <a href="/intelligence">Open Intelligence workspace</a>
        </section>
      )}
      <button type="button" className={"senfx-ai-orb-button" + (reducedMotion ? " senfx-ai-orb-still" : "")} aria-label={expanded ? "Close AI assistant status" : "Open AI assistant status"} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
        <span className="senfx-ai-orb-ring" aria-hidden="true" />
        <span className="senfx-ai-orb-core" aria-hidden="true">AI</span>
      </button>
      <span className="senfx-ai-orb-caption" aria-hidden="true">{state}</span>
    </aside>
  );
}
