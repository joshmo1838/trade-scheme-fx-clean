import Link from 'next/link';

const features = [
  ['01', 'Connect your own broker account', 'The intended platform model keeps customer funds in each customer’s own broker account.'],
  ['02', 'Choose your trading settings', 'Review strategy information and risk controls before deciding whether to use any trading tool.'],
  ['03', 'Stay in control', 'A clear workspace is planned for account connections, strategy settings and activity history.'],
];

export default function Home() {
  return <main>
    <div className="ambient" aria-hidden="true" />
    <header className="topbar wrap">
      <Link className="brand" href="/"><span className="brand-mark">↗</span><span>TRADE SCHEME<small>FX TECHNOLOGY</small></span></Link>
      <nav><a href="#features">How it works</a><a href="#membership">Membership</a><Link href="/admin">Admin</Link></nav>
      <a className="button button-small" href="#membership">Get started</a>
    </header>

    <section className="hero wrap">
      <div className="hero-copy">
        <div className="eyebrow"><span className="pulse"/> AUTOMATED TRADING TECHNOLOGY</div>
        <h1>Trade smarter.<br/><span>Stay in control.</span></h1>
        <p className="lead">A modern home for trading tools, strategy insights and customer-controlled account connections.</p>
        <div className="actions"><a className="button" href="#membership">Join for free <span>↗</span></a><a className="button button-ghost" href="#features">Explore the platform</a></div>
        <p className="micro">Free membership. No monthly subscription fee.</p>
      </div>
      <div className="hero-panel">
        <div className="panel-top"><span>PLATFORM OVERVIEW</span><span className="live-dot">● CONCEPT PREVIEW</span></div>
        <div className="panel-orbit"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="core"><span>TS</span><small>FX</small></div><div className="orbit-label label-a">STRATEGY</div><div className="orbit-label label-b">RISK CONTROL</div><div className="orbit-label label-c">CUSTOMER FIRST</div></div>
        <div className="panel-bottom"><div><small>MEMBERSHIP</small><strong>FREE</strong></div><div><small>ACCOUNT CONTROL</small><strong>Customer-led</strong></div></div>
      </div>
    </section>

    <section className="trust-strip"><div className="wrap trust-inner"><span>FREE TO JOIN</span><i/><span>NO MONTHLY MEMBERSHIP FEE</span><i/><span>RISK-AWARE DESIGN</span></div></section>

    <section className="section wrap" id="features">
      <div className="section-heading"><div className="eyebrow">A CLEAR CUSTOMER JOURNEY</div><h2>Technology built around <span>your control.</span></h2><p>Trade Scheme FX is being developed to make trading tools easier to understand and manage.</p></div>
      <div className="feature-grid">{features.map(([n, title, desc]) => <article className="feature-card" key={n}><span className="number">{n}</span><h3>{title}</h3><p>{desc}</p></article>)}</div>
    </section>

    <section className="membership" id="membership"><div className="wrap membership-inner"><div><div className="eyebrow">SIMPLE MEMBERSHIP</div><h2>Start with <span>free access.</span></h2><p>No monthly membership charge. Any future optional paid services or third-party broker charges must be clearly disclosed before use.</p></div><div className="free-card"><div className="free-label">TRADE SCHEME FX MEMBERSHIP</div><div className="free-price">$0 <small>/ month</small></div><ul><li>Free website membership</li><li>Explore platform information</li><li>No recurring subscription fee</li></ul><a className="button" href="mailto:support@tradesche.com?subject=Trade%20Scheme%20FX%20membership">Request access <span>↗</span></a></div></div></section>

    <section className="risk wrap"><strong>Important risk notice</strong><p>Trading financial markets involves substantial risk and may result in the loss of some or all of your capital. No trading strategy or software can guarantee profits. This website is an informational starter and does not currently execute trades, connect live broker accounts, process memberships, or provide investment advice.</p></section>
    <footer className="footer wrap"><Link className="brand" href="/"><span className="brand-mark">↗</span><span>TRADE SCHEME<small>FX TECHNOLOGY</small></span></Link><span>Trade smarter. Stay in control.</span><span>© 2026 Trade Scheme FX</span></footer>
  </main>;
}
