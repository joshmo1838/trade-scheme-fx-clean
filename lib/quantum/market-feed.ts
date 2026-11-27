import {QuantumIntelligenceEngine} from './intelligence-engine';
export const quantumEngine=new QuantumIntelligenceEngine();
export function connectQuantumFeed(symbol:string,onUpdate:(analysis:ReturnType<QuantumIntelligenceEngine['analyze']>)=>void,onStatus:(status:string)=>void=()=>{}){
 let active=true, socket:WebSocket|null=null, retry:ReturnType<typeof setTimeout>|null=null, attempts=0,lastTick=0,lastPing=0;
 function reconnect(){
  if(!active||retry!==null)return;
  const old=socket;socket=null;
  if(old){old.onclose=null;old.onerror=null;old.onmessage=null;old.onopen=null;old.close();}
  const delay=Math.min(30000,1000*2**Math.min(attempts++,5));
  onStatus('Reconnecting in '+Math.ceil(delay/1000)+'s');
  retry=setTimeout(()=>{retry=null;connect();},delay);
 }
 function connect(){
  if(!active)return;
  onStatus('Connecting');lastTick=Date.now();lastPing=0;
  let ws:WebSocket;
  try{ws=new WebSocket('wss://api.derivws.com/trading/v1/options/ws/public');}catch{reconnect();return;}
  socket=ws;
  const current=()=>active&&socket===ws;
  ws.onopen=()=>{if(!current())return;onStatus('Awaiting market data');try{ws.send(JSON.stringify({ticks:symbol,subscribe:1}));}catch{reconnect();}};
  ws.onmessage=event=>{if(!current())return;try{
   const m=JSON.parse(event.data);
   if(m.error){reconnect();return;}
   if(m.msg_type!=='tick'||!m.tick||m.tick.symbol!==symbol)return;
   const t=m.tick;
   if(quantumEngine.ingest({symbol:t.symbol,epoch:Number(t.epoch),quote:Number(t.quote),pip_size:t.pip_size})){
    lastTick=Date.now();attempts=0;onStatus('Live research data');onUpdate(quantumEngine.analyze(symbol));
   }
  }catch{onStatus('Invalid market message');}};
  ws.onerror=()=>{if(current())reconnect();};
  ws.onclose=()=>{if(current())reconnect();};
 }
 const watchdog=setInterval(()=>{
  if(!active||!socket)return;
  const now=Date.now();
  if(now-lastTick>15000){reconnect();return;}
  if(socket.readyState===WebSocket.OPEN&&now-lastPing>=30000){
   try{socket.send(JSON.stringify({ping:1}));lastPing=now;}catch{reconnect();}
  }
 },5000);
 const resume=()=>{if(active&&(!socket||Date.now()-lastTick>15000)){if(retry!==null){clearTimeout(retry);retry=null;}reconnect();}};
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',resume);
 if(typeof window!=='undefined')window.addEventListener('online',resume);
 connect();
 return ()=>{active=false;clearInterval(watchdog);if(retry!==null)clearTimeout(retry);const old=socket;socket=null;if(old)old.close();if(typeof document!=='undefined')document.removeEventListener('visibilitychange',resume);if(typeof window!=='undefined')window.removeEventListener('online',resume);};
}
