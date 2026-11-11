import Link from "next/link";

export default function Home() {
  return (
    <main className="hero">
      <nav className="nav wrap">
        <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
        <div className="navlinks"><Link href="/login">Log in</Link><Link className="button small" href="/signup">Create free account</Link></div>
      </nav>
      <div className="orbitWords" aria-hidden="true">
        <span className="floatWord w1">AI TRADING</span>
        <span className="floatWord w2">SYNTHETIC INDICES</span>
        <span className="floatWord w3">SMART BOTS</span>
        <span className="floatWord w4">DERIV</span>
        <span className="floatWord w5">MARKET ANALYSIS</span>
        <span className="floatWord w6">BUY · SELL</span>
        <span className="floatWord w7">AUTOMATION</span>
        <span className="floatWord w8">TRADE SMARTER</span>
        <span className="orbitDot d1"></span><span className="orbitDot d2"></span>
        <span className="orbitDot d3"></span><span className="orbitDot d4"></span>
      </div>
      <section className="heroContent wrap">
        <p className="eyebrow">SMARTER TOOLS. YOUR ACCOUNT. YOUR CONTROL.</p>
        <h1>Trade smarter.<br/><span>Stay in control.</span></h1>
        <p className="lead">A home for your trading tools, bot settings, and Deriv account connection — designed around your control.</p>
        <div className="actions"><Link className="button" href="/signup">Get started — free</Link><Link className="button secondary" href="/login">Customer login</Link></div>
        <div className="trustline"><span>✓ No platform membership fee</span><span>✓ Your Deriv account stays yours</span><span>✓ You control your bot settings</span></div>
      </section>
      <section className="featureGrid wrap">
        <article className="feature"><div className="featureIcon">◈</div><h3>Your dashboard</h3><p>Keep your account connection and trading tools in one place.</p></article>
        <article className="feature"><div className="featureIcon">⌘</div><h3>Bot controls</h3><p>Manage your preferred bot settings. Live execution is enabled only after integration and testing.</p></article>
        <article className="feature"><div className="featureIcon">⛨</div><h3>Account security</h3><p>Your funds remain in your own Deriv account. Never share your Deriv password.</p></article>
      </section>
      <footer className="footer wrap">© {new Date().getFullYear()} Trade Scheme FX. Trading involves risk. No profits are guaranteed.</footer>
    </main>
  );
}
