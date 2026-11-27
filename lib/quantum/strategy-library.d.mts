export type StrategyTarget = "DIGIT" | "DIRECTION";
export type ResearchStrategyCandidate = Readonly<{
  id:string;
  name:string;
  category:string;
  target:StrategyTarget;
  entryRule:string;
  supportedMarkets:readonly string[];
  contractType:string;
  durationTicks:number;
  exitRule:string;
  requiredInputs:readonly string[];
  invalidationRule:string;
  status:"RESEARCH_ONLY";
  validated:false;
  executionEnabled:false;
  evidence:string;
}>;
export const STRATEGY_LIBRARY:readonly ResearchStrategyCandidate[];
export const STRATEGY_LIBRARY_COUNT:number;
export const STRATEGY_LIBRARY_POLICY:Readonly<{
  demoExecutionEnabled:false;
  realMoneyExecutionEnabled:false;
  researchOnly:true;
  modifiesExistingStrategies:false;
}>;
