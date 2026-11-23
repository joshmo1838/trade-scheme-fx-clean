import FifteenPaperBotLibrary from "@/app/bot-library/FifteenPaperBotLibrary";

export const metadata = {
  title: "SENFX AI Scanner | Trade Scheme FX",
  description: "Research the 15 original SENFX strategies with real public ticks and an optional OpenAI explanation. No Deriv broker orders.",
};

/**
 * /ai-scanner is the discoverable entrance to the 15-bot research scanner.
 * Existing market indicators remain available from /intelligence.
 * The separate manual OpenAI explanation is disabled until securely configured.
 */
export default function AIScannerPage() {
  return <FifteenPaperBotLibrary />;
}
