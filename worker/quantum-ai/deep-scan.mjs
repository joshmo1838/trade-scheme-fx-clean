export const windows=[180,600,1800,5400,86400,604800,2592000];
export function deepScan(raw,now=Date.now()){
 const ticks=[...new Map(raw.filter(t=>Number.isSafeInteger(t.epoch)&&Number.isInteger(t.digit)&&t.digit>=0&&t.digit<=9&&t.epoch*1000<=now).map(t=>[t.epoch,t])).values()].sort((a,b)=>a.epoch-b.epoch);
 const last=ticks.at(-1);if(!last||now-last.epoch*1000>15000)return {decision:'NO ENTRY',reason:'Stale feed',executionAuthorized:false};
 const reports=windows.map(seconds=>{
 const a=ticks.filter(t=>t.epoch>last.epoch-seconds),counts=Array(10).fill(0);let loss=0,n=0;
 for(const t of a){const total=n+100;loss-=Math.log((counts[t.digit]+10)/total);counts[t.digit]++;n++;}
 return {seconds,n,coverage:a.length?(last.epoch-a[0].epoch)/seconds:0,loss:n?loss/n:null,p:counts.map(v=>(v+10)/(n+100))};
 });
 const eligible=reports.filter(r=>r.n>=90&&r.coverage>=.9);
 const weights=eligible.map(r=>Math.max(0,Math.log(10)-r.loss));
 const sum=weights.reduce((a,b)=>a+b,0);
 const probabilities=Array.from({length:10},(_,i)=>sum?eligible.reduce((a,r,j)=>a+r.p[i]*weights[j],0)/sum:.1);
 return {decision:'NO ENTRY',reason:'Independent holdout and current contract payout not verified',probabilities,windows:reports.map(({p,...r})=>r),freshnessMs:now-last.epoch*1000,executionAuthorized:false};
}
