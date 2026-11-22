/**
 * SENFX Golden Rule: read-only 300-tick snapshots to each of 15 existing
 * strategy research analyzers every 30 seconds (scheduled by the browser).
 * This module has no broker, HTTP, auth, storage or trade-execution API.
 *
 * Every bot receives its OWN symbol's last 300 distinct, contiguous public
 * ticks. Shared symbols reuse the same observed feed; never mix markets.
 * The original bot strategy may use a shorter lookback internally.
 */
import {FIFTEEN_BOTS,predictFifteenBot,type PaperSignal} from "./fifteen-paper-bots.ts";
import {goldenExpectedTickSeconds,type GoldenPaperState} from "./senfx-golden-rule-research.ts";
import type {DigitSymbol,ObservedTick} from "./digit-matrix.ts";

export const GOLDEN_TICK_MONITOR_WINDOW=300;
export const GOLDEN_TICK_MONITOR_DELIVERY_MS=30_000;
export const GOLDEN_TICK_MONITOR_FRESH_MS=10_000;
export type GoldenTickDeliveryStatus=
 "DELIVERED"|"WARMING"|"STALE"|"DISCONNECTED"|"GAPPED";
export type GoldenBotTickDelivery={
 botId:string;botName:string;market:DigitSymbol;
 count:number;lastEpoch:number|null;deliveredAtMs:number;
 status:GoldenTickDeliveryStatus;
 ticks:readonly ObservedTick[];
 analysis:PaperSignal|null;
};
export function buildGoldenBotTickDeliveries(
 state:GoldenPaperState,nowMs:number,connected:boolean,
):GoldenBotTickDelivery[]{
 return FIFTEEN_BOTS.map(bot=>{
  const window=(state.history[bot.market]||[]).slice(-GOLDEN_TICK_MONITOR_WINDOW);
  const last=window.at(-1);
  const base={
   botId:bot.id,botName:bot.name,market:bot.market,
   count:window.length,lastEpoch:last?.epoch??null,deliveredAtMs:nowMs,
  };
  let status:GoldenTickDeliveryStatus;
  if(!connected)status="DISCONNECTED";
  else if(window.length<GOLDEN_TICK_MONITOR_WINDOW)status="WARMING";
  else if(!Number.isFinite(nowMs)||!last||last.epoch*1000>nowMs||
    nowMs-last.epoch*1000>GOLDEN_TICK_MONITOR_FRESH_MS)status="STALE";
  else {
   const expected=goldenExpectedTickSeconds(bot.market);
   const contiguous=window.every((tick,index)=>
    tick.symbol===bot.market&&Number.isSafeInteger(tick.epoch)&&
    Number.isFinite(tick.price)&&tick.price>0&&
    Number.isInteger(tick.digit)&&tick.digit>=0&&tick.digit<=9&&
    (index===0||tick.epoch-window[index-1].epoch===expected));
   status=contiguous?"DELIVERED":"GAPPED";
  }
  // No partial, stale, skipped, or disconnected histories reach an analyzer.
  return {...base,status,
   ticks:status==="DELIVERED"?window:[],
   analysis:status==="DELIVERED"?predictFifteenBot(bot,window):null};
 });
}
