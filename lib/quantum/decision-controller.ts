import {signals} from './research';
import {quantumEngine} from './market-feed';
import {evaluateGoldenRule} from './golden-rule';
export function researchDecisions(symbol:string){const ticks=quantumEngine.getTicks(symbol,300);const fresh=ticks.length>0&&Date.now()-ticks[ticks.length-1].epoch*1000<=15000;return signals(ticks).map(signal=>({signal,gate:evaluateGoldenRule({freshMarketData:fresh,sufficientResearchData:ticks.length>=300,validatedStrategy:false}),executionAuthorized:false}));}
