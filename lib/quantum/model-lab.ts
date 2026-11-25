import {lastDigit,type MarketTick} from './intelligence-engine';
import {validateHistory} from './evaluation';
// Chronological holdout comparison of uniform and smoothed Markov digit probabilities.
export function compareDigitModels(ticks:MarketTick[]){validateHistory(ticks);if(ticks.length<1000)throw Error('Need 1000 ticks');const d=ticks.map(lastDigit),cut=Math.floor(d.length*.7),m=Array.from({length:10},()=>Array<number>(10).fill(1));for(let i=1;i<cut;i++)m[d[i-1]][d[i]]++;let loss=0;for(let i=cut;i<d.length;i++){const row=m[d[i-1]];loss-=Math.log(row[d[i]]/row.reduce((a,b)=>a+b,0));}return {train:cut,test:d.length-cut,uniformLogLoss:Math.log(10),markovLogLoss:loss/(d.length-cut),promoted:false,validated:false};}
