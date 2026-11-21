export type DemoBotTemplate={
 id:string;symbol:string;family:string;barrier?:string;types:string[];
 ticks?:number;minutes?:number;requiresDynamicBarrier?:boolean;
};
export declare const SENFX_DEMO_BOT_TEMPLATES:ReadonlyArray<Readonly<DemoBotTemplate>>;
export declare function getDemoBotTemplate(id:string):DemoBotTemplate|null;
export declare function deriveDemoProposal(botId:string,prediction:string,barrier?:string|number,stakeUsd?:number):Readonly<Record<string,string|number>>|null;
export declare function brokerSupportsTemplate(template:DemoBotTemplate,available:Array<{contract_type:string}>):boolean;
