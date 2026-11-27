'use client';

import {useMemo,useState} from 'react';
import {STRATEGY_LIBRARY} from '@/lib/quantum/strategy-library.mjs';

const categories=[...new Set(STRATEGY_LIBRARY.map(x=>x.category))];

export default function StrategyLibrary(){
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('All');
  const visible=useMemo(()=>STRATEGY_LIBRARY.filter(item=>{
    const matchesCategory=category==='All'||item.category===category;
    const text=(item.id+' '+item.name+' '+item.category+' '+item.entryRule).toLowerCase();
    return matchesCategory&&text.includes(query.trim().toLowerCase());
  }),[query,category]);

  return <main style={{minHeight:'100vh',background:'#030a16',color:'#e6f1ff',padding:'24px',fontFamily:'system-ui,sans-serif'}}>
    <div style={{maxWidth:1100,margin:'0 auto'}}>
      <header style={{border:'1px solid #28506d',borderRadius:16,padding:24,background:'linear-gradient(145deg,#12263ce8,#071322)'}}>
        <small style={{color:'#8ba9cc'}}>TRADE SCHEME FX · RESEARCH LIBRARY</small>
        <h1 style={{margin:'8px 0',fontSize:'clamp(26px,4vw,42px)'}}>100 Strategy Candidates</h1>
        <p>One shared research library. These are unvalidated hypotheses for chronological paper evaluation, not proven strategies.</p>
        <strong style={{display:'inline-block',padding:'8px 12px',border:'1px solid #fbbf24',borderRadius:8,color:'#fde68a'}}>RESEARCH ONLY · NO BROKER EXECUTION · REAL-MONEY DISABLED</strong>
        <p style={{color:'#b8cbe0'}}>The existing 16 strategies are unchanged. Candidates stay disabled until they pass a predeclared out-of-sample validation gate. No candidate has a recorded validation result yet.</p>
      </header>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'18px 0'}}>
        <label style={{flex:'1 1 260px'}}>Search candidates
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name or rule" style={{display:'block',boxSizing:'border-box',width:'100%',marginTop:6,padding:10,borderRadius:8,background:'#13233c',color:'#e6f1ff',border:'1px solid #334765'}}/>
        </label>
        <label>Research family
          <select value={category} onChange={e=>setCategory(e.target.value)} style={{display:'block',marginTop:6,padding:10,borderRadius:8,background:'#13233c',color:'#e6f1ff',border:'1px solid #334765'}}>
            <option>All</option>{categories.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <span style={{alignSelf:'end',padding:10}}>{visible.length} of {STRATEGY_LIBRARY.length} candidates</span>
      </div>
      <section aria-label="Research-only strategy candidates" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,340px),1fr))',gap:12}}>
        {visible.map(item=><article key={item.id} style={{border:'1px solid #28506d',borderRadius:12,padding:16,background:'#0b1728'}}>
          <small style={{color:'#8ba9cc'}}>{item.id} · {item.category}</small>
          <h2 style={{fontSize:19,margin:'8px 0'}}>{item.name}</h2>
          <p style={{lineHeight:1.55}}>{item.entryRule}</p>
          <details>
            <summary style={{cursor:'pointer',color:'#67e8f9'}}>Configuration and gates</summary>
            <dl style={{lineHeight:1.55}}>
              <dt>Supported markets</dt><dd>{item.supportedMarkets.join(', ')} (verify each with Deriv active symbols before research)</dd>
              <dt>Research contract</dt><dd>{item.contractType}; {item.durationTicks} tick(s)</dd>
              <dt>Exit rule</dt><dd>{item.exitRule}</dd>
              <dt>Invalidation</dt><dd>{item.invalidationRule}</dd>
              <dt>Evidence</dt><dd>{item.evidence}</dd>
            </dl>
          </details>
          <p style={{fontSize:12,color:'#fde68a'}}>Status: {item.status} · execution disabled</p>
        </article>)}
      </section>
      {visible.length===0&&<p>No candidates match those filters.</p>}
    </div>
  </main>;
}
