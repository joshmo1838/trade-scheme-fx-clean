// Intentionally no broker purchase implementation. Never accept client assertions as authorization.
export function requestBrokerPurchase():never {throw new Error('Broker purchases disabled: server account verification, quote binding, settlement and risk enforcement not implemented');}
export const executionPolicy=Object.freeze({realMoney:false,demoBroker:false,paperResearch:true});
