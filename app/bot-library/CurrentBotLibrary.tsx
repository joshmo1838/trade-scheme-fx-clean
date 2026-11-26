import Link from 'next/link';
import QuantumBotCatalog from '@/app/dashboard/v4/QuantumBotCatalog';
import FifteenOriginalBotCatalog from './FifteenOriginalBotCatalog';

export default function CurrentBotLibrary(){
  return <main className="appShell">
    <header className="dashNav">
      <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
      <Link className="button secondary small" href="/dashboard">Dashboard</Link>
    </header>
    <section className="dashContent" style={{maxWidth:1500}}>
      <p className="eyebrow">CURRENT 4.0 SET · ORIGINAL 15 BOT REFERENCES</p>
      <h1>Trade Scheme FX bots</h1>
      <p className="muted">Browse the current 4.0 strategies and all 15 original SENFX profiles. Choose any bot to view its reference in the official Deriv DBot workspace.</p>
      <QuantumBotCatalog/>
      <FifteenOriginalBotCatalog/>
      <p className="disclaimer">The strategy references are research-only. They do not place Deriv orders, and DBot Run remains disabled. Real-money trading stays disabled.</p>
    </section>
  </main>;
}
