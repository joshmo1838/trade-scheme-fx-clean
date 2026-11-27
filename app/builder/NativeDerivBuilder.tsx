"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {STRATEGIES} from "@/lib/quantum/strategies";

const editorOrigin="https://trade-scheme-fx-clean.vercel.app";
type RunState={ok?:boolean;controlsEnabled?:boolean;run?:{desiredState:string;observedState:string;version:number;botId:string;workerConnected:boolean;lastError:string|null;restartCooldownSeconds:number}|null;code?:string};
const api='/api/deriv/demo/v4/bots/control';

export default function NativeDerivBuilder() {
 const frame=useRef<HTMLIFrameElement>(null);
 const [src,setSrc]=useState(`${editorOrigin}/?native_deriv=1#bot_builder`);
 const [strategy,setStrategy]=useState<(typeof STRATEGIES)[number]|null>(null);
 const [status,setStatus]=useState<RunState|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('Checking signed-in Demo access…');
 const running=status?.run?.desiredState==='running';
 const refresh=useCallback(async()=>{
  try {const r=await fetch(api,{credentials:'same-origin',cache:'no-store'});const d:RunState=await r.json();setStatus(d);const active=d.run?.desiredState==='running';const current=active&&d.run?.botId===strategy?.id&&d.run?.workerConnected;const lastError=d.run?.lastError;
   const message=!r.ok?(d.code||'Demo unavailable'):!strategy?'Choose a bot from the workspace first.':!d.controlsEnabled?'Demo execution is not enabled on the server.':active?(current?'Demo worker connected.':d.run?.botId===strategy.id?'Waiting for Demo worker connection.':'Another bot is already running; stop it first.'):lastError||'Ready checks passed; use the Blockly Run button.';
   setMessage(message);
   frame.current?.contentWindow?.postMessage({source:'TSFX_TRADE_SCHEME_PARENT',type:'RUN_STATE',canRun:r.ok&&!!strategy?.id&&d.controlsEnabled&&!active&&!busy&&Number(d.run?.restartCooldownSeconds||0)===0,running:!!current,message},editorOrigin);
  } catch {setStatus(null);setMessage('Could not verify Demo access.');}
 },[strategy,running,busy]);
 useEffect(()=>{const selectedId=new URL(window.location.href).searchParams.get('strategyId');const selected=STRATEGIES.find(item=>item.id===selectedId);if(selected){setStrategy(selected);setSrc(`${editorOrigin}/?native_deriv=1&senfx_strategy=${encodeURIComponent(selected.id)}#bot_builder`);}},[]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),4000);return()=>clearInterval(timer);},[refresh]);
 useEffect(()=>{const onMessage=(event:MessageEvent)=>{if(event.origin!==editorOrigin||event.source!==frame.current?.contentWindow||event.data?.source!=='TSFX_BLOCKLY')return;const d=event.data;if(d.type==='PLAN_ERROR'){setMessage(String(d.code||'Invalid Blockly settings.'));return;}if(d.type!=='RUN'&&d.type!=='STOP')return;void(async()=>{setBusy(true);try{const action=d.type==='RUN'?'start':'stop';const response=await fetch(api,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='start'?{action,botId:d.plan?.strategyId,stake:d.plan?.stake,sessionStopLoss:d.plan?.sessionStopLoss,sessionTakeProfit:d.plan?.sessionTakeProfit,tradePlan:d.plan,expectedVersion:status?.run?.version??0,confirmVirtualDemoAutomation:true}:{action,expectedVersion:status?.run?.version??0})});const result=await response.json().catch(()=>({code:'INVALID_SERVER_RESPONSE'}));setMessage(response.ok?(action==='start'?'Demo run request accepted; waiting for the worker.':'Stop requested.'):String(result.code||'Run rejected'));await refresh();}catch{setMessage('Could not confirm the Demo command; check run status before retrying.');}finally{setBusy(false);}})();};window.addEventListener('message',onMessage);return()=>window.removeEventListener('message',onMessage);},[status,refresh]);
 return <main style={{position:'fixed',inset:'44px 0 0',width:'100vw',height:'calc(100dvh - 44px)',overflow:'hidden',background:'#fff',display:'grid',gridTemplateRows:'48px minmax(0,1fr)'}}>
  <header style={{display:'flex',alignItems:'center',gap:'clamp(6px,2vw,16px)',padding:'0 10px',background:'#081525',color:'#eaf2ff',borderBottom:'1px solid #263b54',fontFamily:'system-ui,sans-serif',zIndex:20}}><a href="/dashboard" style={{color:'#8deaff',textDecoration:'none',fontSize:13,fontWeight:700,whiteSpace:'nowrap'}}>← Workspace</a><strong style={{minWidth:0,maxWidth:'calc(100vw - 210px)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:13}}>{strategy?strategy.name+' · Deriv DBot':'Deriv DBot Builder'}</strong><span role="status" aria-live="polite" style={{marginLeft:'auto',fontSize:12}}>{message}</span></header>
  <div style={{minHeight:0,position:'relative'}}><iframe ref={frame} title={strategy?strategy.name+' Deriv DBot workspace':'Official Deriv DBot workspace'} src={src} sandbox="allow-scripts allow-downloads allow-same-origin" referrerPolicy="no-referrer" style={{display:'block',width:'100%',height:'100%',minHeight:0,border:0,background:'#fff'}}/></div>
 </main>;
}
