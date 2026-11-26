import {FIFTEEN_BOTS} from "./fifteen-paper-bots.ts";
import {SENFX_DEMO_BOT_TEMPLATES} from "../deriv/demo-bot-contracts.mjs";

const contractFor=id=>SENFX_DEMO_BOT_TEMPLATES.find(template=>template.id===id);

function describeRule(bot){
  switch(bot.family){
    case "over":
      return `Predict OVER ${bot.threshold}; the next observed last digit must be greater than ${bot.threshold}.`;
    case "under":
      return `Predict UNDER ${bot.threshold}; the next observed last digit must be less than ${bot.threshold}.`;
    case "even":
      return "Predict EVEN; the next observed last digit must be one of 0, 2, 4, 6, or 8.";
    case "odd":
      return "Predict ODD; the next observed last digit must be one of 1, 3, 5, 7, or 9.";
    case "matches":
      return `Predict MATCHES ${bot.threshold}; the next observed last digit must equal ${bot.threshold}.`;
    case "differs":
      return `Predict DIFFERS ${bot.threshold}; the next observed last digit must not equal ${bot.threshold}.`;
    case "recovery-audit":
      return "Predict EVEN with a constant stake, including after misses; no stake progression or loss chasing.";
    case "stepwise-audit":
      return "Predict OVER 4 with a constant stake; no stepwise stake progression or loss chasing.";
    case "adaptive-over":
      return "Inspect the latest 40 digits. Skip when the share above 4 is below 35% or above 65%; otherwise predict OVER 4.";
    case "entropy-parity":
      return "Inspect the latest 40 digits. Skip if Shannon entropy is below 3.05 bits; otherwise predict EVEN when the even count is at most 20, and ODD when it is higher.";
    case "pattern-differs":
      return "Predict DIFFERS against the most recently observed last digit; the comparison digit changes with each sample.";
    case "trend-rise-fall":
      return "Compare the latest price with the price eight ticks earlier across a nine-price window. Skip if total path movement is zero or directional efficiency is below 0.40; otherwise predict the sign of the net move.";
    case "breakout-higher-lower":
      return "Compare the simple mean of the latest 7 prices with the latest 21. Skip when their absolute spread is below 0.25 basis points; otherwise predict the direction of the fast mean relative to the slow mean. The existing broker template uses CALL/PUT, not a strike-based Higher/Lower contract.";
    case "momentum-rise-fall":
      return "Require the latest 5-tick price change to agree with the simple-mean direction of the latest 10 versus 30 prices. Skip zero or opposing momentum and skip when normalized mean spread is below 0.30 basis points.";
    case "volatility-scalper":
      return "Inspect the latest 20 prices. Skip when the latest absolute move exceeds 2.4 times the mean of earlier absolute moves, or when net directional efficiency is below 0.35; otherwise predict the net drift direction.";
  }
}

export const FIFTEEN_DBOT_REFERENCES=Object.freeze(FIFTEEN_BOTS.map(bot=>{
  const contract=contractFor(bot.id);
  const fields=[
    `Original bot ID: ${bot.id}`,
    `Market: ${bot.market}`,
    `Family: ${bot.family}`,
    `Category: ${bot.category}`,
    `Readiness sample: ${bot.minTicks} valid ticks minimum; the current predictor retains at most 160 ticks.`,
    `Original rule: ${describeRule(bot)}`,
    `Existing profile: ${bot.description} ${bot.difference}`,
    `Existing Demo template: ${contract?.types?.join(" / ")??"not configured"}${contract?.barrier?` barrier ${contract.barrier}`:""}${contract?.requiresDynamicBarrier?" dynamic barrier from the existing signal":""}${contract?.ticks?`, ${contract.ticks} tick duration`:""}${contract?.minutes?`, ${contract.minutes} minute duration`:""}.`,
    "Existing stake and safety controls remain in the SENFX controls outside this DBot reference. The paper strategy uses no stake progression.",
    "Blockly mapping status: REFERENCE ONLY — the original strategy is not represented as executable DBot purchase-condition blocks.",
    "DBot Run remains disabled for this reference. No strategy, broker control, or stored configuration is changed.",
  ];
  return Object.freeze({
    id:bot.id,
    name:bot.name,
    model:bot.family.toUpperCase(),
    rule:fields.join("\n"),
  });
}));
