/** Public, internal workspace destinations only. No orders or credentials. */
export type WorkspaceCommand = {
  id: string;
  label: string;
  href: string;
  section: "Overview" | "Bots & Strategies" | "Markets & Analysis" | "Trading Practice" | "Account & Support";
  description: string;
  keywords: string;
};

export const workspaceCommands: readonly WorkspaceCommand[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", section: "Overview", description: "Return to your trading workspace", keywords: "home start overview" },
  { id: "bot-center", label: "Free Bot Center", href: "/bot-center", section: "Bots & Strategies", description: "Explore available bots and paper practice", keywords: "bots free synthetic bot center" },
  { id: "bot-controls", label: "Paper Bot Controls", href: "/bot-controls", section: "Bots & Strategies", description: "Review queued commands and verified paper worker status", keywords: "start stop pause resume status risk exposure simulation" },
  { id: "builder", label: "Visual Bot Builder", href: "/builder", section: "Bots & Strategies", description: "Build and review your saved strategy drafts", keywords: "strategy import json create design" },
  { id: "bots", label: "My Bots", href: "/bots", section: "Bots & Strategies", description: "Review your selected bot preferences", keywords: "manage selected portfolio" },
  { id: "bot-settings", label: "Bot Settings", href: "/bot-settings", section: "Bots & Strategies", description: "Adjust saved demo and real account preferences", keywords: "stake limits configuration risk" },
  { id: "charts", label: "Live Candlestick Charts", href: "/charts", section: "Markets & Analysis", description: "Watch candles built from public market ticks", keywords: "chart technical price ohlc volatility candles" },
  { id: "markets", label: "Synthetic Markets", href: "/markets", section: "Markets & Analysis", description: "Browse public synthetic index prices", keywords: "volatility indices ticks quotes market watch" },
  { id: "ai-scanner", label: "Market Scanner", href: "/ai-scanner", section: "Markets & Analysis", description: "Explore transparent rule-based market scans", keywords: "scanner signals rules analysis" },
  { id: "intelligence", label: "Market Intelligence", href: "/intelligence", section: "Markets & Analysis", description: "Study market observations and research tools", keywords: "research data indicators analysis" },
  { id: "digit-tools", label: "Digit Tools", href: "/digit-tools", section: "Markets & Analysis", description: "Count digits observed from public ticks", keywords: "digit frequency last digit tick data" },
  { id: "manual-trader", label: "Manual Paper Trading", href: "/manual-trader", section: "Trading Practice", description: "Practice trade decisions without broker orders", keywords: "demo manual paper trading practice" },
  { id: "bulk-trader", label: "Bulk Risk Planner", href: "/bulk-trader", section: "Trading Practice", description: "Model batch exposure without placing orders", keywords: "bulk batches risk exposure scenario" },
  { id: "hedging", label: "Hedging Planner", href: "/hedging", section: "Trading Practice", description: "Explore hedging scenarios without placing orders", keywords: "hedge stress risk scenario" },
  { id: "history", label: "Paper Trade History", href: "/history", section: "Trading Practice", description: "Review saved paper results and statistics", keywords: "trade log journal performance simulation" },
  { id: "backtest", label: "Backtest Research", href: "/backtest", section: "Trading Practice", description: "Study historical out-of-sample paper research", keywords: "strategy backtest performance out of sample" },
  { id: "strategy-lab", label: "Strategy Lab", href: "/strategy-lab", section: "Trading Practice", description: "Experiment with research strategies", keywords: "lab compare strategies" },
  { id: "copy-trading", label: "Copy Trading Preview", href: "/copy-trading", section: "Trading Practice", description: "Review a preview, not live trade copying", keywords: "copy mirror follower preview" },
  { id: "messages", label: "Customer Support", href: "/messages", section: "Account & Support", description: "Contact Trade Scheme FX support", keywords: "help message chat contact support" },
];

export function searchWorkspaceCommands(query: string, maxResults = 9): WorkspaceCommand[] {
  if (!Number.isSafeInteger(maxResults) || maxResults <= 0) return [];
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return workspaceCommands.slice(0, maxResults);
  return workspaceCommands
    .map((item, index) => {
      const label = item.label.toLowerCase();
      const haystack = [label, item.description, item.section, item.keywords]
        .join(" ").toLowerCase();
      if (!terms.every(term => haystack.includes(term))) return null;
      const score = label === terms.join(" ") ? 0
        : label.startsWith(terms.join(" ")) ? 1
        : terms.every(term => label.includes(term)) ? 2 : 3;
      return { item, index, score };
    })
    .filter((entry): entry is {item: WorkspaceCommand; index: number; score: number} => entry !== null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, maxResults)
    .map(entry => entry.item);
}
