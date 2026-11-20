/**
 * SENFX Demo AI candidate research — offline signal + advisory gate only.
 * Not a trained AI model, win probability, broker quote, order or buy API.
 * Server-side account/consent/risk verification and persistent DB reservations
 * must be added and independently tested before ANY autonomous Demo orders.
 */
export const DEMO_AI_RULES = Object.freeze({
 symbol: "R_100",
 samples: 40,
 maxTickAgeMs: 5_000,
 maxHistorySpanMs: 120_000,
 minimumResearchScore: 75,
 stakeUsd: 1,
});
const reject = reason => ({ eligible: false, reason, researchScore: 0, direction: null });
function validTick(tick) {
 return tick && typeof tick === "object" && !Array.isArray(tick) &&
  tick.symbol === DEMO_AI_RULES.symbol &&
  typeof tick.id === "string" && tick.id.trim() &&
  Number.isFinite(tick.epochMs) && Number.isFinite(tick.quote) && tick.quote > 0;
}
const mean = arr => arr.reduce((sum,x)=>sum+x,0)/arr.length;

/** Only a *candidate* based on strictly observed, chronological public quotes. */
export function assessDemoAiCandidate(ticks, nowMs, emergencyStopped = false) {
 if (emergencyStopped !== false) return reject("EMERGENCY_STOP_ACTIVE");
 if (!Number.isFinite(nowMs) || !Array.isArray(ticks) ||
     ticks.length < DEMO_AI_RULES.samples || ticks.length > 160)
  return reject("INSUFFICIENT_VERIFIED_PUBLIC_TICKS");
 const window = ticks.slice(-DEMO_AI_RULES.samples);
 const identities = new Set();
 let prev = null;
 for (const tick of window) {
  if (!validTick(tick) || tick.epochMs > nowMs || (prev &&
      (tick.epochMs <= prev.epochMs || tick.id === prev.id)) ||
      identities.has(tick.id))
   return reject("INVALID_OR_REPLAYED_PUBLIC_TICK");
  identities.add(tick.id);
  prev = tick;
 }
 const age = nowMs - window.at(-1).epochMs;
 if (age < 0 || age > DEMO_AI_RULES.maxTickAgeMs)
  return reject("STALE_PUBLIC_TICK");
 if (window.at(-1).epochMs - window[0].epochMs > DEMO_AI_RULES.maxHistorySpanMs)
  return reject("STALE_HISTORY_WINDOW");
 const prices = window.map(t=>t.quote);
 const latest = prices.at(-1);
 const changes = prices.slice(-16).slice(1).map((price,i)=>Math.sign(price-prices[prices.length-16+i]));
 const rising = changes.filter(n=>n>0).length;
 const falling = changes.filter(n=>n<0).length;
 const direction = rising>=12?"CALL":falling>=12?"PUT":null;
 if (!direction) return reject("NO_CONSISTENT_TREND");
 const fast = mean(prices.slice(-8)), slow = mean(prices.slice(-21));
 const spread = Math.abs(fast-slow)/slow;
 const aligned = direction==="CALL" ? fast>slow&&latest>prices[0] : fast<slow&&latest<prices[0];
 if (!aligned || spread<0.00005) return reject("TREND_FILTER_NOT_MET");
 const agreement = (direction==="CALL"?rising:falling)/15;
 // Deterministic research-quality score — NOT a calibrated probability.
 const researchScore = Math.min(95,Math.round(agreement*85+10));
 if (researchScore < DEMO_AI_RULES.minimumResearchScore) return reject("RESEARCH_SCORE_BELOW_THRESHOLD");
 return {
  eligible: true,
  reason:"HISTORICAL_TREND_CANDIDATE_ONLY",
  direction,
  researchScore,
  symbol:DEMO_AI_RULES.symbol,
  latestPublicTickId:window.at(-1).id,
  latestPublicEpochMs:window.at(-1).epochMs,
  sampleCount:window.length,
  stakeUsd:DEMO_AI_RULES.stakeUsd,
  isBrokerOrder:false,
 };
}

/** Advisory only: a permissive result NEVER authorizes broker buying by itself. */
export function screenDemoAiPilotSafety(candidate, gate) {
 const blocked=code=>({allowed:false,code});
 if (!gate || typeof gate!=="object" || Array.isArray(gate) ||
     gate.productionBrokerFeatureEnabled!==true) return blocked("BROKER_BUY_SAFETY_HOLD");
 if (!candidate || candidate.eligible!==true ||
     candidate.reason!=="HISTORICAL_TREND_CANDIDATE_ONLY" ||
     !["CALL","PUT"].includes(candidate.direction) ||
     candidate.symbol!==DEMO_AI_RULES.symbol ||
     candidate.stakeUsd!==DEMO_AI_RULES.stakeUsd ||
     !Number.isFinite(candidate.latestPublicEpochMs))
  return blocked("NO_VERIFIED_AI_RESEARCH_CANDIDATE");
 if (gate.customerArmedOneShot!==true) return blocked("EXPLICIT_ONE_SHOT_CONSENT_REQUIRED");
 if (gate.accountType!=="demo" || gate.brokerVerifiedDemo!==true) return blocked("VERIFIED_VIRTUAL_ACCOUNT_REQUIRED");
 if (gate.currency!=="USD" || gate.stakeUsd!==1) return blocked("INVALID_VIRTUAL_STAKE");
 if (gate.emergencyStopped!==false) return blocked("EMERGENCY_STOP_ACTIVE");
 if (gate.riskStateVerified!==true || gate.reservationVerified!==true) return blocked("RISK_LEDGER_UNVERIFIED");
 if (!Number.isInteger(gate.openOrders)||gate.openOrders!==0) return blocked("OPEN_ORDER_LIMIT");
 if (!Number.isInteger(gate.priorBuyAttempts)||gate.priorBuyAttempts!==0) return blocked("ONE_ATTEMPT_ALREADY_USED");
 if (!Number.isFinite(gate.realizedDailyLoss)||gate.realizedDailyLoss!==0||
     !Number.isFinite(gate.reservedExposure)||gate.reservedExposure!==0)
  return blocked("ONE_DOLLAR_DAILY_LOSS_BUDGET");
 if (!Number.isFinite(gate.nowMs)||gate.nowMs-candidate.latestPublicEpochMs<0||
     gate.nowMs-candidate.latestPublicEpochMs>DEMO_AI_RULES.maxTickAgeMs)
  return blocked("SIGNAL_EXPIRED");
 // Must be rechecked on server with broker-confirmed terms before buy.
 return {allowed:true,code:"ADVISORY_ONLY_NOT_BROKER_AUTHORIZATION"};
}
