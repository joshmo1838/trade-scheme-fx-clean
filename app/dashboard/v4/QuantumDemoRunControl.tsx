'use client';
import {useCallback,useEffect,useState} from 'react';

type Props={botId:string;botName:string};
type Status={ok:boolean;controlsEnabled?:boolean;code?:string;run?:{
 desiredState:string;observedState:string;version:number;botId:string;stake:number;
 sessionStopLoss:number;sessionTakeProfit:number;workerConnected:boolean;lastError:string|null;
 progress:{tradesAttempted:number;pending:number;completed:number;wins:number;losses:number;netVirtualProfit:number;latestContractId:string|null}|null;
 restartCooldownSeconds:number;
}|null};
const API='/api/deriv/demo/v4/bots/control';

export default function QuantumDemoRunControl({botId,botName}:Props){
 const [status,setStatus]=useState<Status|null>(null);
 const [stake,setStake]=useState('');
 const [stopLoss,setStopLoss]=useState('');
 const [takeProfit,setTakeProfit]=useState('');
 const [approved,setApproved]=useState(false);
 const [pending,setPending]=useState(false);
 const [note,setNote]=useState('Choose a virtual stake and both session limits before Run.');
 const refresh=useCallback(async()=>{
  try{const response=await fetch(API,{credentials:'same-origin',cache:'no-store'});const data:Status=await response.json();setStatus(data);if(!response.ok)setNote(data.code||'Demo control unavailable');}
  catch{setStatus(null);setNote('Could not read the current Demo run status.');}
 },[]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),4000);return()=>clearInterval(timer);},[refresh]);
 const running=status?.run?.desiredState==='running';
 const sameBot=running&&status?.run?.botId===botId;
 const moneyOk=(value:string)=>/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value)&&Number.isFinite(Number(value))&&Number(value)>0&&Number.isSafeInteger(Math.round(Number(value)*100));
 const valid=moneyOk(stake)&&moneyOk(stopLoss)&&moneyOk(takeProfit)&&Number(stake)<=Number(stopLoss)&&approved;
 const canRun=!!status?.ok&&!!status.controlsEnabled&&!running&&valid&&!pending&&Number(status.run?.restartCooldownSeconds||0)===0;
 const canStop=!!status?.ok&&running&&!pending;
 async function command(action:'start'|'stop'){
  if(action==='start'&&!canRun||action==='stop'&&!canStop)return;
  setPending(true);
  try{
   const response=await fetch(API,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,botId,stake,sessionStopLoss:stopLoss,sessionTakeProfit:takeProfit,expectedVersion:status?.run?.version??0,confirmVirtualDemoAutomation:action==='start'&&approved})});
   const data=await response.json().catch(()=>({code:'INVALID_SERVER_RESPONSE'}));
   setNote(!response.ok?'Run rejected: '+String(data.code||'SERVER_ERROR'):action==='stop'?'Stop confirmed. Any already submitted contract still needs settlement reconciliation.':'Run requested. Wait for the verified worker status and settlement record.');
   if(response.ok&&action==='start')setApproved(false);
   await refresh();
  }catch{setNote('Could not confirm that command. Check the broker ledger before retrying.');}
  finally{setPending(false);}
 }
 const progress=sameBot?status?.run?.progress:null;
 const blocked=!status?'Checking signed-in Demo access…':!status.ok?'Sign in to the configured Demo pilot account to use this control.':!status.controlsEnabled?'4.0 Demo execution is not enabled on the server.':running?(sameBot?(status?.run?.workerConnected?'Worker lease verified; watching for an eligible contract.':'Run requested; waiting for the worker lease.'):'Another bot is using this Demo account. Stop it before starting this bot.'):!moneyOk(stake)?'Enter a positive virtual USD stake.':!moneyOk(stopLoss)||Number(stake)>Number(stopLoss)?'Set a session stop loss at least as large as the stake.':!moneyOk(takeProfit)?'Set a positive session take profit.':!approved?'Confirm virtual-funds Demo authorization to enable Run.':'Ready to run this current 4.0 strategy on the selected Demo account.';
 return <section aria-label={`${botName} Deriv Demo run controls`} style={{marginTop:16,padding:16,border:'1px solid #38506c',borderRadius:12,background:'#0c1828',color:'#e2e8f0'}}>
  <small style={{color:'#67e8f9',fontWeight:700}}>DERIV DEMO · CURRENT 4.0 BOT · VIRTUAL USD ONLY</small>
  <h3 style={{margin:'8px 0'}}>{botName} Run settings</h3>
  <p style={{margin:'0 0 14px',color:'#b7c8da',fontSize:14,lineHeight:1.5}}>On a phone, enter your stake and limits here. The small boxes in the Blockly preview do not control this Demo run.</p>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:12}}>
   <label style={{display:'grid',gap:6,fontSize:14}}>Stake per contract (USD)<input aria-label="Virtual stake" inputMode="decimal" value={stake} disabled={running||pending} onChange={e=>setStake(e.target.value)} style={{display:'block',width:'100%',minHeight:48,boxSizing:'border-box',padding:'12px',fontSize:16,borderRadius:8,touchAction:'manipulation'}}/></label>
   <label style={{display:'grid',gap:6,fontSize:14}}>Session stop loss (USD)<input aria-label="Session stop loss" inputMode="decimal" value={stopLoss} disabled={running||pending} onChange={e=>setStopLoss(e.target.value)} style={{display:'block',width:'100%',minHeight:48,boxSizing:'border-box',padding:'12px',fontSize:16,borderRadius:8,touchAction:'manipulation'}}/></label>
   <label style={{display:'grid',gap:6,fontSize:14}}>Session take profit (USD)<input aria-label="Session take profit" inputMode="decimal" value={takeProfit} disabled={running||pending} onChange={e=>setTakeProfit(e.target.value)} style={{display:'block',width:'100%',minHeight:48,boxSizing:'border-box',padding:'12px',fontSize:16,borderRadius:8,touchAction:'manipulation'}}/></label>
  </div>
  <label style={{display:'flex',gap:12,alignItems:'flex-start',margin:'14px 0',padding:10,border:'1px solid #38506c',borderRadius:10,fontSize:14,lineHeight:1.5,cursor:'pointer',touchAction:'manipulation'}}><input type="checkbox" checked={approved} disabled={running||pending} onChange={e=>setApproved(e.target.checked)} style={{width:26,height:26,minWidth:26,minHeight:26,margin:0,flexShrink:0,accentColor:'#22d3ee'}}/><span>I authorize this bot to submit Deriv virtual Demo orders at the stake and session limits above. Real-money execution is disabled.</span></label>
  <p role="status" aria-live="polite"><strong>{sameBot&&status?.run?.workerConnected?'DEMO WORKER VERIFIED':running?'DEMO RUN ACTIVE':canRun?'READY TO RUN':'RUN CHECK'}</strong> · {blocked}{status?.run?.lastError?` Last worker result: ${status.run.lastError}`:''}</p>
  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button type="button" aria-label={`RUN AI BOT for ${botName}`} disabled={!canRun} onClick={()=>void command('start')} style={{minHeight:48,minWidth:160,padding:'12px 16px',fontSize:14,touchAction:'manipulation'}}>RUN AI BOT</button><button type="button" disabled={!canStop} onClick={()=>void command('stop')} style={{minHeight:48,padding:'12px 16px',fontSize:14,touchAction:'manipulation'}}>Stop / Emergency Stop</button><button type="button" disabled={pending} onClick={()=>void refresh()} style={{minHeight:48,padding:'12px 16px',fontSize:14,touchAction:'manipulation'}}>Refresh status</button></div>
  {progress&&<div style={{marginTop:12}}><p>Settled: {progress.completed} · wins/losses: {progress.wins}/{progress.losses} · session P/L: ${Number(progress.netVirtualProfit).toFixed(2)}</p><p>Open or reconciling: {progress.pending} · attempted: {progress.tradesAttempted}</p>{progress.latestContractId&&<p>Latest Deriv contract ID: {progress.latestContractId}</p>}</div>}
  <p role="status">{note}</p><small>Run only buys when the current signal passes Golden Rule/10X checks and Deriv confirms the contract type, duration, and digit barrier. An uncertain purchase blocks the next run until reconciled.</small>
 </section>;
}
