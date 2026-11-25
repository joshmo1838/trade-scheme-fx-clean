export const modules = ['Dashboard','Bot Builder','Volt AI','Free Bots','Bulk Trader','Analysis Tools','Hedging Tool','Auto AI','Manual Trader','Premium AI Bots','Apex Bot','Quick Bot','Signal AI','Copy Trader','Speedbot','Automated','Charts'] as const;

export type WorkspaceModule = typeof modules[number];
export type ModuleTarget = { href: string; title: string; detail: string; state: 'ready'|'research'|'prototype' };

// Each tab opens the existing implementation for that tool. Research routes
// remain clearly identified; none of these links grants broker execution.
export const moduleTargets = {
  'Volt AI': {href:'/intelligence',title:'Market Intelligence',detail:'Live public-market monitoring, indicators, and research signals.',state:'research'},
  'Free Bots': {href:'/dashboard',title:'Trade Scheme FX 4.0 Strategy Bots',detail:'Browse the current 16 research strategies and open a read-only reference in Deriv Blockly.',state:'research'},
  'Bulk Trader': {href:'/bulk-trader',title:'Bulk Risk Planner',detail:'Compare batch exposure scenarios without placing orders.',state:'research'},
  'Analysis Tools': {href:'/ai-scanner',title:'Market Scanner',detail:'Inspect public ticks and transparent technical indicators.',state:'research'},
  'Hedging Tool': {href:'/hedging',title:'Hedge Scenario Planner',detail:'Model paired exposure without broker execution.',state:'research'},
  'Auto AI': {href:'/bot-library/golden-rule',title:'Golden Rule Research',detail:'Run prospective research and 10X validation across the original bots.',state:'research'},
  'Manual Trader': {href:'/manual-trader',title:'Manual Paper Ticket',detail:'Practice decisions against public ticks; this page does not buy contracts.',state:'research'},
  'Premium AI Bots': {href:'/dashboard',title:'Trade Scheme FX 4.0 Strategy Bots',detail:'Browse the current 16 research strategies and open a read-only reference in Deriv Blockly.',state:'research'},
  'Apex Bot': {href:'/strategy-lab',title:'Strategy Lab',detail:'Run strict indicator research and paper forward tests.',state:'research'},
  'Quick Bot': {href:'/backtest',title:'Backtest Lab',detail:'Test historical data with chronological holdout analysis.',state:'research'},
  'Signal AI': {href:'/intelligence',title:'Signal Research',detail:'Review public-market observations and indicator signals.',state:'research'},
  'Copy Trader': {href:'/copy-trading',title:'Copy Trading Workspace',detail:'Prototype only. No account copying or broker orders are enabled.',state:'prototype'},
  'Speedbot': {href:'/digit-tools',title:'Live Digit Tools',detail:'Inspect live digit observations; this does not accelerate broker purchases.',state:'research'},
} as const satisfies Record<Exclude<WorkspaceModule,'Dashboard'|'Automated'|'Bot Builder'|'Charts'>,ModuleTarget>;

export const executionPolicy = Object.freeze({realMoney:false,brokerDemo:true,paper:true});

export function digitCounts(digits: number[]) {
  const counts = Array<number>(10).fill(0);
  for (const digit of digits) if (Number.isInteger(digit) && digit >= 0 && digit <= 9) counts[digit]++;
  return counts;
}

export const nativeDerivSource = Object.freeze({
  revision:'da24196175b5a11088d8b982dd4abe83a13a198c',
  editorReady:true,
  originalStrategiesMapped:false,
  arbitraryXmlExecution:false,
  realMoney:false,
});
