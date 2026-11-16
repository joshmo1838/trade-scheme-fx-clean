"use client";

import Link from "next/link";
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
  { label: "Volt AI", href: "/ai-scanner", symbol: "✧" },
  { label: "Customer Bot Center", href: "/bot-center", symbol: "◈" },
  { label: "Bulk Trader", href: "/bulk-trader", symbol: "▤" },
  { label: "Analysis Tools", href: "/charts", symbol: "⌁" },
  { label: "Market Intelligence", href: "/intelligence", symbol: "◉" },
  { label: "Hedging Tool", href: "/copy-trading", symbol: "⇄" },
  { label: "Manual Trader", href: "/manual-trader", symbol: "⌖" },
  { label: "Digit Tools", href: "/digit-tools", symbol: "％" },
  { label: "Signal AI", href: "/ai-scanner", symbol: "⌁" },
  { label: "History", href: "/history", symbol: "◷" },
];

const launchCards = [
  { title: "Customer Bot Center", description: "Browse free bots, manage your selections and paper settings.", href: "/bot-center", symbol: "◈", tag: "BOT WORKSPACE" },
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

  return (
    <main className="workspaceShell">
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
              {item.label === "Volt AI" && <em>AI</em>}
            </Link>
          ))}
          <div className="workspaceSidebarBottom">
            <span className="workspaceAvatar">{(name.trim()[0] || "T").toUpperCase()}</span>
            <span><strong>{name}</strong><small>{email}</small></span>
          </div>
        </aside>

        <section className="workspaceMain">
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
            <div><small>BOT EXECUTION</small><strong className="warningText">NOT ACTIVE</strong></div>
          </section>

          <div className="workspaceSectionHeading">
            <div><p className="workspaceEyebrow">GET STARTED</p><h2>Your trading tools</h2></div>
            <Link href="/bots" className="workspaceViewAll">View bot library ↗</Link>
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
              <p>Bot execution remains disabled while we complete the execution engine, risk controls and demo testing.</p>
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
    </main>
  );
}
