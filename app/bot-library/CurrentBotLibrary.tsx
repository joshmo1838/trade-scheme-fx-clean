import Link from 'next/link';
import QuantumBotCatalog from '@/app/dashboard/v4/QuantumBotCatalog';

export default function CurrentBotLibrary(){
  return <main className="appShell">
    <header className="dashNav">
      <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
      <Link className="button secondary small" href="/dashboard">Dashboard</Link>
    </header>
    <section className="dashContent" style={{maxWidth:1500}}>
      <p className="eyebrow">CURRENT 4.0 STRATEGIES</p>
      <h1>Trade Scheme FX bots</h1>
      <p className="muted">Browse the 16 current 4.0 research strategies. Choose a bot to view its rule in Deriv DBot and configure its own draft stake, stop loss and profit target.</p>
      <QuantumBotCatalog/>
      <p className="disclaimer">The strategy references are research-only. They do not place Deriv orders, and DBot Run remains disabled. Real-money trading stays disabled.</p>
    </section>
  </main>;
}
