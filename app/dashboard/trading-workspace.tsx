"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TradingLandingVisual from "@/components/TradingLandingVisual";
import DerivAccounts from "./deriv-accounts";

type Props = {
  name: string;
  email: string;
  userId: string;
  derivStatus: string;
  derivExpiry: string | null;
  derivError: boolean;
};

const navigation = [
  { label: "Dashboard", href: "/dashboard", symbol: "▦" },
  { label: "Bot Builder", href: "/builder", symbol: "▧" },
  { label: "Market Scanner", href: "/ai-scanner", symbol: "✧" },
  { label: "Customer Bot Center", href: "/bot-center", symbol: "◈" },
  { label: "Bulk Trader", href: "/bulk-trader", symbol: "▤" },
  { label: "Analysis Tools", href: "/charts", symbol: "⌁" },
  { label: "Market Intelligence", href: "/intelligence", symbol: "◉" },
  { label: "Hedging Planner", href: "/hedging", symbol: "⇄" },
  { label: "Manual Trader", href: "/manual-trader", symbol: "⌖" },
  { label: "Digit Tools", href: "/digit-tools", symbol: "％" },
  { label: "Paper Signals", href: "/intelligence", symbol: "⌁" },
  { label: "History", href: "/history", symbol: "◷" },
];

const videoNav = [
  { label: "Dashboard", href: "/dashboard", icon: "⌂" },
  { label: "Bot Builder", href: "/builder", icon: "▧" },
  { label: "Vault AI", href: "/strategy-lab", icon: "◈" },
  { label: "Free Bots", href: "/bot-center", icon: "♙" },
  { label: "Bulk Trader", href: "/bulk-trader", icon: "▤" },
  { label: "Analysis Tools", href: "/charts", icon: "⌕" },
  { label: "Hedging Tool", href: "/hedging", icon: "⬡" },
  { label: "Auto AI", href: "/ai-scanner", icon: "✧" },
  { label: "Manual Trader", href: "/manual-trader", icon: "▣" },
  { label: "Premium AI Bots", href: "/bot-center", icon: "◇" },
  { label: "Apex Bot", href: "/bot-center", icon: "♧" },
  { label: "Quick Bot", href: "/builder", icon: "ϟ" },
  { label: "Signal AI", href: "/intelligence", icon: "◎" },
];

type PublishedBot = { id: string; name: string; market: string; description: string; risk_level: string };

const launchCards = [
  { title: "Customer Bot Center", description: "Configure and start selected public-tick paper bots, with saved results and risk controls.", href: "/bot-center", symbol: "◈", tag: "PAPER BOT WORKSPACE" },
  { title: "Free Bot Marketplace", description: "Explore strategies available to every registered customer.", href: "/bot-center", symbol: "✦", tag: "FREE ACCESS" },
  { title: "Speed Bot", description: "Quick access to your bot workspace.", href: "/builder", symbol: "ϟ", tag: "QUICK START" },
  { title: "Manual Trading", description: "Review markets and control each trade.", href: "/manual-trader", symbol: "⌖", tag: "MANUAL" },
];

export default function TradingWorkspace({
  name,
  email,
  userId,
  derivStatus,
  derivExpiry,
  derivError,
}: Props) {
  const connected = derivStatus === "Connected";
  const expired = derivStatus === "Expired";
  const [openPanel, setOpenPanel] = useState<"load" | "bots" | null>(null);
  const [publishedBots, setPublishedBots] = useState<PublishedBot[]>([]);
  const [botsBusy, setBotsBusy] = useState(false);
  const [botsError, setBotsError] = useState("");

  async function browseBots() {
    setOpenPanel("bots");
    setBotsBusy(true);
    setBotsError("");
    try {
      const db = createClient();
      const { data, error } = await db.from("bots")
        .select("id,name,market,description,risk_level")
        .eq("is_published", true).order("name");
      if (error) throw error;
      setPublishedBots((data || []) as PublishedBot[]);
    } catch {
      setBotsError("Could not load the live bot catalogue. Open Bot Center to retry.");
      setPublishedBots([]);
    } finally {
      setBotsBusy(false);
    }
  }

  return (
    <main className="workspaceShell workspaceVideo">
      <header className="workspaceTopbar">
        <Link className="workspaceBrand" href="/">
          TRADE SCHEME <span>FX</span>
          <small>TRADING WORKSPACE</small>
        </Link>
        <div className="workspaceTopActions">
          <span className={connected ? "workspaceConnection live" : "workspaceConnection"}>
            <i /> {connected ? "DERIV CONNECTED" : derivStatus.toUpperCase()}
          </span>
          <Link className="workspaceTopLink" href="/messages">Support</Link>
          <form action="/auth/signout" method="post">
            <button className="workspaceSignout">Sign out</button>
          </form>
        </div>
      </header>

      <nav className="videoTopNav" aria-label="Trading workspace tools">
        {videoNav.map((item) => <Link key={item.label} href={item.href} className={item.href === "/dashboard" ? "videoTopNavItem active" : "videoTopNavItem"}>
          <span aria-hidden="true">{item.icon}</span>{item.label}
        </Link>)}
      </nav>

      <div className="workspaceLayout">
        <aside className="workspaceSidebar">
          <p className="workspaceNavLabel">WORKSPACE</p>
          {navigation.map((item, index) => (
            <Link
              className={index === 0 ? "workspaceNavItem active" : "workspaceNavItem"}
              href={item.href}
              key={item.label}
            >
              <span className="workspaceNavSymbol">{item.symbol}</span>
              {item.label}
              {item.label === "Market Scanner" && <em>LIVE</em>}
            </Link>
          ))}
          <div className="workspaceSidebarBottom">
            <span className="workspaceAvatar">{(name.trim()[0] || "T").toUpperCase()}</span>
            <span><strong>{name}</strong><small>{email}</small></span>
          </div>
        </aside>

        <section className="workspaceMain">
          <section className="videoHero" aria-label="Trade Scheme FX launch center">
            <div className="videoHeroArtwork"><TradingLandingVisual /></div>
            <div className="videoHeroVeil" />
            <div className="videoHeroContent">
              <p className="videoHeroEyebrow">✦ TRADESCHEME / YOUR TRADING WORKSPACE</p>
              <h1>Welcome, {name.split("@")[0]}</h1>
              <p>Explore your bots, build strategies and practise with public market data.</p>
              <div className="videoHeroDots" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
              <div className="videoLaunchGrid">
                <button className="videoLaunchCard" type="button" onClick={() => setOpenPanel("load")}>
                  <span className="videoNumber">01</span><span className="videoCardIcon">⇧</span>
                  <strong>Load Bot</strong><small>Open a saved strategy or choose a bot</small>
                  <em>Choose a bot <b>↗</b></em>
                </button>
                <button className="videoLaunchCard accentGold" type="button" onClick={() => { void browseBots(); }}>
                  <span className="videoNumber">02</span><span className="videoCardIcon">◇</span>
                  <strong>Premium Bots</strong><small>Discover available strategies · free access</small>
                  <em>Browse available bots <b>↗</b></em>
                </button>
                <Link className="videoLaunchCard accentCyan" href="/bot-center">
                  <span className="videoNumber">03</span><span className="videoCardIcon">ϟ</span>
                  <strong>Speed Bot</strong><small>Open quick-start paper bot controls</small>
                  <em>Open Bot Center <b>↗</b></em>
                </Link>
                <Link className="videoLaunchCard accentPurple" href="/manual-trader">
                  <span className="videoNumber">04</span><span className="videoCardIcon">☷</span>
                  <strong>Manual Trading</strong><small>Practice your decisions on public ticks</small>
                  <em>Start paper practice <b>↗</b></em>
                </Link>
              </div>
              <p className="videoHeroFootnote">Charts on this welcome screen are illustrative. Bot and manual paper results are not Deriv contracts or verified returns.</p>
            </div>
          </section>
          <div className="workspaceWelcome">
            <div>
              <p className="workspaceEyebrow">YOUR AUTOMATION COMMAND CENTER</p>
              <h1>Welcome back, <span>{name.split("@")[0]}</span></h1>
              <p>Build strategies, explore trading tools and stay in control of your Deriv account.</p>
            </div>
            <div className="workspaceModeBadge"><span /> CUSTOMER WORKSPACE</div>
          </div>

          <section className="workspaceMarketStrip" aria-label="Workspace status">
            <div><small>PLATFORM</small><strong>TRADE SCHEME FX</strong></div>
            <div><small>DERIV CONNECTION</small><strong className={connected ? "positiveText" : "warningText"}>{derivStatus}</strong></div>
            <div><small>TRADING MODE</small><strong>SELECT YOUR ACCOUNT</strong></div>
            <div><small>BOT EXECUTION</small><strong className="warningText">PAPER · CUSTOMER START</strong></div>
          </section>

          <div className="workspaceSectionHeading">
            <div><p className="workspaceEyebrow">GET STARTED</p><h2>Your trading tools</h2></div>
            <Link href="/bot-center" className="workspaceViewAll">Open Bot Center ↗</Link>
          </div>

          <section className="workspaceLaunchGrid">
            {launchCards.map((card) => (
              <Link href={card.href} className="workspaceLaunchCard" key={card.title}>
                <span className="workspaceCardSymbol">{card.symbol}</span>
                <span className="workspaceCardTag">{card.tag}</span>
                <strong>{card.title}</strong>
                <p>{card.description}</p>
                <span className="workspaceCardAction">OPEN TOOL <b>↗</b></span>
              </Link>
            ))}
          </section>

          <div className="workspaceSectionHeading workspaceLowerHeading">
            <div><p className="workspaceEyebrow">ACCOUNT CONNECTION</p><h2>Your Deriv account</h2></div>
          </div>

          <section className="workspaceAccountGrid">
            <article className="workspacePanel">
              <div className="workspacePanelTop">
                <div><p className="workspaceEyebrow">DERIV AUTHORIZATION</p><h3>{derivStatus}</h3></div>
                <span className={connected ? "workspaceStatusDot online" : "workspaceStatusDot"} />
              </div>
              {connected ? (
                <>
                  <p>Your Deriv authorization is active. Choose the account you want to use below.</p>
                  {derivExpiry && <small className="workspaceMuted">Connection expiry: {derivExpiry}</small>}
                </>
              ) : expired ? (
                <><p>Your Deriv authorization has expired. Reconnect to retrieve your accounts.</p><Link className="workspacePrimaryButton" href="/api/deriv/connect">Reconnect Deriv ↗</Link></>
              ) : (
                <><p>{derivError ? "We could not verify your Deriv connection. Please try again later or contact support." : "Connect your own Deriv account to access account information."}</p>{!derivError && <Link className="workspacePrimaryButton" href="/api/deriv/connect">Connect Deriv ↗</Link>}</>
              )}
            </article>

            <article className="workspacePanel workspaceSafetyPanel">
              <p className="workspaceEyebrow">TRADING SAFETY</p>
              <h3>You're in control</h3>
              <p>You can start and pause server-verified paper simulations from Bot Center. These do not use Deriv Demo or real-money funds. Broker Demo execution remains gated while integration tests are completed.</p>
              <div className="workspaceSafetyPill">DEMO-FIRST DEVELOPMENT</div>
            </article>
          </section>

          {connected && <div className="workspaceDerivAccounts"><DerivAccounts userId={userId} /></div>}

          <footer className="workspaceFooter">
            <span>© {new Date().getFullYear()} Trade Scheme FX</span>
            <span>Trade smarter. Stay in control.</span>
            <span>Trading involves risk. No strategy guarantees profit.</span>
          </footer>
        </section>
      </div>
      {openPanel && (
        <div className="videoModalBackdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenPanel(null); }}>
          <section className="videoBotModal" role="dialog" aria-modal="true" aria-label={openPanel === "bots" ? "Available bots" : "Load a bot"}>
            <div className="videoBotModalHeader">
              <div><small>TRADESCHEME BOT WORKSPACE</small><h2>{openPanel === "bots" ? "Available bots" : "Load a bot"}</h2></div>
              <button type="button" className="videoModalClose" aria-label="Close window" onClick={() => setOpenPanel(null)}>×</button>
            </div>
            {openPanel === "load" ? (
              <div className="videoModalBotGrid">
                <Link className="videoModalChoice" href="/builder"><span>▧</span><strong>My saved strategies</strong><small>Open the Bot Builder and load a strategy saved to your account</small><em>Open Bot Builder ↗</em></Link>
                <Link className="videoModalChoice" href="/bot-center"><span>◈</span><strong>Published paper bots</strong><small>Select an available bot and review its real configuration status</small><em>Open Bot Center ↗</em></Link>
              </div>
            ) : (
              <>
                <p className="videoModalNote">All available bots are free to explore. Only published records from your account database appear here. This list does not imply that a bot has proven returns or live execution.</p>
                {botsBusy && <p role="status">Loading published bot catalogue…</p>}
                {botsError && <p role="alert">{botsError}</p>}
                {!botsBusy && !botsError && publishedBots.length === 0 && <p>No bots are published for your account yet.</p>}
                <div className="videoModalBotGrid">
                  {!botsBusy && publishedBots.map(bot => (
                    <Link key={bot.id} href="/bot-center" className="videoModalChoice">
                      <span>✦</span><strong>{bot.name}</strong><small>{bot.market} · {bot.risk_level} risk</small><p>{bot.description}</p><em>Review in Bot Center ↗</em>
                    </Link>
                  ))}
                </div>
                <Link href="/bot-center" className="videoBrowseAll">View Bot Center and controls ↗</Link>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
