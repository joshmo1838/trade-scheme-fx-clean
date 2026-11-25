import {FIFTEEN_BOTS,predictFifteenBot} from '../../lib/bots/fifteen-paper-bots.ts';
export const MIN_INTERVAL_MS=30000;
export function createResearchDistributor(){
 const last=new Map();
 return function distribute(symbol,ticks,scan,now=Date.now()){
  if(!Number.isFinite(now)||now-(last.get(symbol)??-Infinity)<MIN_INTERVAL_MS)return null;
  last.set(symbol,now);
  const sample=ticks.slice(-300);
  const fresh=sample.length===300&&sample.every((t,i)=>Number.isSafeInteger(t.epoch)&&(!i||t.epoch>sample[i-1].epoch))&&now-sample.at(-1).epoch*1000>=0&&now-sample.at(-1).epoch*1000<=15000;
  const history=fresh?sample.map(t=>({symbol,price:t.quote,pipSize:t.pip_size,epoch:t.epoch,digit:t.digit,quoteText:t.quote.toFixed(t.pip_size),tickId:null})):[];
  const p=scan?.probabilities;
  const valid=Array.isArray(p)&&p.length===10&&p.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-6;
  return FIFTEEN_BOTS.filter(b=>b.market===symbol).map(b=>{
   const signal=fresh?predictFifteenBot(b,history):null;
   let estimate=null;
   if(signal?.kind==='digit'&&valid)estimate=p.reduce((sum,v,d)=>sum+((({OVER:d>signal.barrier,UNDER:d<signal.barrier,EVEN:d%2===0,ODD:d%2===1,MATCHES:d===signal.barrier,DIFFERS:d!==signal.barrier})[signal.prediction])?v:0),0);
   return {bot:b.name,botId:b.id,market:symbol,mode:'RESEARCH',decision:'SKIP',reason:!fresh?'300 fresh ordered ticks required':!signal?'Original strategy has no eligible hypothesis':signal.kind==='direction'?'Digit model cannot validate price direction':'Independent validation and payout required',signal,estimate,analysisAt:now,executionAuthorized:false};
  });
 };
}
