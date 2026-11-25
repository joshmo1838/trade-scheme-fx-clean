/**
 * SENFX read-only public Deriv quote audit.
 * This tool must never use user tokens, demo/real OTPs, buy/sell, or stored risk state.
 * Public proposal prices are informational: authenticated Demo eligibility may differ.
 */
import fs from "node:fs";
import {SENFX_DEMO_BOT_TEMPLATES, deriveDemoProposal} from "../lib/deriv/demo-bot-contracts.mjs";

const URL="wss://api.derivws.com/trading/v1/options/ws/public";
const stake=500;
const choices=new Map([
 ["digit-over-4",[["OVER",4]]],["digit-under-5",[["UNDER",5]]],
 ["parity-even",[["EVEN"]]],["parity-odd",[["ODD"]]],
 ["digit-matches",[["MATCHES",3]]],["digit-differs",[["DIFFERS",7]]],
 ["trend-rise-fall",[["RISE"],["FALL"]]],
 ["breakout-higher-lower",[["RISE"],["FALL"]]],
 ["recovery-audit",[["EVEN"]]],["stepwise-audit",[["OVER",4]]],
 ["adaptive-over",[["OVER",4]]],
 ["entropy-parity",[["EVEN"],["ODD"]]],
 // This is a price-only illustrative barrier; the actual bot observes a fresh last digit.
 ["pattern-differs",[["DIFFERS",7]]],
 ["momentum-rise-fall",[["RISE"],["FALL"]]],
 ["volatility-scalper",[["RISE"],["FALL"]]]
]);
const family=(name)=>
 name.startsWith("DIGITOVER")||name.startsWith("DIGITUNDER")?"Over/Under":
 name==="DIGITEVEN"||name==="DIGITODD"?"Even/Odd":
 name==="DIGITMATCH"||name==="DIGITDIFF"?"Matches/Differs":
 name==="CALL"||name==="PUT"?"Rise/Fall":"Other";

function round2(v){return Math.round(v*100)/100;}
const ws=new WebSocket(URL);
const pending=new Map();
let sequence=3000;
let ended=false;
let fatal=null;
const rejectAll=(why)=>{
 for(const [id,x] of pending){clearTimeout(x.timer);x.reject(Error(why));pending.delete(id);}
};
ws.addEventListener("message",(ev)=>{
 let msg;try{msg=JSON.parse(String(ev.data));}catch{return;}
 const item=pending.get(msg.req_id);
 if(!item)return;
 pending.delete(msg.req_id);clearTimeout(item.timer);
 msg.error?item.reject(Error(String(msg.error.code||msg.error.message||"BROKER_ERROR"))):item.resolve(msg);
});
ws.addEventListener("close",()=>{if(!ended){fatal="PUBLIC_WS_CLOSED";rejectAll(fatal);}});
ws.addEventListener("error",()=>{if(!ended){fatal="PUBLIC_WS_ERROR";rejectAll(fatal);}});
const connected=new Promise((resolve,reject)=>{
 const t=setTimeout(()=>reject(Error("PUBLIC_WS_OPEN_TIMEOUT")),15000);
 ws.addEventListener("open",()=>{clearTimeout(t);resolve();},{once:true});
 ws.addEventListener("error",()=>{clearTimeout(t);reject(Error("PUBLIC_WS_OPEN_ERROR"));},{once:true});
});
function call(params,timeout=12000){
 if(ws.readyState!==WebSocket.OPEN)return Promise.reject(Error("WS_NOT_OPEN"));
 const req_id=++sequence;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{
   pending.delete(req_id);reject(Error("BROKER_RESPONSE_TIMEOUT"));
  },timeout);
  pending.set(req_id,{resolve,reject,timer});
  try{ws.send(JSON.stringify({...params,req_id}));}
  catch(e){clearTimeout(timer);pending.delete(req_id);reject(e);}
 });
}
function safeCode(e){return String(e?.message||e||"ERROR").replace(/[^A-Za-z0-9_-]/g,"_").slice(0,72);}
const quotes=[],skipped=[],markets=[];
try{
 await connected;
 const unique=[...new Set(SENFX_DEMO_BOT_TEMPLATES.map(x=>x.symbol))];
 const supports=new Map();
 for(const symbol of unique){
  try{
   const res=await call({contracts_for:symbol});
   const offered=res?.contracts_for?.available;
   if(!Array.isArray(offered))throw Error("UNVERIFIED_CONTRACT_DIRECTORY");
   supports.set(symbol,new Set(offered.map(x=>x?.contract_type).filter(x=>typeof x==="string")));
   markets.push({symbol,availableTypes:supports.get(symbol).size});
  }catch(e){markets.push({symbol,error:safeCode(e)});}
 }
 for(const bot of SENFX_DEMO_BOT_TEMPLATES){
  for(const [prediction,barrier] of choices.get(bot.id)||[]){
   const mapping=deriveDemoProposal(bot.id,prediction,barrier,stake);
   if(!mapping){skipped.push({bot:bot.id,prediction,reason:"ORIGINAL_MAPPING_REJECTED"});continue;}
   const offered=supports.get(bot.symbol);
   if(!offered){skipped.push({bot:bot.id,prediction,reason:"NO_VERIFIED_MARKET"});continue;}
   if(!offered.has(mapping.contract_type)){
    skipped.push({bot:bot.id,prediction,reason:"NOT_OFFERED_BY_DERIV"});continue;
   }
   // Never subscribe to streaming prices, create a purchase, or use an authenticated socket.
   const {subscribe,...request}=mapping;
   try{
    const res=await call(request);
    const ask=Number(res?.proposal?.ask_price);
    const payout=Number(res?.proposal?.payout);
    if(!Number.isFinite(ask)||!Number.isFinite(payout)||ask<=0||
       payout<=0||Math.abs(ask-stake)>0.011)throw Error("INVALID_PRICE");
    quotes.push({
     botId:bot.id,market:bot.symbol,prediction,contractType:mapping.contract_type,
     barrier:mapping.barrier??null,duration:mapping.duration,
     durationUnit:mapping.duration_unit,
     family:family(mapping.contract_type),stake:ask,payout,
     netWinProfit:round2(payout-ask),netReturnPercent:round2((payout-ask)/ask*100),
     breakEvenWinPercent:round2(ask/payout*100),
     referenceOnly:bot.id==="pattern-differs"
    });
   }catch(e){skipped.push({bot:bot.id,prediction,reason:safeCode(e)});}
  }
 }
}catch(e){fatal=safeCode(e);}
finally{
 ended=true;rejectAll("SCAN_FINISHED");
 try{ws.close();}catch{}
}
quotes.sort((a,b)=>b.netWinProfit-a.netWinProfit);
const bestByFamily=[...new Set(quotes.map(x=>x.family))].map(name=>({
 family:name,...quotes.find(x=>x.family===name)
}));
const report={generatedAt:new Date().toISOString(),
 source:"Deriv PUBLIC WebSocket / proposal only; NOT an authenticated virtual Demo quote",
 stakeUSD:stake,originalBotCount:SENFX_DEMO_BOT_TEMPLATES.length,
 noPurchases:true,noCredentials:true,fatal,markets,quoted:quotes.length,quotes,
 skipped,bestByFamily,limitations:[
  "Prices are instantaneous and may expire; availability can differ on the selected Demo account.",
  "No strategy signal or win rate is established. A bigger payout may mean a lower probability of a win.",
  "Directional alternatives are quote comparisons, not automatic switches.",
  "Pattern Differs quote uses barrier 7 only as an illustrative baseline."
 ]};
fs.mkdirSync("out",{recursive:true});
fs.writeFileSync("out/senfx-public-deriv-payouts.json",JSON.stringify(report,null,2)+"\n");
let md="# SENFX read-only public Deriv contract quotes\n\n";
md+="Generated: "+report.generatedAt+" | Stake: $500 | Quoted: "+quotes.length+
 " | Original bots: "+report.originalBotCount+"\n\n";
md+="**Public prices only**. These do not authorize Demo broker purchases or guarantee a win.\n\n";
md+="|Bot|Contract|Market|Win profit|Return|Break-even win rate|\n|---|---|---|---:|---:|---:|\n";
for(const r of quotes)md+="|"+r.botId+"|"+r.contractType+(r.barrier!==null?" "+r.barrier:"")+
 "|"+r.market+"|$"+r.netWinProfit.toFixed(2)+"|"+r.netReturnPercent.toFixed(2)+
 "%|"+r.breakEvenWinPercent.toFixed(2)+"%|\n";
md+="\nSkipped quotes: "+skipped.length+"\n";
for(const s of skipped)md+="- "+s.bot+" / "+s.prediction+": "+s.reason+"\n";
if(fatal)md+="\nPublic quote scan warning: "+fatal+"\n";
md+="\n**All broker orders placed: 0. No account credentials used.**\n";
fs.writeFileSync("out/senfx-public-deriv-payouts.md",md);
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);
console.log("SENFX PUBLIC QUOTE RESULTS "+JSON.stringify({
 generatedAt:report.generatedAt,quoted:report.quoted,skipped:skipped.length,
 bestByFamily:bestByFamily.map(x=>({family:x.family,botId:x.botId,
  netWinProfit:x.netWinProfit,breakEvenWinPercent:x.breakEvenWinPercent})),fatal
}));
if(quotes.length===0)process.exitCode=2;
