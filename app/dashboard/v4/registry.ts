export const modules = ['Dashboard','Bot Builder','Volt AI','Free Bots','Bulk Trader','Analysis Tools','Hedging Tool','Auto AI','Manual Trader','Premium AI Bots','Apex Bot','Quick Bot','Signal AI','Copy Trader','Speedbot','Automated','Charts'] as const;
export const freeBots = ['Nexus Flow','Volt Sprint','Apex Signal','Prism Range','Straddle Shift','Pulse Rhythm','Vertex Digits','Quantum Edge AI'];
export const premiumBots = ['Sterling Edge','Meridian Pivot','Regent Parity','Atlas Range','Windsor Continuity','Marlow Flow','Cadence Sequence','Monarch Echo'];
export const autoStrategies = ['Trend Rider','Pullback Hunter','Momentum Breakout','Donchian Breakout','SuperTrend Momentum'];
export const executionPolicy = Object.freeze({realMoney:false,brokerDemo:false,paper:false});
export function digitCounts(digits: number[]) { const counts = Array<number>(10).fill(0); for(const d of digits) { if(Number.isInteger(d)&&d>=0&&d<=9) counts[d]++; } return counts; }

// Shared integration routing. Native editor and additional execution adapters
// remain unavailable until implemented and validated.
export const derivIntegration = {
 Dashboard:'account', 'Bot Builder':'native-editor', 'Volt AI':'research',
 'Free Bots':'native-editor', 'Bulk Trader':'existing-demo', 'Analysis Tools':'research',
 'Hedging Tool':'pending-adapter', 'Auto AI':'research', 'Manual Trader':'pending-adapter',
 'Premium AI Bots':'native-editor', 'Apex Bot':'pending-adapter', 'Quick Bot':'pending-adapter',
 'Signal AI':'research', 'Copy Trader':'pending-adapter', 'Speedbot':'pending-adapter',
 Automated:'existing-demo', Charts:'public-market'
} as const satisfies Record<typeof modules[number], string>;
export const nativeDerivSource = Object.freeze({
 revision:'da24196175b5a11088d8b982dd4abe83a13a198c',
 editorReady:false, arbitraryXmlExecution:false, realMoney:false
});
