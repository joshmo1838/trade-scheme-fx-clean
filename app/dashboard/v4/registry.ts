export const modules = ["Dashboard","Bot Builder","Volt AI","Free Bots","Bulk Trader","Analysis Tools","Hedging Tool","Auto AI","Manual Trader","Premium AI Bots","Apex Bot","Quick Bot","Signal AI","Copy Trader","Speedbot","Automated","Charts"] as const;
export type WorkspaceModule = typeof modules[number];
export const freeBots = ["Nexus Flow","Volt Sprint","Apex Signal","Prism Range","Straddle Shift","Pulse Rhythm","Vertex Digits","Quantum Edge AI"] as const;
export const premiumBots = ["Sterling Edge","Meridian Pivot","Regent Parity","Atlas Range","Windsor Continuity","Marlow Flow","Cadence Sequence","Monarch Echo"] as const;
export const autoStrategies = ["Trend Rider","Pullback Hunter","Momentum Breakout","Donchian Breakout","SuperTrend Momentum"] as const;
export const strategyRegistry = [...freeBots,...premiumBots,...autoStrategies].map(name => ({name, status:"requires-specification" as const, executionEnabled:false}));
export const executionPolicy = Object.freeze({realMoney:false, brokerDemo:false, paper:false});
