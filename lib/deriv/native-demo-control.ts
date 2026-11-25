import { findFifteenBot } from "../bots/fifteen-paper-bots";

const endpoint = "/api/deriv/demo/bots/control";
type Command = { action: "stop" } | {
 action: "start_one"; botId: string; stakeAmount: string;
 targetTrades: number; expectedVersion: number; confirmVirtualDemoAutomation: true;
};
export async function readNativeDemoStatus() {
 const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
 const body = await response.json();
 if (!response.ok || body.ok !== true || body.realMoneySupported !== false ||
     body.mode !== "virtual-deriv-demo-only") throw new Error("Verified Demo status unavailable");
 return body;
}
// Only call from an explicit owner action after validating the native workspace
// against its original strategy. This transport does not validate XML.
export async function sendNativeDemoCommand(command: Command) {
 if (command.action === "start_one") {
  if (!findFifteenBot(command.botId) || command.confirmVirtualDemoAutomation !== true ||
      !Number.isSafeInteger(command.targetTrades) || command.targetTrades < 1 || command.targetTrades > 200 ||
      !Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0 ||
      typeof command.stakeAmount !== "string" || command.stakeAmount.length > 50 ||
      !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(command.stakeAmount) ||
      Number(command.stakeAmount) <= 0 || !Number.isSafeInteger(Math.round(Number(command.stakeAmount)*100)))
   throw new Error("Invalid original bot or Demo configuration");
 }
 const response = await fetch(endpoint, {
  method: "POST", credentials: "same-origin",
  headers: {"Content-Type":"application/json"},
  body: JSON.stringify(command)
 });
 const body = await response.json();
 if (!response.ok || body.ok !== true || body.brokerOrderPlaced !== false)
  throw new Error("Demo command not confirmed; refresh status before another attempt");
 return body;
}
