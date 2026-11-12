import Link from "next/link";

export default function Home() {
  return (
    <main className="tjHome">
      <div className="derivRibbon">INDEPENDENT TRADING TOOLS FOR DERIV TRADERS</div>
      <nav className="nav wrap tjNav">
        <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
        <div className="navlinks">
          <Link href="/markets">Markets</Link>
          <Link href="/login">Log in</Link>
          <Link className="button small" href="/signup">Create free account</Link>
        </div>
      </nav>

      <section className="tjHero wrap">
        <div className="tjHeroCopy">
          <p className="eyebrow">MEET YOUR AI MARKET ASSISTANT</p>
          <h1>LET <span>T&amp;J</span><br/>ANALYZE YOUR MARKET.</h1>
          <p className="tjLead">A smarter view of forex, gold, indices and Deriv markets — with tools designed to help you analyze, plan and stay in control.</p>
          <div className="actions">
            <Link className="button" href="/signup">Get started — free</Link>
            <Link className="button secondary" href="/markets">Explore markets</Link>
          </div>
          <div className="tjTrust"><span>✓ Your Deriv account stays yours</span><span>✓ You control your bot settings</span><span>✓ No platform membership fee</span></div>
        </div>
        <div className="tjArtworkFrame">
          <img className="tjArtwork" src="/assets/tj-ai-trading-hero.png" alt="Trade Scheme FX T&J AI trading assistant with market analysis, forex, gold and trading tools" />
          <div className="tjArtworkGlow" aria-hidden="true"/>
        </div>
      </section>

      <section className="tjCapabilities wrap">
        <div className="tjSectionTitle"><p className="eyebrow">ONE WORKSPACE. MULTIPLE MARKETS.</p><h2>Meet the T&amp;J toolkit</h2></div>
        <div className="featureGrid tjFeatureGrid">
          <article className="feature"><div className="featureIcon">⌁</div><h3>Market analysis</h3><p>Review market information and chart context before making your own trading decisions.</p></article>
          <article className="feature"><div className="featureIcon">◈</div><h3>Trading tools</h3><p>Explore bot settings and trading utilities while keeping control of your own account.</p></article>
          <article className="feature"><div className="featureIcon">⛨</div><h3>Risk awareness</h3><p>Keep risk in view. Trading involves losses and no strategy or signal guarantees profit.</p></article>
        </div>
      </section>
      <footer className="footer wrap">© {new Date().getFullYear()} Trade Scheme FX. T&amp;J provides market-analysis tools, not guaranteed trading outcomes. Trading involves risk and losses are possible. Trade Scheme FX is independent and is not endorsed by Deriv. Live trading execution and some market feeds require separate integration and testing.</footer>
    </main>
  );
}
