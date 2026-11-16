"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Tick = { price: number; epoch: number };
type Market = { symbol: string; label: string; group: string };
type Signal = { id: string; symbol: string; side: "BUY" | "SELL" | "WAIT"; reason: string; time: string; price: number; strength: number };

const MARKETS: Market[] = [
  { symbol: "R_10", label: "Volatility 10", group: "SYNTHETIC" },
  { symbol: "R_25", label: "Volatility 25", group: "SYNTHETIC" },
  { symbol: "R_50", label: "Volatility 50", group: "SYNTHETIC" },
  { symbol: "R_75", label: "Volatility 75", group: "SYNTHETIC" },
  { symbol: "R_100", label: "Volatility 100", group: "SYNTHETIC" },
];
const WATCH_KEY = "senfx-market-intelligence-watch-v1";
const ALERT_KEY = "senfx-market-intelligence-alert-v1";
const ema = (values: number[], period: number) => {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  return values.slice(1).reduce((prev, value) => prev + k * (value - prev), values[0]);
};
const rsi = (values: number[]) => {
  if (values.length < 15) return null;
  const changes = values.slice(-15).slice(1).map((v, i) => v - values.slice(-15)[i]);
  const gains = changes.reduce((s, v) => s + Math.max(v, 0), 0) / 14;
  const losses = changes.reduce((s, v) => s + Math.max(-v, 0), 0) / 14;
  return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
};
const fmt = (v: number | null) => v === null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 4 });

export default function MarketIntelligence() {
  const [ticks, setTicks] = useState<Record<string, Tick[]>>({});
  const [connection, setConnection] = useState("CONNECTING");
  const [watch, setWatch] = useState<string[]>(["R_100", "R_75", "R_50"]);
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [priceAlertMarket, setPriceAlertMarket] = useState("R_100");
  const [priceTarget, setPriceTarget] = useState("");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [selected, setSelected] = useState("R_100");
  const socketRef = useRef<WebSocket | null>(null);
  const previousRef = useRef<Record<string, string>>({});
  const previousPriceRef = useRef<Record<string, number>>({});

  useEffect(() => {
    try {
      const savedWatch = localStorage.getItem(WATCH_KEY);
      const savedAlert = localStorage.getItem(ALERT_KEY);
      if (savedWatch) setWatch(JSON.parse(savedWatch));
      if (savedAlert) setAlertEnabled(savedAlert === "true");
    } catch { /* Keep safe defaults if browser storage is unavailable. */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(WATCH_KEY, JSON.stringify(watch));
  }, [watch]);
  useEffect(() => {
    localStorage.setItem(ALERT_KEY, String(alertEnabled));
  }, [alertEnabled]);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let timer: number | undefined;
    let retries = 0;
    const connect = () => {
      if (!active) return;
      setConnection("CONNECTING");
      try {
        socket = new WebSocket("wss://api.derivws.com/trading/v1/options/ws/public");
        socketRef.current = socket;
      } catch {
        setConnection("UNAVAILABLE");
        retry();
        return;
      }
      socket.onopen = () => {
        if (!active || !socket) return;
        retries = 0;
        setConnection("CONNECTED · WAITING FOR TICKS");
        MARKETS.forEach((market, index) => socket!.send(JSON.stringify({ ticks: market.symbol, subscribe: 1, req_id: index + 1 })));
      };
      socket.onmessage = (event) => {
        if (!active) return;
        try {
          const message = JSON.parse(event.data);
          if (message.error) {
            setConnection("FEED ERROR");
            return;
          }
          if (message.msg_type !== "tick" || !message.tick) return;
          const symbol = String(message.tick.symbol || "");
          const price = Number(message.tick.quote);
          const epoch = Number(message.tick.epoch);
          if (!MARKETS.some(m => m.symbol === symbol) || !Number.isFinite(price) || !Number.isFinite(epoch)) return;
          setTicks(current => {
            const history = [...(current[symbol] || []), { price, epoch }].slice(-240);
            return { ...current, [symbol]: history };
          });
          setConnection("LIVE MARKET DATA");
        } catch { /* Ignore malformed stream messages. */ }
      };
      socket.onerror = () => { if (active) setConnection("RECONNECTING"); };
      socket.onclose = () => { if (active) { setConnection("RECONNECTING"); retry(); } };
    };
    const retry = () => {
      if (!active || timer !== undefined) return;
      retries += 1;
      timer = window.setTimeout(() => { timer = undefined; connect(); }, Math.min(30000, 1500 * 2 ** Math.min(retries, 4)));
    };
    connect();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      if (socket) {
        socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null;
        socket.close();
      }
      socketRef.current = null;
    };
  }, []);

  const analytics = useMemo(() => {
    return Object.fromEntries(MARKETS.map(market => {
      const values = (ticks[market.symbol] || []).map(t => t.price);
      const fast = ema(values, 9);
      const slow = ema(values, 21);
      const strength = rsi(values);
      let side: Signal["side"] = "WAIT";
      let reason = values.length < 21 ? "Collecting enough live ticks" : "No confirmed EMA alignment";
      if (fast !== null && slow !== null && strength !== null) {
        if (fast > slow && strength >= 50 && strength < 70) { side = "BUY"; reason = "EMA 9 above EMA 21; RSI confirms positive momentum"; }
        else if (fast < slow && strength <= 50 && strength > 30) { side = "SELL"; reason = "EMA 9 below EMA 21; RSI confirms negative momentum"; }
        else reason = strength >= 70 ? "Momentum is elevated; wait for a reset" : strength <= 30 ? "Momentum is depressed; wait for a reset" : "Indicators are mixed; no setup";
      }
      return [market.symbol, { price: values.length ? values[values.length - 1] : null, fast, slow, rsi: strength, side, reason, values }];
    }));
  }, [ticks]);

  useEffect(() => {
    MARKETS.forEach(market => {
      const a = analytics[market.symbol];
      if (!a || a.side === "WAIT" || a.price === null) return;
      const key = market.symbol + ":" + a.side;
      if (previousRef.current[market.symbol] === key) return;
      previousRef.current[market.symbol] = key;
      const signal: Signal = { id: key + ":" + Date.now(), symbol: market.symbol, side: a.side, reason: a.reason, time: new Date().toLocaleTimeString(), price: a.price, strength: a.rsi ?? 0 };
      setSignals(current => [signal, ...current].slice(0, 30));
      if (alertEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("SENFX paper signal", { body: market.label + " " + a.side + " · " + fmt(a.price) });
      }
    });
  }, [analytics, alertEnabled]);

  const current = analytics[selected];
  useEffect(() => {
    MARKETS.forEach(market => {
      const price = analytics[market.symbol]?.price;
      if (price === null || price === undefined) return;
      const previous = previousPriceRef.current[market.symbol];
      previousPriceRef.current[market.symbol] = price;
      const target = Number(priceTarget);
      if (!alertEnabled || market.symbol !== priceAlertMarket || !Number.isFinite(target) || target <= 0 || previous === undefined) return;
      if ((previous < target && price >= target) || (previous > target && price <= target)) {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("SENFX price alert", { body: market.label + " crossed " + fmt(target) + " · latest " + fmt(price) });
        }
      }
    });
  }, [analytics, alertEnabled, priceAlertMarket, priceTarget]);

  const chartValues: number[] = current?.values || [];
  const min = chartValues.length ? Math.min(...chartValues) : 0;
  const max = chartValues.length ? Math.max(...chartValues) : 1;
  const points = chartValues.slice(-80).map((v, i, arr) => {
    const x = arr.length <= 1 ? 0 : (i / (arr.length - 1)) * 100;
    const y = 94 - ((v - min) / (max - min || 1)) * 84;
    return x + "," + y;
  }).join(" ");

  const toggleWatch = (symbol: string) => setWatch(current => current.includes(symbol) ? current.filter(s => s !== symbol) : [...current, symbol]);
  const enableAlerts = async () => {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setAlertEnabled(permission === "granted");
  };

  return (
    <main className="miShell">
      <header className="miTop"><Link href="/dashboard" className="miBrand">TRADE SCHEME <b>FX</b></Link><nav><Link href="/dashboard">Dashboard</Link><Link href="/markets">Markets</Link><Link href="/builder">Bot Builder</Link></nav></header>
      <div className="miContent">
        <section className="miHero"><div><span className="miEyebrow">SENFX INTELLIGENCE SUITE</span><h1>Market <em>Intelligence</em></h1><p>Live synthetic-market monitoring, technical context and transparent paper-only signals.</p></div><span className={connection === "LIVE MARKET DATA" ? "miConnection live" : "miConnection"}>● {connection}</span></section>
        <div className="miNotice"><b>Research and paper signals only.</b> These indicator rules are educational examples, not financial advice or guaranteed predictions. No orders are placed and no real or demo account funds are used.</div>
        <section className="miGrid">
          <article className="miPanel miWatchPanel"><div className="miPanelHead"><div><span className="miEyebrow">YOUR MARKETS</span><h2>Watchlist</h2></div><span className="miCount">{watch.length} saved</span></div>
            {MARKETS.map(m => { const a = analytics[m.symbol]; return <div className={selected === m.symbol ? "miMarket selected" : "miMarket"} key={m.symbol}><button className="miSelectMarket" onClick={() => setSelected(m.symbol)}><b>{m.label}</b><small>{m.symbol}</small></button><span className="miMarketPrice">{fmt(a?.price ?? null)}</span><button className={watch.includes(m.symbol) ? "miStar active" : "miStar"} onClick={() => toggleWatch(m.symbol)} aria-label={watch.includes(m.symbol) ? "Remove from watchlist" : "Add to watchlist"}>{watch.includes(m.symbol) ? "★" : "☆"}</button></div>; })}
            <p className="miFoot">Watchlist is saved in this browser on this device.</p>
          </article>
          <article className="miPanel miChartPanel"><div className="miPanelHead"><div><span className="miEyebrow">LIVE TICK CHART</span><h2>{MARKETS.find(m => m.symbol === selected)?.label}</h2></div><span className="miLiveTag">{(ticks[selected] || []).length} ticks</span></div>
            <div className="miChartMeta"><strong>{fmt(current?.price ?? null)}</strong><span>{current?.price === null || current?.price === undefined ? "Waiting for live data" : "Latest public tick"}</span></div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Recent live tick price chart"><line x1="0" y1="94" x2="100" y2="94" stroke="rgba(145,184,215,.2)" strokeWidth=".5"/><line x1="0" y1="50" x2="100" y2="50" stroke="rgba(145,184,215,.12)" strokeWidth=".5"/>{points && <polyline points={points} fill="none" stroke="#58d4f4" strokeWidth="1.6" vectorEffect="non-scaling-stroke"/>}</svg>
            <div className="miChartFoot"><span>Recent 80 ticks</span><span>Source: Deriv public feed</span></div>
          </article>
          <article className="miPanel miIndicatorPanel"><div className="miPanelHead"><div><span className="miEyebrow">TECHNICAL SNAPSHOT</span><h2>Indicators</h2></div><span className="miLiveTag">LIVE CALC</span></div>
            <div className="miIndicator"><span>EMA 9</span><b>{fmt(current?.fast ?? null)}</b></div><div className="miIndicator"><span>EMA 21</span><b>{fmt(current?.slow ?? null)}</b></div><div className="miIndicator"><span>RSI (14)</span><b>{current?.rsi === null || current?.rsi === undefined ? "—" : current.rsi.toFixed(1)}</b></div>
            <div className="miSignalBox"><small>RULE-BASED READ</small><strong className={current?.side === "BUY" ? "buy" : current?.side === "SELL" ? "sell" : ""}>{current?.side || "WAIT"}</strong><p>{current?.reason || "Waiting for data"}</p></div>
          </article>
        </section>
        <section className="miLowerGrid">
          <article className="miPanel"><div className="miPanelHead"><div><span className="miEyebrow">RULE-BASED SCANNER</span><h2>Signal scanner</h2></div><span className="miCount">No execution</span></div>
            <div className="miTableWrap"><table className="miTable"><thead><tr><th>Market</th><th>Signal</th><th>RSI</th><th>Latest</th><th>Reason</th></tr></thead><tbody>{MARKETS.map(m => { const a = analytics[m.symbol]; return <tr key={m.symbol}><td><b>{m.label}</b><small>{m.symbol}</small></td><td><span className={a?.side === "BUY" ? "miBadge buy" : a?.side === "SELL" ? "miBadge sell" : "miBadge"}>{a?.side || "WAIT"}</span></td><td>{a?.rsi == null ? "—" : a.rsi.toFixed(1)}</td><td>{fmt(a?.price ?? null)}</td><td>{a?.reason || "Waiting for ticks"}</td></tr>; })}</tbody></table></div>
          </article>
          <article className="miPanel"><div className="miPanelHead"><div><span className="miEyebrow">ALERT PREFERENCES</span><h2>Price & signal alerts</h2></div></div>
            <p className="miAlertText">Set a price level and receive a browser notification when the selected market crosses it. Signal notifications are also included. Your browser may ask permission.</p>
            <label className="miAlertField">Market<select value={priceAlertMarket} onChange={e => setPriceAlertMarket(e.target.value)}>{MARKETS.map(m => <option key={m.symbol} value={m.symbol}>{m.label}</option>)}</select></label>
            <label className="miAlertField">Price level<input type="number" min="0" step="any" value={priceTarget} onChange={e => setPriceTarget(e.target.value)} placeholder="Enter target price"/></label>
            <button className="miButton" onClick={enableAlerts}>{alertEnabled ? "Notifications enabled" : "Enable signal notifications"}</button>
            <label className="miCheck"><input type="checkbox" checked={alertEnabled} onChange={e => e.target.checked ? void enableAlerts() : setAlertEnabled(false)}/> Notify me about new rule-based signals</label>
            <p className="miFoot">Notifications require browser permission and this page to remain open. No email or SMS alerts are sent.</p>
          </article>
        </section>
        <section className="miPanel miHistory"><div className="miPanelHead"><div><span className="miEyebrow">RECENT DETECTIONS</span><h2>Signal history</h2></div><span className="miCount">{signals.length} this session</span></div>
          {signals.length === 0 ? <p className="miFoot">No signals detected yet. The scanner needs enough live ticks to calculate indicators.</p> : <div className="miSignalHistory">{signals.map(signal => <div key={signal.id}><span className={signal.side === "BUY" ? "miBadge buy" : "miBadge sell"}>{signal.side}</span><b>{MARKETS.find(m => m.symbol === signal.symbol)?.label}</b><span>{fmt(signal.price)}</span><span>RSI {signal.strength.toFixed(1)}</span><small>{signal.time} · {signal.reason}</small></div>)}</div>}
        </section>
        <footer className="miFooter">SENFX Market Intelligence · Public tick data where available · Signals are analytical examples, not trade instructions.</footer>
      </div>
    </main>
  );
}
