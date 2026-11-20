import type {FifteenSession, PaperObservation} from "./fifteen-paper-bots";

// This experiment only summarizes public-tick paper conditions. It cannot buy contracts.
export const STUDY_BOT_ID = "digit-differs";
export const STUDY_BATCH_SIZE = 10;
export const STUDY_BATCHES = 20;
export const STUDY_TARGET = STUDY_BATCH_SIZE * STUDY_BATCHES;
export const STUDY_STAKE = 1;
export const STUDY_BATCH_CAP = 10;

export type PaperStudy = {
 status: "running" | "stopped" | "completed";
 botId: string;
 message: string;
 completedBatches: number;
 observations: readonly PaperObservation[];
 skippedStaleTicks: number;
 recordedInBatch: number;
 skippedInBatch: number;
 lastEpoch: number;
 lastCompletedEpoch: number;
};

export function beginPaperStudy():PaperStudy {
 return {status:"running",botId:STUDY_BOT_ID,message:"Running paper observations.",
  completedBatches:0,observations:[],skippedStaleTicks:0,
  recordedInBatch:0,skippedInBatch:0,lastEpoch:0,lastCompletedEpoch:0};
}
export function stopPaperStudy(study:PaperStudy,reason:string):PaperStudy {
 return study.status==="running"?{...study,status:"stopped",message:reason}:study;
}
export function paperStudyHits(study:PaperStudy):number {
 return study.observations.reduce((total,o)=>total+(o.hit?1:0),0);
}
/** Record only new, precommitted outcomes; tolerate duplicate UI snapshots without double counting. */
export function recordPaperStudySnapshot(study:PaperStudy,batch:FifteenSession):PaperStudy {
 if(study.status!=="running")return study;
 if(batch.botId!==STUDY_BOT_ID||batch.stake!==STUDY_STAKE||
    batch.count!==STUDY_BATCH_SIZE||batch.cap!==STUDY_BATCH_CAP)
   return stopPaperStudy(study,"Paper study parameters changed. Stopped safely.");
 if(batch.state==="completed"&&batch.lastEpoch===study.lastCompletedEpoch)return study;
 if(batch.observations.length<study.recordedInBatch||
    batch.observations.length>STUDY_BATCH_SIZE||
    batch.skippedStaleTicks<study.skippedInBatch)
   return stopPaperStudy(study,"Paper study sequence or skipped-tick counters changed. Stopped safely.");
 const fresh=batch.observations.slice(study.recordedInBatch);
 let previous=study.lastEpoch;
 for(let i=0;i<fresh.length;i++){
  const obs=fresh[i];
  if(obs.sequence!==study.recordedInBatch+i+1||
     !Number.isFinite(obs.epoch)||obs.epoch<=previous||
     obs.paperStake!==STUDY_STAKE)
   return stopPaperStudy(study,"Duplicate, out-of-order, or invalid paper observation. Stopped safely.");
  previous=obs.epoch;
 }
 if(study.observations.length+fresh.length>STUDY_TARGET)
   return stopPaperStudy(study,"200-observation limit reached. Stopped safely.");
 if(batch.state==="completed"&&batch.observations.length!==STUDY_BATCH_SIZE)
   return stopPaperStudy(study,"Incomplete paper batch cannot be marked completed.");
 const completed=batch.state==="completed";
 const nextBatches=study.completedBatches+(completed?1:0);
 const outcomes=[...study.observations,...fresh];
 if(nextBatches>STUDY_BATCHES ||
    (nextBatches===STUDY_BATCHES&&outcomes.length!==STUDY_TARGET))
   return stopPaperStudy(study,"Paper-study batch totals disagree. Stopped safely.");
 const state=batch.state==="stopped"?"stopped":
  nextBatches===STUDY_BATCHES?"completed":"running";
 return {...study,status:state,
  message:state==="completed"?"200 paper observations complete. No contracts purchased.":
   state==="stopped"?batch.message:"Paper study running.",
  completedBatches:nextBatches,
  observations:outcomes,
  skippedStaleTicks:study.skippedStaleTicks+batch.skippedStaleTicks-study.skippedInBatch,
  recordedInBatch:completed?0:batch.observations.length,
  skippedInBatch:completed?0:batch.skippedStaleTicks,
  lastEpoch:previous,
  lastCompletedEpoch:completed?batch.lastEpoch:study.lastCompletedEpoch,
 };
}
