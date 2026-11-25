export const modules = ['Dashboard','Bot Builder','Volt AI','Free Bots','Bulk Trader','Analysis Tools','Hedging Tool','Auto AI','Manual Trader','Premium AI Bots','Apex Bot','Quick Bot','Signal AI','Copy Trader','Speedbot','Automated','Charts'] as const;
export const freeBots = ['Nexus Flow','Volt Sprint','Apex Signal','Prism Range','Straddle Shift','Pulse Rhythm','Vertex Digits','Quantum Edge AI'];
export const premiumBots = ['Sterling Edge','Meridian Pivot','Regent Parity','Atlas Range','Windsor Continuity','Marlow Flow','Cadence Sequence','Monarch Echo'];
export const autoStrategies = ['Trend Rider','Pullback Hunter','Momentum Breakout','Donchian Breakout','SuperTrend Momentum'];
export const executionPolicy = Object.freeze({realMoney:false,brokerDemo:false,paper:false});
export function digitCounts(digits: number[]) { const counts = Array<number>(10).fill(0); for(const d of digits) { if(Number.isInteger(d)&&d>=0&&d<=9) counts[d]++; } return counts; }
