/**
 * Deriv Options DEMO contract templates for the 15 SENFX strategy profiles.
 * This module NEVER places orders. A strategy "hit" is NOT broker profit.
 * Every actual proposal must be revalidated with contracts_for on the verified
 * Demo session. Broker purchases need a separate persisted-risk authority.
 */
export const SENFX_DEMO_BOT_TEMPLATES = Object.freeze([
 {id:"digit-over-4",symbol:"R_100",family:"DIGITOVER",barrier:"4",types:["DIGITOVER"],ticks:1},
 {id:"digit-under-5",symbol:"1HZ10V",family:"DIGITUNDER",barrier:"5",types:["DIGITUNDER"],ticks:1},
 {id:"parity-even",symbol:"R_100",family:"DIGITEVEN",types:["DIGITEVEN"],ticks:1},
 {id:"parity-odd",symbol:"R_10",family:"DIGITODD",types:["DIGITODD"],ticks:1},
 {id:"digit-matches",symbol:"1HZ10V",family:"DIGITMATCH",barrier:"3",types:["DIGITMATCH"],ticks:1},
 {id:"digit-differs",symbol:"1HZ25V",family:"DIGITDIFF",barrier:"7",types:["DIGITDIFF"],ticks:1},
 {id:"trend-rise-fall",symbol:"R_50",family:"CALL_PUT",types:["CALL","PUT"],minutes:5},
 // Direction-only breakout hypothesis, NOT an actual Deriv HIGHER/LOWER strike contract.
 {id:"breakout-higher-lower",symbol:"R_75",family:"CALL_PUT",types:["CALL","PUT"],minutes:5},
 {id:"recovery-audit",symbol:"R_100",family:"DIGITEVEN",types:["DIGITEVEN"],ticks:1},
 {id:"stepwise-audit",symbol:"R_25",family:"DIGITOVER",barrier:"4",types:["DIGITOVER"],ticks:1},
 {id:"adaptive-over",symbol:"1HZ100V",family:"DIGITOVER",barrier:"4",types:["DIGITOVER"],ticks:1},
 {id:"entropy-parity",symbol:"1HZ50V",family:"EVEN_ODD",types:["DIGITEVEN","DIGITODD"],ticks:1},
 {id:"pattern-differs",symbol:"1HZ75V",family:"DIGITDIFF",types:["DIGITDIFF"],ticks:1,requiresDynamicBarrier:true},
 {id:"momentum-rise-fall",symbol:"R_10",family:"CALL_PUT",types:["CALL","PUT"],minutes:5},
 {id:"volatility-scalper",symbol:"R_75",family:"CALL_PUT",types:["CALL","PUT"],minutes:5},
]);

export const getDemoBotTemplate = (id) => SENFX_DEMO_BOT_TEMPLATES.find(x=>x.id===id)??null;

/**
 * Returns only broker PROPOSAL parameters, never buy instructions.
 * A signal must be selected by a separate verified tick / authorization gate.
 */
export function deriveDemoProposal(botId, prediction, barrier, stakeUsd) {
 const bot=getDemoBotTemplate(botId);
 // Broker decides its own market-specific minimum/maximum stake.
 // SENFX imposes no arbitrary fixed-dollar cap, but rejects non-finite
 // amounts and balances before any quote is requested.
 if(!bot||typeof prediction!=="string"||!Number.isFinite(stakeUsd)||
    stakeUsd<=0||!Number.isSafeInteger(Math.round(stakeUsd*100))||
    Math.abs(stakeUsd*100-Math.round(stakeUsd*100))>0.000001)return null;
 const name=prediction.toUpperCase();
 const options={
  OVER:"DIGITOVER",UNDER:"DIGITUNDER",
  EVEN:"DIGITEVEN",ODD:"DIGITODD",
  MATCHES:"DIGITMATCH",DIFFERS:"DIGITDIFF",
  RISE:"CALL",FALL:"PUT"
 };
 const type=options[name];
 if(!type||!bot.types.includes(type))return null;
 let useBarrier;
 if(type.startsWith("DIGIT")&&!["DIGITEVEN","DIGITODD"].includes(type)) {
  useBarrier=bot.requiresDynamicBarrier ? barrier : bot.barrier;
  if((typeof useBarrier!=="string"&&typeof useBarrier!=="number")||
    !/^[0-9]$/.test(String(useBarrier)))return null;
  if(!bot.requiresDynamicBarrier && barrier!==undefined && String(barrier)!==bot.barrier)return null;
 }else if(barrier!==undefined && barrier!==null)return null;
 const proposal={
  proposal:1,
  amount:stakeUsd,
  basis:"stake",
  currency:"USD",
  underlying_symbol:bot.symbol,
  contract_type:type,
  duration:bot.ticks??bot.minutes,
  duration_unit:bot.ticks?"t":"m",
  subscribe:1
 };
 if(useBarrier!==undefined)proposal.barrier=String(useBarrier);
 return Object.freeze(proposal);
}

export function brokerSupportsTemplate(template, available) {
 if(!template||!Array.isArray(available))return false;
 const offered=new Set(available.filter(x=>x&&typeof x.contract_type==="string").map(x=>x.contract_type));
 return template.types.every(type=>offered.has(type));
}
