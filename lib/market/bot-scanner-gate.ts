/** Shared, paper-only scanner gate for existing SENFX bot signals.
 * This is NOT wired to broker purchases or bot strategy evaluation.
 * No synthetic research score or win probability is inferred from price data.
 */
import { validateTick, type Tick } from "./smart-entry-paper";
export type ScannerGateInput = {
 botId: string; originalSignal: "CALL" | "PUT" | null;
 tick: Tick | null; previousTick: Tick | null; nowMs: number;
 researchScore: number | null; emergencyStop?: boolean;
};
export type ScannerGateDecision = {
 botId: string; originalSignal: "CALL" | "PUT" | null;
 action: "observe" | "wait"; reason: string; tick: Tick | null;
};
export function evaluateScannerGate(input: ScannerGateInput): ScannerGateDecision {
 const result=(action: "observe"|"wait",reason:string,tick:Tick|null=null):ScannerGateDecision=>({
  botId:input.botId,originalSignal:input.originalSignal,action,reason,tick
 });
 if(!input.botId.trim()) return result("wait","missing-bot-id");
 if(input.emergencyStop) return result("wait","emergency-stop");
 if(input.originalSignal!== "CALL" && input.originalSignal!== "PUT") return result("wait","original-strategy-no-signal");
 if(!input.tick) return result("wait","awaiting-verified-tick");
 const validation=validateTick(input.tick,input.previousTick,input.nowMs);
 if(!validation.ok) return result("wait",validation.reason);
 if(input.researchScore===null || !Number.isFinite(input.researchScore) || input.researchScore<75 || input.researchScore>100)
  return result("wait","research-score-unavailable-or-below-threshold",input.tick);
 return result("observe","paper-only-qualified-observation",input.tick);
}
/** Evaluate independently, never allow one bot's signal to replace another's. */
export function evaluateBotScannerBatch(inputs: readonly ScannerGateInput[]):ScannerGateDecision[] {
 const seen=new Set<string>();
 return inputs.map(input=>{
  if(seen.has(input.botId)) return {botId:input.botId,originalSignal:input.originalSignal,action:"wait",reason:"duplicate-bot-id",tick:null};
  seen.add(input.botId);
  return evaluateScannerGate(input);
 });
}
