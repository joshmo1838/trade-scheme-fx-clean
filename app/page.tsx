import Link from "next/link";
import MarketTicker from "@/components/MarketTicker";
import LandingHeadlines from "@/components/LandingHeadlines";
import TradingLandingVisual from "@/components/TradingLandingVisual";

const learningSteps = [
  {
    number: "01",
    title: "Create your free workspace",
    description: "Register with Trade Scheme FX to explore market tools, available bots and learning resources.",
  },
  {
    number: "02",
    title: "Connect your own Deriv account",
    description: "If you do not have Deriv, open its official signup page first. Your Deriv login stays with Deriv.",
  },
  {
    number: "03",
    title: "Practice on Demo",
    description: "Select your own Deriv Demo account and learn with its virtual funds once Demo trading is available.",
  },
];

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
            <Link className="senfxOutlineButton" href="/login">Log in</Link>
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
            <Link href="/login" className="senfxHeroPrimary">
              <span aria-hidden="true">↗</span> Log in to workspace <span aria-hidden="true">›</span>
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

      <section className="senfxLandingBelow" id="how-it-works">
        <div className="senfxBelowIntro">
          <p className="senfxSectionEyebrow">YOUR WORKSPACE, YOUR ACCOUNT</p>
          <h2>Built to help you learn with a clear process.</h2>
          <p>Explore the tools first. You stay in control of any account you connect, and Demo practice uses virtual funds from your own Deriv account.</p>
        </div>
        <div className="senfxLearningGrid">
          {learningSteps.map(step => (
            <article key={step.number} className="senfxLearningCard">
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="senfxLandingLearn" id="learn">
        <div>
          <p className="senfxSectionEyebrow">EXPLORE BEFORE YOU TRADE</p>
          <h2>Markets, bots and the tools behind each decision.</h2>
          <p>Review instruments and the existing strategy workspace without assuming that an automated strategy will be profitable.</p>
        </div>
        <div className="senfxLearnActions">
          <Link href="/markets" className="senfxOutlineButton">Explore markets ↗</Link>
          <Link href="/bot-library" className="senfxTopButton">Explore Bulk Bots ↗</Link>
        </div>
      </section>

      <section className="senfxLandingFaq" id="faq">
        <p className="senfxSectionEyebrow">FREQUENTLY ASKED QUESTIONS</p>
        <h2>Start with the basics.</h2>
        <details>
          <summary>Is Trade Scheme FX free?</summary>
          <p>Creating a Trade Scheme FX account and accessing its free workspace does not require a monthly platform membership fee.</p>
        </details>
        <details>
          <summary>Do I need a Deriv account?</summary>
          <p>You can browse the public workspace without one. To connect your Deriv Demo account for supported features, first create an account on Deriv&apos;s official website.</p>
        </details>
        <details>
          <summary>Are the homepage candles live market prices?</summary>
          <p>No. They are decorative illustrations based on the design reference. Market data is shown separately and only when a connected market data provider is available.</p>
        </details>
        <details>
          <summary>Can I use my own Deriv Demo balance?</summary>
          <p>The Demo trading integration is being tested. When available, eligible users will connect and select their own Demo account and practice with its virtual balance; no funds are transferred to SENFX.</p>
        </details>
      </section>

      <footer className="senfxLandingFooter">
        <strong>tradescheme <span>· Trade Scheme FX</span></strong>
        <p>© {new Date().getFullYear()} Trade Scheme FX. Independent market tools and education. Not endorsed by Deriv. No guaranteed returns. Demo features depend on integration readiness.</p>
        <div><Link href="/login">Log in</Link><Link href="/signup">Sign up</Link><Link href="/markets">Markets</Link></div>
      </footer>
    </main>
  );
}
