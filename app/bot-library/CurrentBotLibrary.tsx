import Link from 'next/link';
import QuantumBotCatalog from '@/app/dashboard/v4/QuantumBotCatalog';

export default function CurrentBotLibrary(){
  return <main className="appShell">
    <header className="dashNav">
      <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
      <Link className="button secondary small" href="/dashboard">Dashboard</Link>
    </header>
    <section className="dashContent" style={{maxWidth:1500}}>
      <p className="eyebrow">CURRENT STRATEGY SET · VERSION 4.0</p>
      <h1>Trade Scheme FX bots</h1>
      <p className="muted">This library shows the current 4.0 strategies. Choose a strategy to view its reference in the official Deriv DBot workspace.</p>
      <QuantumBotCatalog/>
      <p className="disclaimer">The strategy references are research-only. They do not place Deriv orders, and DBot Run remains disabled. Real-money trading stays disabled.</p>
    </section>
  </main>;
}
