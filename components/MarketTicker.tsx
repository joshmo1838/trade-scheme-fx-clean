"use client";

import { useEffect, useState } from "react";

/**
 * Public synthetic market ticker. All values originate from Deriv public
 * streaming ticks. Percentage move is SINCE FIRST OBSERVED TICK in this
 * connection, NOT a daily market change or a trading signal.
 */
type Quote = {
  symbol: string;
  label: string;
  price: number | null;
  firstPrice: number | null;
};
const SYMBOLS = [
  { symbol: "R_10", label: "VOL 10" },
  { symbol: "R_25", label: "VOL 25" },
  { symbol: "R_50", label: "VOL 50" },
  { symbol: "R_75", label: "VOL 75" },
  { symbol: "R_100", label: "VOL 100" },
];

const INITIAL: Quote[] = SYMBOLS.map(item => ({
  ...item, price: null, firstPrice: null,
}));
const WS_URL = "wss://api.derivws.com/trading/v1/options/ws/public";

export default function MarketTicker() {
  const [quotes, setQuotes] = useState<Quote[]>(INITIAL);
  const [status, setStatus] = useState<"CONNECTING"|"LIVE"|"RECONNECTING"|"OFFLINE">("CONNECTING");

  useEffect(() => {
    let active = true;
    let ws: WebSocket | null = null;
    let timer: number | undefined;
    let attempts = 0;

    const reconnect = () => {
      if (!active || timer !== undefined) return;
      attempts += 1;
      const delay = Math.min(30000, 1500 * 2 ** Math.min(attempts, 4));
      setStatus("RECONNECTING");
      timer = window.setTimeout(() => {
        timer = undefined;
        connect();
      }, delay);
    };

    const connect = () => {
      if (!active) return;
      setStatus("CONNECTING");
      setQuotes(INITIAL);
      try {
        const socket = new WebSocket(WS_URL);
        ws = socket;
        const timeout = window.setTimeout(() => {
          if (active && socket.readyState !== WebSocket.OPEN) socket.close();
        }, 12000);
        socket.onopen = () => {
          window.clearTimeout(timeout);
          if (!active || ws !== socket) return;
          attempts = 0;
          for (const item of SYMBOLS) {
            socket.send(JSON.stringify({ ticks: item.symbol, subscribe: 1 }));
          }
        };
        socket.onmessage = event => {
          if (!active || ws !== socket) return;
          let message: any;
          try { message = JSON.parse(String(event.data)); } catch { return; }
          if (message.error) {
            // An unsupported symbol should not cause invented prices.
            setStatus("OFFLINE");
            socket.close();
            return;
          }
          if (message.msg_type !== "tick" || !message.tick) return;
          const symbol = String(message.tick.symbol || "");
          if (!SYMBOLS.some(item => item.symbol === symbol)) return;
          const price = Number(message.tick.quote);
          if (!Number.isFinite(price) || price <= 0) return;
          setQuotes(previous => previous.map(item => item.symbol === symbol
            ? { ...item, price, firstPrice: item.firstPrice ?? price }
            : item));
          setStatus("LIVE");
        };
        socket.onerror = () => {
          if (active && ws === socket) setStatus("OFFLINE");
        };
        socket.onclose = () => {
          window.clearTimeout(timeout);
          if (active && ws === socket) reconnect();
        };
      } catch {
        setStatus("OFFLINE");
        reconnect();
      }
    };

    connect();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      }
    };
  }, []);

  return (
    <div className="marketTicker" aria-label="Deriv synthetic market prices since connecting">
      <div className="tickerHead">
        <span className="tickerDot" />
        {status === "LIVE" ? "DERIV SYNTHETIC · LIVE" : "DERIV SYNTHETIC · " + status}
      </div>
      <div className="tickerViewport">
        <div className="tickerTrack">
          {[...quotes, ...quotes].map((q, index) => {
            const change = q.price !== null && q.firstPrice !== null && q.firstPrice > 0 ?
              (q.price - q.firstPrice) / q.firstPrice * 100 : null;
            return (
              <div className="tickerItem" key={q.symbol + index}>
                <strong>{q.label}</strong>
                <span className="tickerPrice">
                  {q.price === null ? "AWAITING TICK" :
                    q.price.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                </span>
                <span className={change === null ? "tickerChange neutral" :
                  change >= 0 ? "tickerChange up" : "tickerChange down"}
                  title="Observed change since the first public tick received in this browser connection, not a 24-hour return">
                  {status !== "LIVE" ? "FEED OFF" :
                    change === null ? "—" :
                    (change >= 0 ? "+" : "") + change.toFixed(3) + "%"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <a className="tickerMore" href="/markets">MARKETS ↗</a>
    </div>
  );
}
