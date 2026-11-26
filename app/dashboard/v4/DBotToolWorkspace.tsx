 "use client";

import Link from "next/link";
import {useState} from "react";
import QuantumBotCatalog from "./QuantumBotCatalog";
import styles from "./workspace.module.css";

export type FeaturedTool = "Bulk Trader" | "Premium AI Bots" | "Speedbot" | "Manual Trader";

type View = "workspace" | "structure" | "results";

const tools: Record<FeaturedTool,{route:string;description:string;workspaceLabel:string}> = {
  "Bulk Trader": {
    route: "/bulk-trader",
    description: "Research-only batch exposure planning. No Deriv contract purchases.",
    workspaceLabel: "Bulk Risk Planner",
  },
  "Premium AI Bots": {
    route: "/bot-library",
    description: "The 16 current 4.0 strategies open the official pinned Blockly editor individually. Strategies are unchanged; execution is disabled.",
    workspaceLabel: "4.0 strategy library",
  },
  "Speedbot": {
    route: "/digit-tools",
    description: "Live public-market digit observations. No broker execution.",
    workspaceLabel: "Live Digit Tools",
  },
  "Manual Trader": {
    route: "/manual-trader",
    description: "Manual paper-ticket practice only. No broker purchases.",
    workspaceLabel: "Manual Paper Ticket",
  },
};

const structure = [
  ["Trade parameters","Market, trade type and contract choices remain under each existing tool's validated controls."],
  ["Purchase conditions","Existing research signals are preserved. No new purchase rules or executable blocks are generated here."],
  ["Trade options","Stake, duration and risk settings shown by an existing tool are not copied into Deriv order settings."],
  ["After purchase","Execution monitoring is not enabled by this interface."],
  ["Restart / stop","The existing research tool owns its own session and stop behavior."],
] as const;

export default function DBotToolWorkspace({module}:{module:FeaturedTool}) {
  const [view,setView]=useState<View>("workspace");
  const tool=tools[module];
  return <section className={styles.dbotPanel} aria-label={module + " DBot-style workspace"}>
    <header className={styles.dbotBar}>
      <div><small>TRADE SCHEME FX 4.0 · DBOT-STYLE WORKSPACE</small><h2>{module}</h2></div>
      <span className={styles.dbotMode}>RESEARCH · EXECUTION DISABLED</span>
    </header>
    <div className={styles.dbotLayout}>
      <nav className={styles.dbotToolbox} aria-label={module + " workspace sections"}>
        <strong>Toolbox</strong>
        <button type="button" aria-pressed={view==="workspace"} onClick={()=>setView("workspace")}>Workspace</button>
        <button type="button" aria-pressed={view==="structure"} onClick={()=>setView("structure")}>Trade blocks</button>
        <button type="button" aria-pressed={view==="results"} onClick={()=>setView("results")}>Results</button>
        <small>Structure reference only; these are not executable Blockly blocks.</small>
      </nav>
      <div className={styles.dbotStage}>
        {view==="workspace"&&<>
          <div className={styles.dbotStageHeading}>
            <h3>{tool.workspaceLabel}</h3>
            <Link href={tool.route}>Open full tool</Link>
          </div>
          {module==="Premium AI Bots"
            ? <QuantumBotCatalog/>
            : <iframe title={module + " research tool"} src={tool.route} loading="lazy" className={styles.dbotFrame}/>}
        </>}
        {view==="structure"&&<div className={styles.dbotBlockList}>
          <h3>DBot-style trade structure</h3>
          <p>No trading instructions are created or executed here. Use the existing tool for validated research controls.</p>
          {structure.map(([name,description],index)=><article key={name}>
            <span aria-hidden="true">{index+1}</span>
            <div><strong>{name}</strong><p>{description}</p></div>
          </article>)}
        </div>}
        {view==="results"&&<div className={styles.dbotEmptyResults}>
          <h3>Results and transaction information</h3>
          <p>Open the original {module} tool for its available research results and history. This layout does not create or simulate transaction records.</p>
          <Link href={tool.route}>View {tool.workspaceLabel}</Link>
        </div>}
      </div>
      <aside className={styles.dbotInspector}>
        <h3>Overview</h3>
        <p>{tool.description}</p>
        <div><strong>Current bot catalog</strong><span>16 active 4.0 references</span></div>
        <div><strong>Deriv execution</strong><span>Disabled</span></div>
        <div><strong>Risk settings</strong><span>Draft only · not enforced</span></div>
        <p className={styles.dbotSafety}>Retired strategy source is archived and not included in the visible catalog. For an individual current 4.0 bot, open its card to enter the official pinned Deriv Blockly editor and the per-bot draft settings panel.</p>
      </aside>
    </div>
  </section>;
}
