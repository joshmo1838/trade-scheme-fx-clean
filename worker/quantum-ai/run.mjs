import {deepScan} from './deep-scan.mjs';
import {AutoValidation} from './auto-validation.mjs';
import {DigitAI} from './model.mjs';
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Error('Missing server-only database configuration');
const symbols=(process.env.QUANTUM_SYMBOLS||'R_10,R_25,R_50,R_75,R_100').split(',');if(symbols.some(s=>!['R_10','R_25','R_50','R_75','R_100'].includes(s)))throw Error('Unsupported market');
const states=new Map([...new Set(symbols)].map(s=>[s,{ai:new DigitAI(),validation:new AutoValidation(),batch:[],queue:[],last:0,history:[],historyReady:false}]));let ws,lastMessage=0,retry,stopping=false,busy=false;
async function write(table,body,conflict){const r=await fetch(`${url.replace(/\/$/,'')}/rest/v1/${table}?on_conflict=${conflict}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Storage ${table}: HTTP ${r.status}`);}
async function restore(symbol,s){
 const cutoff=Math.floor(Date.now()/1000)-2592000;
 const headers={apikey:key,Authorization:'Bearer '+key};
 let cursor=cutoff-600;
 for(;;){
 const q=new URLSearchParams({select:'first_epoch,ticks',symbol:'eq.'+symbol,first_epoch:'gt.'+cursor,order:'first_epoch.asc',limit:'100'});
 const r=await fetch(url.replace(/\/$/,'')+'/rest/v1/quantum_ai_batches?'+q,{headers,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Historical read failed: '+r.status);
 const rows=await r.json();if(!rows.length)break;
 for(const row of rows)for(const t of row.ticks)if(t.epoch>=cutoff)s.history.push(t);
 cursor=rows.at(-1).first_epoch;
 if(rows.length<100)break;
 }
 s.historyReady=true;
}
function connect(){if(stopping)return;ws=new WebSocket('wss://api.derivws.com/trading/v1/options/ws/public');lastMessage=Date.now();ws.onopen=()=>{for(const s of states.keys())ws.send(JSON.stringify({ticks:s,subscribe:1}));};ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.error){console.error('Feed rejected');return;}const t=m.tick,s=states.get(t?.symbol);if(!s||m.msg_type!=='tick'||Math.abs(Date.now()-Number(t.epoch)*1000)>15000)return;if(s.ai.ingest({epoch:Number(t.epoch),quote:Number(t.quote),pip_size:t.pip_size})){s.validation.observe(s.ai.ticks.at(-1),s.ai.pending);lastMessage=Date.now();s.last=lastMessage;s.batch.push(s.ai.ticks.at(-1));s.history.push(s.ai.ticks.at(-1));if(s.batch.length===300){s.queue.push({symbol:t.symbol,first_epoch:s.batch[0].epoch,last_epoch:s.batch.at(-1).epoch,ticks:s.batch});s.batch=[];if(s.queue.length>20){console.error('Storage backlog exceeded; stopping rather than dropping data');stopping=true;ws.close();}}}}catch{console.error('Invalid feed message');}};ws.onerror=()=>ws.close();ws.onclose=()=>{if(!stopping)retry=setTimeout(connect,5000);};}
async function flush(){if(busy)return;busy=true;try{for(const [symbol,s] of states){while(s.queue.length){await write('quantum_ai_batches',s.queue[0],'symbol,first_epoch,last_epoch');s.queue.shift();}s.history=s.history.filter(t=>t.epoch>=Math.floor(Date.now()/1000)-2592000);await write('quantum_ai_latest',{symbol,updated_at:new Date().toISOString(),payload:{...s.ai.snapshot(),autoValidation:s.validation.snapshot(),deepScan:s.historyReady?deepScan(s.history,Date.now(),2):{decision:'NO ENTRY',reason:'History loading',executionAuthorized:false},feedFresh:Date.now()-s.last<15000,workerStopped:stopping}},'symbol');}console.log('Research snapshots saved');}catch(e){console.error(e.message);}finally{busy=false;}}
for(const [symbol,s] of states)await restore(symbol,s);connect();setInterval(()=>{if(!stopping&&(Date.now()-lastMessage>30000||[...states.values()].some(s=>s.last>0&&Date.now()-s.last>60000)))ws.close();else if(ws.readyState===1)ws.send(JSON.stringify({ping:1}));},10000);setInterval(flush,30000);process.on('SIGTERM',()=>{stopping=true;clearTimeout(retry);ws.close();for(const [symbol,s] of states)if(s.batch.length)s.queue.push({symbol,first_epoch:s.batch[0].epoch,last_epoch:s.batch.at(-1).epoch,ticks:s.batch});void flush().finally(()=>process.exit(0));});
