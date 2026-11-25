// Forward-only shadow evaluation. Never submits broker orders.
export class AutoValidation {
 constructor(){this.pending=null;this.stats={Matches:{n:0,wins:0},Differs:{n:0,wins:0}};this.latest=null;}
 observe(tick,probabilities){
 if(this.pending&&tick.epoch<=this.pending.epoch)return;
 if(this.pending&&tick.epoch-this.pending.epoch===2){for(const c of this.pending.candidates){const s=this.stats[c.contract];s.n++;s.wins+=Number(c.contract==='Matches'?tick.digit===c.digit:tick.digit!==c.digit);}}
 this.pending=null;
 if(!Array.isArray(probabilities)||probabilities.length!==10||!probabilities.every(p=>Number.isFinite(p)&&p>=0&&p<=1)||Math.abs(probabilities.reduce((a,b)=>a+b,0)-1)>.001)return;
 const candidates=[];
 for(const contract of ['Matches','Differs']){
 const scores=probabilities.map(p=>contract==='Matches'?p:1-p),best=Math.max(...scores),digits=scores.map((p,i)=>Math.abs(p-best)<1e-9?i:-1).filter(i=>i>=0);
 if(digits.length===1)candidates.push({contract,digit:digits[0],estimate:best});
 }
 this.pending={epoch:tick.epoch,candidates};this.latest=this.pending;
 }
 snapshot(){return {mode:'SHADOW',decision:'NO ENTRY',reason:'Independent prospective validation and live broker payout required',executionAuthorized:false,latest:this.latest,stats:structuredClone(this.stats)};}
}
