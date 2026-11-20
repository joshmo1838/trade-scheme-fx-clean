export type DemoAiTick={id:string;symbol:string;quote:number;epochMs:number};
export type DemoAiCandidate={
 eligible:boolean;reason:string;researchScore:number;direction:"CALL"|"PUT"|null;
 symbol?:string;latestPublicTickId?:string;latestPublicEpochMs:number;
 sampleCount?:number;stakeUsd?:number;isBrokerOrder?:false;
};
export function assessDemoAiCandidate(ticks:DemoAiTick[],nowMs:number,emergencyStopped?:boolean):DemoAiCandidate;
export function screenDemoAiPilotSafety(candidate:DemoAiCandidate,gate:Record<string,unknown>):{allowed:boolean;code:string};
