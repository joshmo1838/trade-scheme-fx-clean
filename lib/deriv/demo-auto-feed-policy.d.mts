export type FeedRecoveryInput={
 elapsedMs:number;reconnectsUsed:number;buyAttemptStarted:boolean;emergencyStopped:boolean;
};
export type FeedRecoveryDecision={action:"stop"|"reconnect";reason:string;delayMs:number};
export const DEMO_FEED_RECOVERY:Readonly<{maxRecoveries:number;maxSearchMs:number;baseDelayMs:number;maxDelayMs:number}>;
export function decideDemoFeedRecovery(input:FeedRecoveryInput):FeedRecoveryDecision;
