// Research-only stake progression for Deriv-style quick strategy templates.
// This is an independent simulator, NOT Deriv Bot XML, a broker order or a claim
// that the algorithms exactly match a particular Deriv Bot template version.
import { DERIV_PRESET_REFERENCE } from "./official-preset-reference.mjs";
const allowed = new Set(DERIV_PRESET_REFERENCE.map(x=>x.id));
const round = x=>Math.round((x+Number.EPSILON)*100)/100;
const validMoney = (x,label)=>{if(typeof x!=="number"||!Number.isFinite(x)||x<=0||x>1e6)throw new RangeError(label+" must be a finite positive amount <= 1000000");const rounded=round(x);if(rounded<=0)throw new RangeError(label+" must be at least 0.01");return rounded;};
export function createPresetPaperSession({templateId,baseStake=1,maxStake=10,maxCumulativeLoss=50}={}){
  if(!allowed.has(templateId))throw new TypeError("Unknown Deriv preset");
  const base=validMoney(baseStake,"baseStake"), cap=validMoney(maxStake,"maxStake"), lossCap=validMoney(maxCumulativeLoss,"maxCumulativeLoss");
  if(base>cap)throw new RangeError("baseStake exceeds maxStake");
  if(base>lossCap)throw new RangeError("baseStake exceeds remaining loss budget");
  let stake=base, step=0, net=0, loss=0, stopped=false, rounds=0;
  const name=templateId.replace(/^(options|accumulators)-/,"").replace(/-stat-reset$/,"");
  const reset=templateId.endsWith("-stat-reset");
  const sequence=[1,3,2,6];
  function next(outcome,netProfit){
    if(stopped)return snapshot();
    if(outcome!=="win"&&outcome!=="loss")throw new TypeError("Outcome must be win or loss");
    if(typeof netProfit!=="number"||!Number.isFinite(netProfit)||Math.abs(netProfit)>1e6)throw new RangeError("Invalid realized paper profit");
    if((outcome==="win"&&netProfit<0)||(outcome==="loss"&&netProfit>=0))throw new RangeError("Outcome conflicts with realized paper profit");
    const realized=round(netProfit);
    net=round(net+realized);rounds++;
    if(realized<0)loss=round(loss-realized);
    if(loss>=lossCap){stopped=true;stake=0;return snapshot();}
    const prior=stake;
    switch(name){
      case "martingale":stake=outcome==="loss"?prior*2:base;break;
      case "reverse-martingale":stake=outcome==="win"?prior*2:base;break;
      case "dalembert":stake=outcome==="loss"?prior+base:Math.max(base,prior-base);break;
      case "reverse-dalembert":stake=outcome==="win"?prior+base:Math.max(base,prior-base);break;
      case "oscars-grind":stake=outcome==="win"?prior+base:prior;break;
      case "1326":step=outcome==="win"?(step+1)%sequence.length:0;stake=base*sequence[step];break;
      default:throw new Error("Unsupported progression");
    }
    if(reset&&outcome==="win")stake=base;
    stake=round(stake);
    if(stake>cap||stake>lossCap-loss){stopped=true;stake=0;}
    return snapshot();
  }
  function snapshot(){return Object.freeze({templateId,stake,rounds,netPaperProfit:net,cumulativePaperLoss:loss,stopped,execution:"paper_only"});}
  return Object.freeze({snapshot,recordPaperSettlement:next,stop(){stopped=true;stake=0;return snapshot();}});
}
