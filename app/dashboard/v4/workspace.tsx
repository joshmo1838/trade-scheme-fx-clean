'use client';
import {useState,useEffect} from 'react';
import type {CSSProperties} from 'react';
import QuantumLiveCharts from './QuantumLiveCharts';
import LiveCandleChart from '@/app/components/LiveCandleChart';
import {modules,freeBots,premiumBots,autoStrategies,digitCounts} from './registry';
import styles from './workspace.module.css';
type Module = typeof modules[number];
const themes: Record<string,{color:string,icon:string,description:string}> = {
 'Bulk Trader':{color:'#22d3ee',icon:'▥',description:'Explore digit distributions and market activity'},
 'Premium AI Bots':{color:'#fbbf24',icon:'◇',description:'Explore the premium strategy collection'},
 'Speedbot':{color:'#fb7185',icon:'ϟ',description:'Fast strategy workspace'},
 'Manual Trader':{color:'#34d399',icon:'↗',description:'Observe live markets and configure trades'},
 'Apex Bot':{color:'#a78bfa',icon:'△',description:'Strategy configuration and research'},
 'Volt AI':{color:'#818cf8',icon:'✦',description:'AI research workspace'},
 'Hedging Tool':{color:'#2dd4bf',icon:'⇄',description:'Explore paired strategy configurations'},
 'Quick Bot':{color:'#fb923c',icon:'ϟ',description:'Quick configuration workspace'},
 'Copy Trader':{color:'#f472b6',icon:'⧉',description:'Copy strategy interface'},
 'Automated':{color:'#60a5fa',icon:'◎',description:'Automation configuration'},
 'Analysis Tools':{color:'#38bdf8',icon:'▥',description:'Observed market statistics'},
 'Signal AI':{color:'#c084fc',icon:'✧',description:'Market research and analysis'},
 'Charts':{color:'#34d399',icon:'▥',description:'Actual Deriv public market data'},
 'Bot Builder':{color:'#22d3ee',icon:'▦',description:'Build a strategy outline'},
 'Free Bots':{color:'#60a5fa',icon:'◇',description:'Explore free strategy configurations'},
 'Auto AI':{color:'#a78bfa',icon:'✦',description:'Explore automated strategy configurations'}
};
function ModuleArt({name}:{name:string}){const t=themes[name]||themes['Volt AI'];return <div className={styles.moduleArt} style={{'--module-accent':t.color} as CSSProperties} aria-hidden="true"><div className={styles.moduleOrbit}/><div className={styles.moduleOrbit}/><div className={styles.moduleGlyph}>{t.icon}</div><div className={styles.moduleBars}>{Array.from({length:16},(_,i)=><i key={i} style={{height:20+(i*23)%70+'%',animationDelay:-i*.13+'s'}}/>)}</div></div>}
export default function MasterWorkspace(){
 const [tab,setTab]=useState<Module>('Dashboard');
 const [selected,setSelected]=useState('');
 const [digits,setDigits]=useState<number[]>([]);
 const [sample,setSample]=useState('120');
 const [stake,setStake]=useState('1');
 const [target,setTarget]=useState('10');
 const [loss,setLoss]=useState('5');
 const [status,setStatus]=useState('Disconnected');
 const [price,setPrice]=useState('—');
 const [market,setMarket]=useState('R_100');
 const [scan,setScan]=useState(false);
 const [orb,setOrb]=useState(false);
 const [blocks,setBlocks]=useState<string[]>([]);
 const [journal,setJournal]=useState<string[]>([]);
 const [panel,setPanel]=useState('Summary');
 const counts=digitCounts(digits);
 const palette=['#22d3ee','#a78bfa','#34d399','#fbbf24','#fb7185','#60a5fa','#f472b6','#fb923c'];
 const accent=(name:string)=>palette[Math.max(0,[...freeBots,...premiumBots,...autoStrategies].indexOf(name))%palette.length];
 useEffect(()=>{if(!scan)return; let active=true; setDigits([]);setPrice('—');setStatus('Connecting'); const ws=new WebSocket('wss://api.derivws.com/trading/v1/options/ws/public'); ws.onopen=()=>{if(active){setStatus('Awaiting ticks');ws.send(JSON.stringify({ticks:market,subscribe:1}));}}; ws.onmessage=e=>{if(!active)return;try{const m=JSON.parse(e.data);if(m.error){setStatus('Feed rejected');return;}const t=m.tick;if(!t||!Number.isFinite(Number(t.quote)))return;setStatus('Live');setPrice(String(t.quote));if(!Number.isInteger(t.pip_size)||t.pip_size<0||t.pip_size>12)return;const formatted=Number(t.quote).toFixed(t.pip_size);setPrice(formatted);setDigits(old=>[...old,Number(formatted.slice(-1))].slice(-Math.max(1,Math.min(1000,Number(sample)||120))));}catch{setStatus('Invalid feed response');}};ws.onerror=()=>{if(active)setStatus('Feed error');};ws.onclose=()=>{if(active)setStatus('Disconnected');};return()=>{active=false;ws.close();};},[scan,market,sample]);
 const cards=tab==='Free Bots'?freeBots:tab==='Premium AI Bots'?premiumBots:tab==='Auto AI'?autoStrategies:[];
 function openBot(name:string){setSelected(name);setTab('Bot Builder');setJournal(j=>[...j,`Selected ${name}; strategy not validated`]);}
 const config=<div className={styles.config}><label>Stake<input type="number" min="0.01" value={stake} onChange={e=>setStake(e.target.value)}/></label><label>Take profit<input type="number" value={target} onChange={e=>setTarget(e.target.value)}/></label><label>Stop loss<input type="number" value={loss} onChange={e=>setLoss(e.target.value)}/></label><button disabled>Start — execution disabled</button></div>;
 return <div className={styles.shell}><nav className={styles.nav}>{modules.map(m=><button key={m} aria-pressed={tab===m} onClick={()=>setTab(m)}>{m}</button>)}</nav><div className={styles.layout}><section className={styles.main} key={tab}><header><small>TRADE SCHEME FX / 4.0 DEVELOPMENT</small><h1>{tab}</h1></header>{tab!=='Dashboard'&&tab!=='Bot Builder'&&<div className={styles.moduleHeader} style={{'--module-accent':themes[tab]?.color||'#22d3ee'} as CSSProperties}><ModuleArt name={tab}/><div><small>TRADE SCHEME FX · RESEARCH TERMINAL</small><h2>{tab}</h2><p>{themes[tab]?.description}</p></div></div>}{tab==='Dashboard'?<><div className={styles.hero}><div className={styles.wave} aria-hidden="true"/><div className={styles.waveTwo} aria-hidden="true"/><div className={styles.marketArt} aria-hidden="true">{Array.from({length:32},(_,i)=><i key={i} className={i%5===1||i%5===2?styles.down:styles.up} style={{left:`${i*3.2}%`,bottom:`${18+i*1.35+Math.sin(i*0.65)*15}%`,height:`${18+(i*17)%48}px`,animationDelay:`${-i*0.23}s`}}/>)}</div><div className={styles.floor} aria-hidden="true"/><h2>Welcome to your trading workspace</h2><p>Your strategy. Your workspace. Explore, build and research. Trading execution is disabled.</p></div><div className={`${styles.grid} ${styles.launchGrid}`}>{(['Bulk Trader','Premium AI Bots','Speedbot','Manual Trader'] as Module[]).map(m=><button key={m} className={styles.launchCard} style={{'--module-accent':themes[m].color} as CSSProperties} onClick={()=>setTab(m)}><ModuleArt name={m}/><strong>{m} ↗</strong><small>{themes[m].description}</small></button>)}</div></>:cards.length?<div className={styles.grid}>{cards.map(n=><article key={n} className={styles.botCard} style={{"--bot-accent":accent(n)} as CSSProperties}><div className={styles.botArt} aria-hidden="true"><span/><span/><span/><div className={styles.botCore}>✦</div>{Array.from({length:12},(_,i)=><i key={i} style={{height:`${18+(i*13)%65}%`,animationDelay:`${-i*.19}s`}}/>)}</div><h3>{n}</h3><p>Strategy specification pending</p><button onClick={()=>openBot(n)}>Load configuration</button></article>)}</div>:tab==='Bot Builder'?<><div className={styles.botBanner} style={{"--bot-accent":accent(selected)} as CSSProperties}><div className={styles.botArt} aria-hidden="true"><span/><span/><span/><div className={styles.botCore}>✦</div></div><div><small>STRATEGY CONFIGURATION</small><h2>{selected||'New strategy'}</h2><p>Research workspace · execution disabled</p></div></div><div className={styles.grid}>{['Trade Parameters','Analysis Logic','Purchase Conditions','Sell Conditions','Restart Trading Conditions','Utility'].map(b=><button key={b} onClick={()=>setBlocks(v=>[...v,b])}>{b} +</button>)}</div><div className={styles.canvas}>{blocks.map((b,i)=><button key={i} onClick={()=>setBlocks(v=>v.filter((_,k)=>k!==i))}>{b} ×</button>)}<p>Outline editor only; executable blocks and XML import pending.</p></div>{config}</>:tab==='Charts'?<><div className={styles.chartFrame}><LiveCandleChart embedded/></div><QuantumLiveCharts/></>:['Bulk Trader','Analysis Tools','Signal AI'].includes(tab)?<><div className={styles.config}><label>Market<select value={market} onChange={e=>setMarket(e.target.value)}>{['R_10','R_25','R_50','R_75','R_100'].map(m=><option key={m}>{m}</option>)}</select></label><label>Sample<input type="number" min="1" max="1000" value={sample} onChange={e=>setSample(e.target.value)}/></label><button onClick={()=>{setScan(v=>!v);if(scan)setStatus('Stopped');}}>{scan?'Stop feed':'Connect feed'}</button></div><p>{status} · {price} · {digits.length} precision-verified ticks</p><div className={styles.digits}>{counts.map((n,i)=><div key={i}><strong>{i}</strong><small>{digits.length?(100*n/digits.length).toFixed(1)+'%':'—'}</small></div>)}</div><p>Recent: {digits.slice(-20).join(' · ')||'No data'}</p>{config}</>:<><p>Module interface — implementation pending. Market chart is research only.</p>{config}{['Manual Trader','Apex Bot','Volt AI','Speedbot','Quick Bot','Hedging Tool','Automated','Copy Trader'].includes(tab)&&<div className={styles.chartFrame}><LiveCandleChart embedded/></div>}</>}</section><aside className={styles.side}><h3>Session</h3><div className={styles.tabs}>{['Summary','Transactions','Journal'].map(p=><button key={p} onClick={()=>setPanel(p)}>{p}</button>)}</div>{panel==='Summary'?<p>No execution session. Trading disabled.</p>:panel==='Transactions'?<p>No transactions.</p>:journal.map((j,i)=><p key={i}>{j}</p>)}</aside></div>{orb&&<div className={styles.assistant}><h3>Entry Scanner</h3><p>Research interface only.</p><button onClick={()=>{setTab('Analysis Tools');setOrb(false);}}>Open market analysis</button></div>}<button className={styles.orb} aria-label="Open AI scanner" aria-expanded={orb} onClick={()=>setOrb(v=>!v)}><span className={styles.aiOrbit}/><span className={styles.aiOrbit}/><span className={styles.aiCenter}>✦<small>AI</small></span></button></div>;
}
