import {ema,mean,standardDeviation,lastDigit,expectedValue,type MarketTick} from './intelligence-engine';
import {STRATEGIES} from './strategies';
export type Signal={bot:string;kind:'RISE'|'FALL'|'EVEN'|'ODD'|'MATCH'|'DIFFER'|'SKIP';barrier?:number};
export function signals(t:MarketTick[]):Signal[]{
 const skip=()=>STRATEGIES.map(s=>({bot:s.name,kind:'SKIP' as const}));
 if(t.length<300)return skip();
 t=t.slice(-300); if(t.some((x,i)=>!Number.isFinite(x.quote)||x.quote<=0||x.symbol!==t[0].symbol||x.pip_size!==t[0].pip_size||(i>0&&x.epoch<=t[i-1].epoch)))return skip();
 if(t.some(x=>!Number.isSafeInteger(x.epoch)||x.epoch<=0||!Number.isInteger(x.pip_size)||x.pip_size<0||x.pip_size>12))return skip();
 const p=t.map(x=>x.quote), d=t.map(lastDigit), n=p.length, q=p[n-1], r=p.slice(1).map((x,i)=>Math.log(x/p[i])), sd=standardDeviation(r.slice(-60)), fast=ema(p,10),slow=ema(p,30),trend=fast-slow,mom=q-p[n-6], avg=mean(p.slice(-30)), z=(q-avg)/(standardDeviation(p.slice(-30))||1), hi=Math.max(...p.slice(-31,-1)),lo=Math.min(...p.slice(-31,-1)), accel=mom-(p[n-6]-p[n-11]);
 const dir=(x:number):Signal['kind']=>x>0?'RISE':x<0?'FALL':'SKIP';
 const counts=Array(10).fill(0) as number[];d.forEach(x=>counts[x]++);const parity=d.filter(x=>x%2===0).length;const last=d[n-1];const transitions=Array(10).fill(0) as number[];for(let i=1;i<n;i++)if(d[i-1]===last)transitions[d[i]]++;
 const vote=dir(trend)===dir(mom)?dir(trend):'SKIP';
 const kinds:Signal['kind'][]=[dir(trend),dir(mom),vote,Math.abs(z)>1.5?dir(-z):'SKIP',q>hi?'RISE':q<lo?'FALL':'SKIP',Math.abs(trend)/q>sd?dir(trend):'SKIP','DIFFER',vote,sd>0&&Math.abs(mean(r.slice(-20)))/sd>.2?dir(mom):'SKIP',Math.abs(z)>2&&dir(accel)===dir(-z)?dir(accel):'SKIP',parity===150?'SKIP':parity>150?'EVEN':'ODD',Math.abs(trend)/q<sd&&Math.abs(z)>1?dir(-z):'SKIP',vote,dir(accel),'MATCH',vote===dir(accel)?vote:'SKIP'];
 return STRATEGIES.map((s,i)=>({bot:s.name,kind:kinds[i],...(i===6?{barrier:counts.indexOf(Math.min(...counts))}:i===14?{barrier:transitions.indexOf(Math.max(...transitions))}:{})}));
}
export function outcome(s:Signal,previous:MarketTick,next:MarketTick):boolean|null{const d=lastDigit(next);switch(s.kind){case 'RISE':return next.quote>previous.quote;case 'FALL':return next.quote<previous.quote;case 'EVEN':return d%2===0;case 'ODD':return d%2===1;case 'MATCH':return d===s.barrier;case 'DIFFER':return d!==s.barrier;default:return null;}}
export function replay(ticks:MarketTick[]){const rows=STRATEGIES.map(s=>({bot:s.name,wins:0,losses:0,skips:0}));for(let i=300;i<ticks.length;i++){const prev=ticks[i-1],next=ticks[i];if(next.symbol!==prev.symbol||next.pip_size!==prev.pip_size||next.epoch<=prev.epoch)throw Error('Invalid replay sequence');signals(ticks.slice(i-300,i)).forEach((s,j)=>{const win=outcome(s,prev,next);if(win===null)rows[j].skips++;else if(win)rows[j].wins++;else rows[j].losses++;});}return rows.map(r=>({...r,winRate:r.wins+r.losses?r.wins/(r.wins+r.losses):null,validated:false,executionAuthorized:false}));}
export function quoteResearch(p:number,stake:number,payout:number,costs=0){return {...expectedValue(p,stake,payout,costs),probabilitySource:'user supplied; unvalidated',executionAuthorized:false};}
