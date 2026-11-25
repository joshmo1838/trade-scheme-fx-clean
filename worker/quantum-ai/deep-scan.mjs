export const windows=[30,180,600,1800,5400,86400,604800,2592000];
export function deepScan(raw,now=Date.now(),cadence=2){
 const ticks=[...new Map(raw.filter(t=>Number.isSafeInteger(t.epoch)&&Number.isInteger(t.digit)&&t.digit>=0&&t.digit<=9&&t.epoch*1000<=now).map(t=>[t.epoch,t])).values()].sort((a,b)=>a.epoch-b.epoch);
 const last=ticks.at(-1);if(!last||now-last.epoch*1000>15000)return {decision:'NO ENTRY',reason:'Stale feed',executionAuthorized:false};
 const reports=windows.map(seconds=>{
 const a=ticks.filter(t=>t.epoch>last.epoch-seconds),counts=Array(10).fill(0),trans=Array.from({length:10},()=>Array(10).fill(0));
 let loss=0,n=0,scored=0,prev=null,baseLoss=0,brier=0;const split=Math.floor(a.length*.7);
 const predict=()=>{const row=prev===null?Array(10).fill(0):trans[prev],total=row.reduce((s,v)=>s+v,0);return counts.map((v,i)=>.5*(v+10)/(n+100)+.5*(row[i]+10)/(total+100));};
 for(const t of a){const p=predict();if(n>=split){loss-=Math.log(p[t.digit]);baseLoss+=Math.log(10);brier+=p.reduce((s,v,i)=>s+(v-(i===t.digit?1:0))**2,0);scored++;}counts[t.digit]++;if(prev!==null)trans[prev][t.digit]++;prev=t.digit;n++;}
 const coverage=Math.min(1,n*cadence/seconds);
 return {seconds,n,coverage,scored,loss:scored?loss/scored:null,baseline:scored?baseLoss/scored:null,brier:scored?brier/scored:null,p:predict()};
 });
 const eligible=reports.filter(r=>r.scored>=100&&r.coverage>=.9);
 const weights=eligible.map(r=>Math.max(0,r.baseline-r.loss));
 const sum=weights.reduce((a,b)=>a+b,0);
 const probabilities=Array.from({length:10},(_,i)=>sum?eligible.reduce((a,r,j)=>a+r.p[i]*weights[j],0)/sum:.1);
 return {decision:'NO ENTRY',reason:'Final independent ensemble validation and current contract payout not verified',probabilities,windows:reports.map(({p,...r})=>r),freshnessMs:now-last.epoch*1000,executionAuthorized:false};
}
