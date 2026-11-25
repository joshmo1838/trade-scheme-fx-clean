"use client";

import {useEffect,useState} from "react";
import {STRATEGIES} from "@/lib/quantum/strategies";

const editorOrigin="https://trade-scheme-fx-clean.vercel.app";

export default function NativeDerivBuilder() {
  const [src,setSrc]=useState(`${editorOrigin}/?native_deriv=1#bot_builder`);
  useEffect(()=>{
    const selected=new URL(window.location.href).searchParams.get("strategyId");
    if(STRATEGIES.some(strategy=>strategy.id===selected))
      setSrc(`${editorOrigin}/?native_deriv=1&senfx_strategy=${encodeURIComponent(selected!)}#bot_builder`);
  },[]);
  return (
    <main style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh", overflow: "hidden", background: "#fff" }}>
      <iframe
        title="Official Deriv DBot workspace"
        src={src}
        sandbox="allow-scripts allow-downloads allow-same-origin"
        referrerPolicy="no-referrer"
        style={{ display: "block", width: "100%", height: "100%", border: 0, background: "#fff" }}
      />
    </main>
  );
}
