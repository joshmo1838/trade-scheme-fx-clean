"use client";

import {useEffect,useState} from "react";
import {STRATEGIES} from "@/lib/quantum/strategies";
import QuantumDemoRunControl from "@/app/dashboard/v4/QuantumDemoRunControl";

const editorOrigin="https://trade-scheme-fx-clean.vercel.app";

export default function NativeDerivBuilder() {
  const [src,setSrc]=useState(`${editorOrigin}/?native_deriv=1#bot_builder`);
  const [strategy,setStrategy]=useState<(typeof STRATEGIES)[number]|null>(null);

  useEffect(()=>{
    const selectedId=new URL(window.location.href).searchParams.get("strategyId");
    const selected=STRATEGIES.find(item=>item.id===selectedId);
    if(!selected)return;
    setStrategy(selected);
    setSrc(`${editorOrigin}/?native_deriv=1&senfx_strategy=${encodeURIComponent(selected.id)}#bot_builder`);
  },[]);

  return (
    <main style={{position:"fixed",inset:0,width:"100vw",height:"100dvh",overflow:"hidden",background:"#fff",display:"grid",gridTemplateRows:"48px minmax(0,1fr)"}}>
      <header style={{display:"flex",alignItems:"center",gap:16,padding:"0 14px",background:"#081525",color:"#eaf2ff",borderBottom:"1px solid #263b54",fontFamily:"system-ui,sans-serif"}}>
        <a href="/dashboard" style={{color:"#8deaff",textDecoration:"none",fontSize:13,fontWeight:700}}>← Workspace</a>
        <strong style={{fontSize:14}}>{strategy?strategy.name+" · Deriv DBot":"Deriv DBot Builder"}</strong>
        {strategy&&<span style={{marginLeft:"auto",fontSize:10,fontWeight:700,color:"#8deaff",letterSpacing:".08em"}}>VIRTUAL DEMO ONLY · REAL-MONEY DISABLED</span>}
      </header>
      <div style={{minHeight:0,display:"grid",gridTemplateRows:strategy?"minmax(0,1fr) minmax(240px,34vh)":"minmax(0,1fr)"}}>
        <iframe
          title={strategy?strategy.name+" Deriv DBot workspace":"Official Deriv DBot workspace"}
          src={src}
          sandbox="allow-scripts allow-downloads allow-same-origin"
          referrerPolicy="no-referrer"
          style={{display:"block",width:"100%",height:"100%",minHeight:0,border:0,background:"#fff"}}
        />
        {strategy&&<section aria-label={strategy.name+" Demo controls"} style={{overflowY:"auto",background:"#07111f",padding:"0 12px 12px"}}>
          <div style={{maxWidth:1160,margin:"0 auto"}}>
            <QuantumDemoRunControl botId={strategy.id} botName={strategy.name}/>
          </div>
        </section>}
      </div>
    </main>
  );
}
