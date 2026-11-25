import {type MarketTick} from './intelligence-engine';
import {signals,outcome,type Signal} from './research';
import {validateHistory} from './evaluation';
export class PaperSession {
 private history:MarketTick[]=[];private pending:Signal|null=null;private stopped=false;private pnl=0;private peak=0;private trades=0;private wins=0;
 constructor(private bot:string,private stake=1,private payout=1.8,private lossLimit=20){if(![stake,payout,lossLimit].every(Number.isFinite)||stake<=0||payout<=stake||lossLimit<stake)throw Error('Invalid paper limits');}
 stop(){this.stopped=true;this.pending=null;}
 ingest(tick:MarketTick){if(this.stopped)return this.snapshot();validateHistory([...this.history.slice(-1),tick]);const prev=this.history[this.history.length-1];if(this.pending&&prev){const win=outcome(this.pending,prev,tick);if(win!==null){this.trades++;if(win)this.wins++;this.pnl+=win?this.payout-this.stake:-this.stake;this.peak=Math.max(this.peak,this.pnl);}this.pending=null;}this.history.push({...tick});if(this.history.length>300)this.history.shift();if(this.peak-this.pnl+this.stake>this.lossLimit||-this.pnl+this.stake>this.lossLimit){this.stop();return this.snapshot();}const s=signals(this.history).find(s=>s.bot===this.bot);if(s&&s.kind!=='SKIP')this.pending=s;return this.snapshot();}
 snapshot(){return {mode:'PAPER_HYPOTHETICAL',trades:this.trades,wins:this.wins,losses:this.trades-this.wins,pnl:this.pnl,drawdown:this.peak-this.pnl,stopped:this.stopped,pending:this.pending,brokerExecution:false};}
}
