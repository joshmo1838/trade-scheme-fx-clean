"use client";

import {useEffect,useState} from "react";
import {STRATEGIES} from "@/lib/quantum/strategies";
import QuantumDemoRunControl from "@/app/dashboard/v4/QuantumDemoRunControl";

const editorOrigin="https://trade-scheme-fx-clean.vercel.app";

export default function NativeDerivBuilder() {
  const [src,setSrc]=useState(`${editorOrigin}/?native_deriv=1#bot_builder`);
  const [strategy,setStrategy]=useState<(typeof STRATEGIES)[number]|null>(null);
  const [controlsOpen,setControlsOpen]=useState(false);

  useEffect(()=>{
    const selectedId=new URL(window.location.href).searchParams.get("strategyId");
    const selected=STRATEGIES.find(item=>item.id===selectedId);
    if(!selected)return;
    setStrategy(selected);
    setSrc(`${editorOrigin}/?native_deriv=1&senfx_strategy=${encodeURIComponent(selected.id)}#bot_builder`);
  },[]);

  return (
    <main style={{position:"fixed",inset:0,width:"100vw",height:"100dvh",overflow:"hidden",background:"#fff",display:"grid",gridTemplateRows:"48px minmax(0,1fr)"}}>
      <header style={{display:"flex",alignItems:"center",gap:16,padding:"0 14px",background:"#081525",color:"#eaf2ff",borderBottom:"1px solid #263b54",fontFamily:"system-ui,sans-serif",zIndex:20}}>
        <a href="/dashboard" style={{color:"#8deaff",textDecoration:"none",fontSize:13,fontWeight:700}}>← Workspace</a>
        <strong style={{fontSize:14}}>{strategy?strategy.name+" · Deriv DBot":"Deriv DBot Builder"}</strong>
        {strategy&&<button type="button" aria-label={`RUN AI BOT for ${strategy.name}`} onClick={()=>setControlsOpen(true)} style={{marginLeft:"auto",border:"1px solid #3d647a",borderRadius:8,padding:"7px 11px",background:"#22d3ee",color:"#081525",fontSize:11,fontWeight:800,cursor:"pointer"}}>RUN AI BOT</button>}
      </header>
      <div style={{minHeight:0,position:"relative"}}>
        <iframe
          title={strategy?strategy.name+" Deriv DBot workspace":"Official Deriv DBot workspace"}
          src={src}
          sandbox="allow-scripts allow-downloads allow-same-origin"
          referrerPolicy="no-referrer"
          style={{display:"block",width:"100%",height:"100%",minHeight:0,border:0,background:"#fff"}}
        />
        {strategy&&controlsOpen&&<div role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setControlsOpen(false);}} style={{position:"fixed",inset:"48px 0 0",zIndex:30,display:"grid",placeItems:"center",padding:14,background:"rgba(1,8,20,.58)"}}>
          <section role="dialog" aria-modal="true" aria-label={strategy.name+" virtual Demo controls"} style={{width:"min(100%, 980px)",maxHeight:"100%",overflowY:"auto",border:"1px solid #38506c",borderRadius:14,background:"#07111f",boxShadow:"0 24px 80px rgba(0,0,0,.45)"}}>
            <div style={{display:"flex",justifyContent:"flex-end",padding:"10px 12px 0"}}>
              <button type="button" onClick={()=>setControlsOpen(false)} style={{border:0,background:"transparent",color:"#dbeafe",fontSize:13,cursor:"pointer"}}>Close</button>
            </div>
            <div style={{padding:"0 12px 12px"}}>
              <QuantumDemoRunControl botId={strategy.id} botName={strategy.name}/>
            </div>
          </section>
        </div>}
      </div>
    </main>
  );
}
