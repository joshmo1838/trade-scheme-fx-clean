/**
 * Decorative candlestick artwork, based on the user's screen recording.
 * Not a live feed, a forecast, or a record of trades.
 * SVG paints immediately without a remote image or chart library.
 */
const leftPrices = [412,439,408,394,380,398,366,353,338,358,332,344,367,356,378,382,407,386,418,405,422,411,438];
const rightPrices = [446,460,434,442,418,408,390,402,375,367,387,351,337,363,325,301,332,291,306,282,254,275,238,220,233,194];

function CandleGroup({ prices, startX, step, prominence }: {
  prices: number[]; startX: number; step: number; prominence: string;
}) {
  return (
    <g className={prominence}>
      {prices.map((close, index) => {
        const open = index === 0 ? close + 18 : prices[index - 1];
        const rising = close < open;
        const high = Math.min(open, close) - (10 + (index % 4) * 5);
        const low = Math.max(open, close) + (8 + (index % 3) * 4);
        const x = startX + index * step;
        const top = Math.min(open, close);
        const height = Math.max(8, Math.abs(close - open));
        const color = rising ? "#11dba3" : "#f01d78";
        return (
          <g key={index} className={rising ? "senfxUpCandle" : "senfxDownCandle"}>
            <line x1={x + 8} x2={x + 8} y1={high} y2={low} stroke={color} strokeOpacity=".78" strokeWidth="1.6" />
            <rect x={x} y={top} width="16" height={height} rx="1" fill={color} />
          </g>
        );
      })}
    </g>
  );
}

export default function TradingLandingVisual() {
  return (
    <svg className="senfxMarketArt" viewBox="0 0 1440 600"
      preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="senfxCanvasFade" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#02162f" />
          <stop offset="47%" stopColor="#050a25" />
          <stop offset="100%" stopColor="#10042a" />
        </linearGradient>
        <linearGradient id="senfxBlueLine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#008de8" stopOpacity=".35" />
          <stop offset="38%" stopColor="#4222f3" stopOpacity=".9" />
          <stop offset="75%" stopColor="#0069f3" stopOpacity=".65" />
          <stop offset="100%" stopColor="#8f0eff" stopOpacity=".4" />
        </linearGradient>
        <linearGradient id="senfxSignalLine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00d9de" />
          <stop offset="30%" stopColor="#ff197e" />
          <stop offset="58%" stopColor="#a113fa" stopOpacity=".2" />
          <stop offset="82%" stopColor="#e21b85" />
          <stop offset="100%" stopColor="#03e7d8" />
        </linearGradient>
        <linearGradient id="senfxHorizon" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#eb1184" stopOpacity=".6" />
          <stop offset="25%" stopColor="#0055ff" stopOpacity=".45" />
          <stop offset="55%" stopColor="#07d5fa" stopOpacity=".7" />
          <stop offset="85%" stopColor="#09d6a5" stopOpacity=".7" />
          <stop offset="100%" stopColor="#00b8d1" stopOpacity=".9" />
        </linearGradient>
        <radialGradient id="senfxAura">
          <stop offset="0%" stopColor="#092e8d" stopOpacity=".38" />
          <stop offset="100%" stopColor="#080525" stopOpacity="0" />
        </radialGradient>
        <filter id="senfxGlow" x="-60%" y="-200%" width="220%" height="500%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <pattern id="senfxChartGrid" width="55" height="55" patternUnits="userSpaceOnUse">
          <path d="M55 0H0V55" fill="none" stroke="#2d59a3" strokeOpacity=".11" strokeWidth=".8" />
        </pattern>
      </defs>
      <rect width="1440" height="600" fill="url(#senfxCanvasFade)" />
      <rect width="1440" height="550" fill="url(#senfxChartGrid)" />
      <ellipse cx="630" cy="275" rx="720" ry="370" fill="url(#senfxAura)" />
      <ellipse cx="1310" cy="70" rx="380" ry="150" fill="#640c9f" opacity=".09" />
      <g fill="none" strokeWidth="1.25">
        <path d="M-120 198C96 5 200 63 359 186S622 344 827 220 1148 91 1560 29" stroke="url(#senfxBlueLine)" opacity=".42"/>
        <path d="M-60 225C110 57 228 106 395 223S653 337 851 260 1098 205 1482 55" stroke="#0f57ee" opacity=".3"/>
        <path d="M-90 284C145 89 270 170 406 239S646 289 777 320 1067 215 1490 104" stroke="#6522f3" opacity=".32"/>
        <path d="M-200 130C99 78 231 162 424 260S633 314 814 240 1135 142 1548 150" stroke="#0ba6fd" opacity=".16"/>
      </g>
      <g className="senfxMarketCandleScene">
        <CandleGroup prices={leftPrices} startX={-15} step={22} prominence="senfxLeftCandles" />
        <CandleGroup prices={rightPrices} startX={844} step={24} prominence="senfxRightCandles" />
        <g fill="#0887ef" opacity=".28">
          {Array.from({ length: 70 }, (_, i) => {
            const h = 12 + Math.round(Math.abs(Math.sin(i * 0.43) * 53));
            return <rect key={i} x={i * 21 - 5} y={505 - h} width="9" height={h} rx="1" />;
          })}
        </g>
      </g>
      <path d="M-30 398C20 417 65 478 120 449S211 387 266 421 368 450 427 400 527 420 600 449 716 433 778 469 864 451 908 433 976 467 1043 394 1122 402 1169 410 1240 390 1300 399 1370 344 1480 358"
        fill="none" stroke="url(#senfxSignalLine)" strokeWidth="3" opacity=".2" filter="url(#senfxGlow)" />
      <path className="senfxSignal" d="M-30 398C20 417 65 478 120 449S211 387 266 421 368 450 427 400 527 420 600 449 716 433 778 469 864 451 908 433 976 467 1043 394 1122 402 1169 410 1240 390 1300 399 1370 344 1480 358"
        fill="none" stroke="url(#senfxSignalLine)" strokeWidth="1.5" opacity=".73" />
      <path d="M82 474L94 493H70Z" fill="#ff0b7d" opacity=".5"/>
      <path d="M196 309L208 288 220 309Z" fill="#04f5ad" opacity=".7"/>
      <path d="M1283 255L1295 232 1307 255Z" fill="#02f5a2" opacity=".55"/>
      <path d="M1190 435L1202 457 1214 435Z" fill="#f80b73" opacity=".5"/>
      <g className="senfxFloor">
        {Array.from({ length: 17 }, (_, i) => {
          const x = i * 100 - 80;
          return <path key={i} d={"M" + x + " 599L" + (720 + (x - 720) * .15) + " 498"}
            fill="none" stroke="#1661bf" strokeOpacity=".2" strokeWidth="1" />;
        })}
        {[510,526,547,572,596].map(y =>
          <path key={y} d={"M0 " + y + "H1440"} fill="none" stroke="#1c55bb" strokeOpacity=".18" strokeWidth="1"/>
        )}
      </g>
      <rect x="0" y="497" width="1440" height="3" fill="url(#senfxHorizon)" opacity=".66" filter="url(#senfxGlow)" />
      <rect x="0" y="498" width="1440" height="1.4" fill="url(#senfxHorizon)" opacity=".55" />
      <g fill="#00aef4" opacity=".4">
        {Array.from({ length: 6 }, (_, i) =>
          Array.from({ length: 6 }, (_, j) =>
            <circle key={i * 10 + j} cx={17 + i * 17} cy={214 + j * 17} r="1.5" opacity={1 - j * .13}/>
          )
        )}
        {Array.from({ length: 5 }, (_, i) =>
          Array.from({ length: 7 }, (_, j) =>
            <circle key={100 + i * 10 + j} cx={1340 + i * 19} cy={54 + j * 20} r="1.8" opacity={1 - j * .09}/>
          )
        )}
      </g>
    </svg>
  );
}
