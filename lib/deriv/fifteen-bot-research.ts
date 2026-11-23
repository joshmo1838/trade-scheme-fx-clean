import { FIFTEEN_BOTS, type FifteenBot } from "../bots/fifteen-paper-bots.ts";

type ResearchObservation = { botId: string; symbol: string; tick: { epoch: number; quote: number }; snapshot: readonly { epoch: number; quote: number }[] };
type ResearchBridge = {
  attach(input: { botId: string; symbol: string; onResearch: (observation: ResearchObservation) => void }): () => void;
  detach(botId: string): boolean;
};

/**
 * Reuse the canonical fifteen-bot catalog when selecting market subscriptions.
 * This is a paper/research-only mapping: no execution or broker authorization.
 */
export function getFifteenBotResearchMarkets() {
  if (FIFTEEN_BOTS.length !== 15 ||
      new Set(FIFTEEN_BOTS.map(bot => bot.id)).size !== 15) {
    throw new Error("Canonical fifteen-bot catalog failed integrity checks");
  }
  const markets = [...new Set(FIFTEEN_BOTS.map(bot => bot.market))];
  if (markets.some(symbol => typeof symbol !== "string" || !/^[A-Za-z0-9_]{2,30}$/.test(symbol))) {
    throw new Error("Unsupported research market in canonical bot catalog");
  }
  return markets;
}

export function attachFifteenBotResearch({ bridge, onResearchByBotId }: {
  bridge: ResearchBridge;
  onResearchByBotId: (botId: string, bot: FifteenBot) => ((observation: ResearchObservation) => void) | null | undefined;
}) {
  if (!bridge || typeof bridge.attach !== "function" || typeof bridge.detach !== "function") {
    throw new TypeError("Research bridge required");
  }
  if (typeof onResearchByBotId !== "function") throw new TypeError("Bot research handler factory required");
  const detach: Array<() => void> = [];
  try {
    for (const bot of FIFTEEN_BOTS) {
      const handler = onResearchByBotId(bot.id, bot);
      if (typeof handler !== "function") throw new TypeError("Missing research handler for " + bot.id);
      detach.push(bridge.attach({ botId: bot.id, symbol: bot.market, onResearch: handler }));
    }
  } catch (error) {
    for (const remove of detach.reverse()) remove();
    throw error;
  }
  return () => { for (const remove of detach.reverse()) remove(); };
}
