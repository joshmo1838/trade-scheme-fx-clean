import Link from "next/link";
import MarketTicker from "@/components/MarketTicker";
import LandingHeadlines from "@/components/LandingHeadlines";
import TradingLandingVisual from "@/components/TradingLandingVisual";

export default function Home() {
  return (
    <main className="senfxLanding">
      <header className="senfxLandingTop">
        <div className="senfxTopInner">
          <Link href="/" className="senfxWordmark" aria-label="Trade Scheme FX home">
            <span className="senfxWordmarkSymbol" aria-hidden="true">⌁</span>
            <span className="senfxWordmarkText">
              <strong>trade<span>scheme</span></strong>
              <small>TRADE SCHEME FX</small>
            </span>
          </Link>

          <nav className="senfxLandingNav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <Link href="/bot-library">Bulk Bots</Link>
            <Link href="/markets">Markets</Link>
            <a href="#learn">Learn</a>
            <a href="#faq">FAQ</a>
          </nav>

          <div className="senfxLandingAuth">
            <Link className="senfxOutlineButton" href="/api/auth/deriv/start">Log in</Link>
            <Link className="senfxTopButton" href="/signup">Get started <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </header>

      <div className="senfxLandingMarketWatch">
        <MarketTicker />
      </div>

      <section className="senfxLandingHero" aria-label="Trade Scheme FX trading workspace introduction">
        <TradingLandingVisual />
        <div className="senfxLandingScrim" aria-hidden="true" />
        <div className="senfxHeroCenter">
          <p className="senfxHeroTag"><span className="senfxHeroTagDot" aria-hidden="true"/> FREE WORKSPACE · MARKET TOOLS · DEMO LEARNING</p>
          <LandingHeadlines />
          <div className="senfxHeroActions">
            <Link href="/api/auth/deriv/start" className="senfxHeroPrimary">
              <span aria-hidden="true">↗</span> Log in with Deriv <span aria-hidden="true">›</span>
            </Link>
            <Link href="/bot-library" className="senfxHeroSecondary">
              <span aria-hidden="true">✧</span> Explore 15 Bulk Bots
            </Link>
            <a className="senfxHeroSubtle" href="#how-it-works">Explore how it works <span aria-hidden="true">↓</span></a>
          </div>
          <p className="senfxDerivSignup">
            New to Deriv?{" "}
            <a href="https://home.deriv.com/dashboard/signup" target="_blank" rel="noopener noreferrer">
              Create your Deriv account <span aria-hidden="true">↗</span>
            </a>{" "}
            <span>on the official Deriv website.</span>
          </p>
        </div>

        <div className="senfxLandingBottom">
          <details className="senfxRiskDetails">
            <summary><span aria-hidden="true">⚠</span> Risk disclaimer</summary>
            <p>
              Trading involves risk and can result in losses. The candles in this
              background are illustrative, not live prices or signals. Demo
              balances are virtual funds. Trade Scheme FX is independent of Deriv
              and does not guarantee profits or market outcomes.
            </p>
          </details>
          <div className="senfxLandingTiles" aria-label="Workspace information">
            <div><strong>Free</strong><small>WORKSPACE ACCESS</small></div>
            <div><strong>24/7</strong><small>SYNTHETIC MARKET FOCUS</small></div>
            <div><strong>tradesche.com</strong><small>OFFICIAL SENFX WEBSITE</small></div>
            <div><strong><span className="senfxTileDot" /> Demo</strong><small>LEARN WITH VIRTUAL FUNDS</small></div>
          </div>
          <small className="senfxArtworkNote">Decorative candles · Not a live trading chart</small>
        </div>
      </section>

    </main>
  );
}
