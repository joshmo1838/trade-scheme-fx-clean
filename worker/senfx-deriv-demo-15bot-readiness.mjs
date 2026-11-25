/**
 * One-shot, read-only Deriv virtual-Demo 15-bot readiness probe.
 * May run ONLY while all broker-execution switches are OFF.
 * No broker buy, no settlement, no Supabase writes; no tokens in logs.
 */
import {createDecipheriv} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {SENFX_DEMO_BOT_TEMPLATES,deriveDemoProposal} from "../lib/deriv/demo-bot-contracts.mjs";
import {isVerifiedDemoAccount,validBrokerProposal,validVirtualStake} from "../lib/deriv/demo-15bot-worker-safety.mjs";

const EXECUTION_FLAGS=[
 "DERIV_DEMO_TRADING_ENABLED","DERIV_DEMO_BROKER_BUY_ENABLED",
 "SENFX_DEMO_15BOT_CONTROL_ENABLED","SENFX_DEMO_15BOT_BROKER_EXECUTION_ENABLED"
];
if(EXECUTION_FLAGS.some(name=>process.env[name]!=="false")){
 throw Error("Probe requires four explicit false broker execution switches.");
}
if(process.env.SENFX_DEMO_15BOT_READONLY_PROBE!=="true"){
 console.log("[senfx-demo-probe] Disabled. No broker connection or orders.");
 process.exit(0);
}
const admin=process.env.DERIV_DEMO_PILOT_USER_ID||"";
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"";
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
const encryptionKey=(process.env.DERIV_TOKEN_ENCRYPTION_KEY||"").trim();
const probeStake=Number(process.env.SENFX_DEMO_DIAGNOSTIC_STAKE||"2.00");
if(!/^[0-9a-f-]{36}$/i.test(admin)||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||
 !serviceKey||!/^[0-9a-f]{64}$/i.test(encryptionKey)||!validVirtualStake(probeStake)){
 throw Error("Private read-only diagnostic configuration invalid.");
}
if(typeof WebSocket!=="function")throw Error("Node.js 22+ WebSocket unavailable.");

const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const base="https://api.derivws.com";
async function getTokenAndAccount(){
 const {data,error}=await db.from("deriv_connections")
  .select("encrypted_token,token_iv,token_tag,expires_at,status,active_account_id,active_account_type")
  .eq("user_id",admin).maybeSingle();
 if(error||!data||data.status!=="connected"||data.active_account_type!=="demo"||
  !data.active_account_id||!(new Date(data.expires_at).getTime()>Date.now())){
  throw Error("Authorized Demo account connection unavailable or expired.");
 }
 let token;
 try{
  const dec=createDecipheriv("aes-256-gcm",Buffer.from(encryptionKey,"hex"),Buffer.from(data.token_iv,"base64"));
  dec.setAuthTag(Buffer.from(data.token_tag,"base64"));
  token=Buffer.concat([dec.update(Buffer.from(data.encrypted_token,"base64")),dec.final()]).toString("utf8");
 }catch{throw Error("Private Deriv token decryption failed; verify original key.");}
 const response=await fetch(base+"/trading/v1/options/accounts",{
  headers:{Authorization:"Bearer "+token,Accept:"application/json"},
  signal:AbortSignal.timeout(12000),cache:"no-store"
 });
 if(!response.ok)throw Error("Deriv account validation declined.");
 const json=await response.json();
 const record=Array.isArray(json?.data)?json.data.find(x=>x?.account_id===data.active_account_id):null;
 if(!isVerifiedDemoAccount(record,data.active_account_id,probeStake))
  throw Error("Deriv did not verify a funded USD virtual Demo account for the sample quote.");
 return {token,accountId:data.active_account_id};
}
async function connectDemo(token,accountId){
 const otp=await fetch(base+"/trading/v1/options/accounts/"+encodeURIComponent(accountId)+"/otp",{
  method:"POST",headers:{Authorization:"Bearer "+token,Accept:"application/json"},
  signal:AbortSignal.timeout(12000),cache:"no-store"
 });
 if(!otp.ok)throw Error("Deriv Demo OTP unavailable.");
 const payload=await otp.json();
 const url=new URL(payload?.data?.url||"https://invalid.local");
 if(url.protocol!=="wss:"||url.hostname!=="api.derivws.com"||
    url.pathname!=="/trading/v1/options/ws/demo"||!url.searchParams.has("otp"))
  throw Error("Broker session is not verified as virtual Demo.");
 const ws=new WebSocket(url);
 await new Promise((resolve,reject)=>{
  const t=setTimeout(()=>{try{ws.close();}catch{}reject(Error("Demo socket timeout"));},12000);
  ws.addEventListener("open",()=>{clearTimeout(t);resolve();},{once:true});
  ws.addEventListener("error",()=>{clearTimeout(t);reject(Error("Demo socket error"));},{once:true});
  ws.addEventListener("close",()=>{clearTimeout(t);reject(Error("Demo socket closed"));},{once:true});
 });
 const pending=new Map();let nextId=16000;
 ws.addEventListener("message",event=>{
  let msg;try{msg=JSON.parse(String(event.data));}catch{return;}
  const id=Number(msg.req_id),p=pending.get(id);
  if(!p)return;
  if(msg.error){clearTimeout(p.timer);pending.delete(id);p.reject(Error("Deriv rejection: "+String(msg.error.code||"unknown")));return;}
  if(msg.msg_type===p.type){clearTimeout(p.timer);pending.delete(id);p.resolve(msg);}
 });
 const rejectAll=()=>{
  for(const [id,p] of pending){clearTimeout(p.timer);p.reject(Error("Demo socket closed"));pending.delete(id);}
 };
 ws.addEventListener("close",rejectAll);
 ws.addEventListener("error",rejectAll);
 function request(type,body){
  if(ws.readyState!==WebSocket.OPEN)return Promise.reject(Error("Demo session closed"));
  const id=++nextId;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);reject(Error("Demo request timeout"));},11000);
   pending.set(id,{type,resolve,reject,timer});
   try{ws.send(JSON.stringify({...body,req_id:id}));}catch{clearTimeout(timer);pending.delete(id);reject(Error("Demo send failure"));}
  });
 }
 return {request,close:()=>{rejectAll();try{ws.close();}catch{}}};
}
function samples(bot){
 if(bot.types.includes("CALL"))return [["RISE",undefined],["FALL",undefined]];
 if(bot.types.includes("DIGITEVEN")&&bot.types.includes("DIGITODD"))
  return [["EVEN",undefined],["ODD",undefined]];
 const mapping={
  DIGITOVER:"OVER",DIGITUNDER:"UNDER",DIGITEVEN:"EVEN",
  DIGITODD:"ODD",DIGITMATCH:"MATCHES",DIGITDIFF:"DIFFERS"
 };
 const prediction=mapping[bot.types[0]];
 return prediction?[[prediction,bot.requiresDynamicBarrier?4:undefined]]:[];
}
async function main(){
 let session;
 try{
  const {token,accountId}=await getTokenAndAccount();
  session=await connectDemo(token,accountId);
  const markets=[...new Set(SENFX_DEMO_BOT_TEMPLATES.map(x=>x.symbol))];
  const offered=new Map();
  for(const symbol of markets){
   try{
    const data=await session.request("contracts_for",{contracts_for:symbol});
    const types=Array.isArray(data?.contracts_for?.available)?
     data.contracts_for.available.map(x=>x?.contract_type).filter(x=>typeof x==="string"):[];
    offered.set(symbol,new Set(types));
    console.log("[senfx-demo-probe] Market "+symbol+": "+types.length+" offered types");
   }catch{
    offered.set(symbol,new Set());
    console.log("[senfx-demo-probe] Market "+symbol+": availability unavailable");
   }
  }
  let typesOk=0,quotesOk=0;
  for(const bot of SENFX_DEMO_BOT_TEMPLATES){
   const types=offered.get(bot.symbol)||new Set();
   const typeSupported=bot.types.every(x=>types.has(x));
   let proposalValid=typeSupported;
   if(typeSupported){
    for(const [prediction,barrier] of samples(bot)){
     const proposal=deriveDemoProposal(bot.id,prediction,barrier,probeStake);
     if(!proposal){proposalValid=false;break;}
     try{
      const price=await session.request("proposal",proposal);
      if(!validBrokerProposal(price?.proposal,probeStake)){proposalValid=false;break;}
     }catch{proposalValid=false;break;}
    }
   }
   if(typeSupported)typesOk++;
   if(proposalValid)quotesOk++;
   console.log("[senfx-demo-probe] "+bot.id+": types="+(typeSupported?"PASS":"FAIL")+
    " quote="+(proposalValid?"PASS":"FAIL"));
  }
  console.log("[senfx-demo-probe] COMPLETE: markets="+markets.length+
   ", typeCompatible="+typesOk+"/15, sampleQuotes="+quotesOk+"/15"+
   ", amount=USD "+probeStake.toFixed(2)+", brokerOrders=0, realMoney=OFF.");
  if(quotesOk!==15)process.exitCode=2;
 }finally{session?.close();}
}
main().catch(error=>{
 const safe=String(error?.message||"Diagnostic failed").replace(/Bearer\s+\S+/gi,"Bearer [redacted]").slice(0,180);
 console.error("[senfx-demo-probe] FAILED: "+safe);
 process.exitCode=1;
});
