/**
 * SENFX Digit Matrix — public-tick, observation-only digit statistics.
 * No Deriv broker order/proposal token, backtest profits or buy signals.
 * The quote must be padded to tick.pip_size before taking its last digit.
 */
export const DIGIT_MATRIX_NAME = "SENFX Digit Matrix";
export const DIGIT_MARKETS = [
  {symbol:"R_10",label:"Volatility 10"},
  {symbol:"R_25",label:"Volatility 25"},
  {symbol:"R_50",label:"Volatility 50"},
  {symbol:"R_75",label:"Volatility 75"},
  {symbol:"R_100",label:"Volatility 100"},
  {symbol:"1HZ10V",label:"Volatility 10 (1s)"},
  {symbol:"1HZ25V",label:"Volatility 25 (1s)"},
  {symbol:"1HZ50V",label:"Volatility 50 (1s)"},
  {symbol:"1HZ75V",label:"Volatility 75 (1s)"},
  {symbol:"1HZ100V",label:"Volatility 100 (1s)"},
] as const;
export type DigitSymbol = (typeof DIGIT_MARKETS)[number]["symbol"];
export const DIGIT_WINDOW = 160;
const MARKET_SET = new Set<string>(DIGIT_MARKETS.map(m=>m.symbol));

export type ObservedTick = {
  symbol:DigitSymbol;
  price:number;
  pipSize:number;
  epoch:number;
  digit:number;
  quoteText:string;
  tickId:string | null;
};
/** Do not parse the final digit from Number.toString(): it drops trailing zeros. */
export function lastDigitFromQuote(quote:unknown,pipSize:unknown):number|null {
  if(typeof quote!=="number" || !Number.isFinite(quote) || quote<=0 ||
     !Number.isSafeInteger(pipSize) || (pipSize as number)<0 ||
     (pipSize as number)>8 || quote>=1e13) return null;
  const fixed=quote.toFixed(pipSize as number);
  const code=fixed.charCodeAt(fixed.length-1)-48;
  return code>=0&&code<=9 ? code : null;
}
export function parsePublicDigitTick(
  raw:unknown,
  receivedAtMs:number,
):ObservedTick|null {
  if(!raw || typeof raw!=="object") return null;
  const msg=raw as {msg_type?:unknown;tick?:unknown;error?:unknown};
  if(msg.error || msg.msg_type!=="tick" || !msg.tick || typeof msg.tick!=="object")return null;
  const tick=msg.tick as Record<string,unknown>;
  if(typeof tick.symbol!=="string" || !MARKET_SET.has(tick.symbol))return null;
  const price=tick.quote;
  const pip=tick.pip_size;
  const digit=lastDigitFromQuote(price,pip);
  const epoch=tick.epoch;
  if(digit===null||!Number.isSafeInteger(epoch)||typeof epoch!=="number"||
    !Number.isFinite(receivedAtMs)||epoch<1||
    epoch*1000>receivedAtMs+5000||receivedAtMs-epoch*1000>30000)return null;
  return {
    symbol:tick.symbol as DigitSymbol,price:price as number,pipSize:pip as number,
    epoch,digit,quoteText:(price as number).toFixed(pip as number),
    tickId:typeof tick.id==="string"&&tick.id.length<=100 ? tick.id : null,
  };
}
export type DigitSummary = {
  samples:number;counts:number[];percentages:number[];lastDigit:number;
  oddPercent:number;evenPercent:number;entropyBits:number;
  mostFrequent:number;largestDeviationPct:number;
  ready:boolean;streak:number;
};
/**
 * Descriptive sample statistics. Does NOT estimate the next digit's
 * probability or imply a profitable edge. Even a "nonuniform" short sample
 * is subject to selection bias and multiple-market comparisons.
 */
export function summarizeDigits(input:readonly number[]):DigitSummary|null {
  const digits=input.slice(-DIGIT_WINDOW);
  if(!digits.length || digits.some(d=>!Number.isInteger(d)||d<0||d>9))return null;
  const counts=Array<number>(10).fill(0);
  digits.forEach(d=>{counts[d]++;});
  const n=digits.length;
  const percentages=counts.map(count=>count/n*100);
  const odd=counts[1]+counts[3]+counts[5]+counts[7]+counts[9];
  const entropyBits=counts.reduce((sum,count)=>{
    if(count===0)return sum;
    const p=count/n;
    return sum-p*Math.log2(p);
  },0);
  const mostFrequent=counts.indexOf(Math.max(...counts));
  const lastDigit=digits[n-1];
  let streak=0;
  for(let i=n-1;i>=0&&digits[i]===lastDigit;i--)streak++;
  return {
    samples:n,counts,percentages,lastDigit,
    oddPercent:odd/n*100,evenPercent:(n-odd)/n*100,
    entropyBits,mostFrequent,
    largestDeviationPct:Math.max(...percentages.map(v=>Math.abs(v-10))),
    ready:n>=80,streak,
  };
}
/** A transparent planner only; it never sends or queues an order. */
export function plannedExposure(stake:unknown,trades:unknown,dailyCap:unknown):{
  valid:boolean;total:number;withinCap:boolean;reason:string;
} {
  if(typeof stake!=="number"||!Number.isFinite(stake)||
     stake<10||stake>100||typeof trades!=="number"||
     !Number.isInteger(trades)||trades<1||trades>10||
     typeof dailyCap!=="number"||!Number.isFinite(dailyCap)||dailyCap<=0){
    return {valid:false,total:0,withinCap:false,reason:"Use $10–$100 per hypothetical trade, 1–10 trades, and a positive daily paper-risk cap."};
  }
  const total=Math.round(stake*trades*100)/100;
  const withinCap=total<=dailyCap;
  return {
    valid:true,total,withinCap,
    reason:withinCap?"Within the illustrative paper-risk budget. No order was placed.":
      "BLOCKED: full hypothetical stake exposure exceeds the daily paper-risk cap.",
  };
}
