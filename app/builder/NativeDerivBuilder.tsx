"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {STRATEGIES} from "@/lib/quantum/strategies";

const editorOrigin="https://trade-scheme-fx-clean.vercel.app";
const trustedEditorOrigins=new Set([editorOrigin,"https://tradesche.com","https://www.tradesche.com"]);
type RunState={ok?:boolean;controlsEnabled?:boolean;demoCurrency?:"USD"|"AUD"|null;run?:{desiredState:string;observedState:string;version:number;botId:string;workerConnected:boolean;lastError:string|null;restartCooldownSeconds:number}|null;code?:string};
const api='/api/deriv/demo/v4/bots/control';

export default function NativeDerivBuilder() {
 const frame=useRef<HTMLIFrameElement>(null);
 const [src,setSrc]=useState(`${editorOrigin}/?native_deriv=1#bot_builder`);
 const [strategy,setStrategy]=useState<(typeof STRATEGIES)[number]|null>(null);
 const [status,setStatus]=useState<RunState|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('Checking signed-in Demo access…');
 const [demoCurrency,setDemoCurrency]=useState<"USD"|"AUD"|null>(null);
 const running=status?.run?.desiredState==='running';
 const refresh=useCallback(async()=>{
  try {const r=await fetch(api,{credentials:'same-origin',cache:'no-store'});const d:RunState=await r.json();setStatus(d);const serverCurrency=d.demoCurrency==='USD'||d.demoCurrency==='AUD'?d.demoCurrency:null;if(serverCurrency)setDemoCurrency(serverCurrency);const verifiedCurrency=serverCurrency||demoCurrency;const active=d.run?.desiredState==='running';const current=active&&d.run?.botId===strategy?.id&&d.run?.workerConnected;const lastError=d.run?.lastError;
   const message=!r.ok?(d.code||'Demo unavailable'):!strategy?'Choose a bot from the workspace first.':!d.controlsEnabled?'Demo execution is not enabled on the server.':!verifiedCurrency?'Connect a verified Deriv Demo account to sync its currency.':active?(current?'Demo worker connected.':d.run?.botId===strategy.id?'Waiting for Demo worker connection.':'Another bot is already running; stop it first.'):lastError||'Ready checks passed; use the Blockly Run button.';
   setMessage(message);
   // The Vercel alias can redirect the iframe onto the production domain. The
   // target origin must therefore not be pinned to the pre-redirect alias.
   frame.current?.contentWindow?.postMessage({source:'TSFX_TRADE_SCHEME_PARENT',type:'RUN_STATE',currency:verifiedCurrency,canRun:r.ok&&!!strategy?.id&&!!verifiedCurrency&&d.controlsEnabled&&!active&&!busy&&Number(d.run?.restartCooldownSeconds||0)===0,running:!!current,message},'*');
  } catch {setStatus(null);setMessage('Could not verify Demo access.');}
 },[strategy,running,busy,demoCurrency]);
 useEffect(()=>{const selectedId=new URL(window.location.href).searchParams.get('strategyId');const selected=STRATEGIES.find(item=>item.id===selectedId);if(selected){setStrategy(selected);setSrc(`${editorOrigin}/?native_deriv=1&senfx_strategy=${encodeURIComponent(selected.id)}#bot_builder`);}},[]);
 useEffect(()=>{let live=true;const loadCurrency=async()=>{try{const response=await fetch(`${api}?includeDemoCurrency=1`,{credentials:'same-origin',cache:'no-store'});const data=await response.json();if(live&&response.ok)setDemoCurrency(data.demoCurrency==='USD'||data.demoCurrency==='AUD'?data.demoCurrency:null);}catch{if(live)setDemoCurrency(null);}};void loadCurrency();const timer=setInterval(()=>void loadCurrency(),30000);return()=>{live=false;clearInterval(timer);};},[]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),4000);return()=>clearInterval(timer);},[refresh]);
 useEffect(()=>{const onMessage=(event:MessageEvent)=>{if(!trustedEditorOrigins.has(event.origin)||event.source!==frame.current?.contentWindow||event.data?.source!=='TSFX_BLOCKLY')return;const d=event.data;if(d.type==='PLAN_ERROR'){setMessage(String(d.code||'Invalid Blockly settings.'));return;}if(d.type!=='RUN'&&d.type!=='STOP')return;if(d.type==='RUN'&&(!strategy||d.plan?.strategyId!==strategy.id)){setMessage('Blockly blocks are syncing to the selected bot. Try again when Run Demo is enabled.');return;}void(async()=>{setBusy(true);const action=d.type==='RUN'?'start':'stop';setMessage(action==='start'?'Submitting Blockly Demo run…':'Submitting Demo stop…');try{const response=await fetch(api,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='start'?{action,botId:strategy?.id,stake:d.plan?.stake,sessionStopLoss:d.plan?.sessionStopLoss,sessionTakeProfit:d.plan?.sessionTakeProfit,tradePlan:{...d.plan,strategyId:strategy?.id},expectedVersion:status?.run?.version??0,confirmVirtualDemoAutomation:true}:{action,expectedVersion:status?.run?.version??0})});const result=await response.json().catch(()=>({code:'INVALID_SERVER_RESPONSE'}));setMessage(response.ok?(action==='start'?'Demo run request accepted; waiting for the worker.':'Stop request accepted.'):result.code==='VERIFIED_DEMO_BALANCE_AND_BLOCK_CURRENCY_REQUIRED'?'Demo balance must cover stake and both session limits; Blockly currency is synced to your verified Demo account.':String(result.code||'Run rejected'));await refresh();}catch{setMessage('Could not confirm the Demo command; check run status before retrying.');}finally{setBusy(false);}})();};window.addEventListener('message',onMessage);return()=>window.removeEventListener('message',onMessage);},[status,refresh,strategy]);
 return <main style={{position:'fixed',inset:'44px 0 0',width:'100vw',height:'calc(100dvh - 44px)',overflow:'hidden',background:'#fff',display:'grid',gridTemplateRows:'48px minmax(0,1fr)'}}>
  <header style={{display:'flex',alignItems:'center',gap:'clamp(6px,2vw,16px)',padding:'0 10px',background:'#081525',color:'#eaf2ff',borderBottom:'1px solid #263b54',fontFamily:'system-ui,sans-serif',zIndex:20}}><a href="/dashboard" style={{color:'#8deaff',textDecoration:'none',fontSize:13,fontWeight:700,whiteSpace:'nowrap'}}>← Workspace</a><strong style={{minWidth:0,maxWidth:'calc(100vw - 210px)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:13}}>{strategy?strategy.name+' · Deriv DBot':'Deriv DBot Builder'}</strong><span role="status" aria-live="polite" style={{marginLeft:'auto',fontSize:12}}>{message}</span></header>
  <div style={{minHeight:0,position:'relative'}}><iframe ref={frame} title={strategy?strategy.name+' Deriv DBot workspace':'Official Deriv DBot workspace'} src={src} sandbox="allow-scripts allow-downloads allow-same-origin" referrerPolicy="no-referrer" style={{display:'block',width:'100%',height:'100%',minHeight:0,border:0,background:'#fff'}}/></div>
 </main>;
}
