"use client";

import { useEffect, useState } from "react";

type Quote = {
  symbol: string;
  price: number | null;
  change: number | null;
  source: string;
};

type SyntheticTick = {
  price: number;
  epoch: number;
};

const groups = [
  { title: "MAJOR FOREX", symbols: ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD"] },
  { title: "METALS", symbols: ["XAU/USD", "XAG/USD"] },
  { title: "CRYPTO & INDICES", symbols: ["BTC/USD", "ETH/USD", "NAS100", "US30", "SPX500"] },
  { title: "DERIV SYNTHETIC INDICES", symbols: ["Volatility 10", "Volatility 25", "Volatility 50", "Volatility 75", "Volatility 100"] },
];

// This is a public Deriv application ID. It is not an account token.
const DERIV_APP_ID = "34SBwLGAx9IL6eEDUQ39T";
const DERIV_SYMBOL = "R_100";

export default function MarketsPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [live, setLive] = useState(false);
  const [updated, setUpdated] = useState("");
  const [syntheticTick, setSyntheticTick] = useState<SyntheticTick | null>(null);
  const [syntheticStatus, setSyntheticStatus] = useState("CONNECTING TO DERIV");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/markets", { cache: "no-store" });
        const data = await response.json();
        if (active) {
          setQuotes(data.quotes || []);
          setLive(Boolean(data.live));
          setUpdated(data.updatedAt || "");
        }
      } catch {
        if (active) setLive(false);
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 60000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let attempts = 0;

    const connect = () => {
      if (!active) return;
      setSyntheticStatus("CONNECTING TO DERIV");

      try {
        socket = new WebSocket(
          `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`
        );
      } catch {
        setSyntheticStatus("FEED UNAVAILABLE");
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        if (!active || !socket) return;
        attempts = 0;
        socket.send(JSON.stringify({ ticks: DERIV_SYMBOL, subscribe: 1 }));
      };

      socket.onmessage = (event) => {
        if (!active) return;
        try {
          const message = JSON.parse(event.data);
          if (message.error) {
            setSyntheticStatus("FEED UNAVAILABLE");
            return;
          }
          if (message.msg_type === "tick" && message.tick?.symbol === DERIV_SYMBOL) {
            const price = Number(message.tick.quote);
            const epoch = Number(message.tick.epoch);
            if (Number.isFinite(price) && Number.isFinite(epoch)) {
              setSyntheticTick({ price, epoch });
              setSyntheticStatus("LIVE DERIV TICKS");
            }
          }
        } catch {
          // Ignore malformed messages and keep the connection alive.
        }
      };

      socket.onerror = () => {
        if (active) setSyntheticStatus("RECONNECTING");
      };

      socket.onclose = () => {
        if (!active) return;
        setSyntheticStatus("RECONNECTING");
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (!active || reconnectTimer !== undefined) return;
      attempts += 1;
      const delay = Math.min(30000, 2000 * 2 ** Math.min(attempts, 4));
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, []);

  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const feedLive = live || syntheticTick !== null;

  return (
    <main className="appShell marketPage">
      <nav className="dashNav">
        <a className="brand" href="/">TRADE SCHEME <span>FX</span></a>
        <div className="navlinks">
          <a href="/dashboard">Dashboard</a>
          <a href="/bots">Bots</a>
          <a href="/markets">Markets</a>
        </div>
      </nav>

      <div className="dashContent">
        <div className="marketHero">
          <div>
            <div className="eyebrow">GLOBAL MARKET TERMINAL</div>
            <h1>Market <span>Watch</span></h1>
            <p className="muted">Track forex, metals, crypto, indices and Deriv synthetic markets in one place.</p>
          </div>
          <div className={feedLive ? "marketStatus isLive" : "marketStatus"}>
            <i />
            {feedLive ? "LIVE DATA CONNECTED" : "DATA FEED NOT CONNECTED"}
          </div>
        </div>

        <div className="marketSummary">
          <div><small>MARKET COVERAGE</small><strong>GLOBAL</strong></div>
          <div><small>FOREX REFRESH</small><strong>60 SECONDS</strong></div>
          <div><small>LAST FOREX UPDATE</small><strong>{updated ? new Date(updated).toLocaleTimeString() : "—"}</strong></div>
        </div>

        <section className="marketGroup">
          <div className="adminSectionHead">
            <div>
              <div className="eyebrow">LIVE DERIV MARKET DATA</div>
              <h2>VOLATILITY 100 INDEX</h2>
            </div>
            <span className={syntheticTick ? "statusText" : "muted"}>{syntheticStatus}</span>
          </div>
          <article className="marketCard">
            <div className="marketCardTop">
              <span className="marketIcon">↗</span>
              <span className="marketPair">Volatility 100 · {DERIV_SYMBOL}</span>
            </div>
            <div className="marketValue">
              {syntheticTick ? syntheticTick.price.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "— — —"}
            </div>
            <div className="marketCardBottom">
              <span>{syntheticTick ? `Tick time: ${new Date(syntheticTick.epoch * 1000).toLocaleTimeString()}` : "Waiting for first Deriv tick"}</span>
              <b className={syntheticTick ? "positive" : ""}>{syntheticTick ? "LIVE PRICE" : "NO LIVE PRICE"}</b>
            </div>
          </article>
        </section>

        {groups.map((group) => (
          <section className="marketGroup" key={group.title}>
            <div className="adminSectionHead">
              <div><div className="eyebrow">TRADE SCHEME FX</div><h2>{group.title}</h2></div>
            </div>
            <div className="marketGrid">
              {group.symbols.map((symbol, index) => {
                const quote = quoteMap.get(symbol);
                const hasPrice = quote?.price !== null && quote?.price !== undefined;
                return (
                  <article className="marketCard" key={symbol}>
                    <div className="marketCardTop">
                      <span className="marketIcon">↗</span>
                      <span className="marketPair">{symbol}</span>
                      <span className="marketSpark">
                        {[18, 26, 14, 32, 23, 38, 29, 44, 35, 51, 41, 58].map((height, i) => (
                          <i key={i} style={{ height: `${height + ((index * 3 + i) % 9)}px` }} />
                        ))}
                      </span>
                    </div>
                    <div className="marketValue">
                      {hasPrice ? quote!.price!.toLocaleString("en-US", { maximumFractionDigits: symbol.includes("JPY") ? 3 : 5 }) : "— — —"}
                    </div>
                    <div className="marketCardBottom">
                      <span>{hasPrice ? "Provider quote" : "Feed not connected"}</span>
                      <b className={quote?.change == null ? "" : quote.change >= 0 ? "positive" : "negative"}>
                        {quote?.change == null ? "Awaiting data" : `${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(2)}%`}
                      </b>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        <div className="notice marketNotice">
          Volatility 100 is streamed directly from Deriv using public tick data. The feed is for informational and internal simulation use only; it does not place trades. Other synthetic index cards remain placeholders until their feeds are connected. Prices may change rapidly and are not investment advice.
        </div>
      </div>
    </main>
  );
}
