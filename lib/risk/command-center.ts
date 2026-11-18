/**
 * SENFX Risk Command Center — deterministic, client-side scenario mathematics.
 * This module never reads accounts, calls an API or places orders. It assumes
 * each hypothetical losing contract loses the FULL entered stake, and that
 * a winning contract earns the entered NET payout as a fraction of stake.
 * Real Deriv contracts, fees, slippage and rules may differ.
 */
export type RiskPlanInput = {
  capital: number;
  stake: number;
  dailyLossBudget: number;
  simultaneousContracts: number;
  lossStreak: number;
  netPayoutPercent: number;
};
export type RiskPlan = {
  capital: number;
  stake: number;
  dailyLossBudget: number;
  grossExposure: number;
  exposurePercent: number;
  dailyBudgetPercent: number;
  stakePercent: number;
  remainingBudgetAfterFullLosses: number;
  maxFullStakeLossesWithinBudget: number;
  sequentialLossAmount: number;
  virtualBalanceAfterStreak: number;
  breakEvenWinRatePercent: number;
  netPayoutPercent: number;
  breachDailyBudget: boolean;
  breachCapital: boolean;
  streakExceedsBudget: boolean;
  payoutAssumption: number;
  scenarios: Array<{wins: number; losses: number; netResult: number; endingCapital: number}>;
};

function cents(amount: number): number | null {
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) return null;
  const value = Math.round(amount * 100);
  return Number.isSafeInteger(value) ? value : null;
}

export function calculateRiskPlan(input: RiskPlanInput): RiskPlan | null {
  const capital = cents(input.capital);
  const stake = cents(input.stake);
  const dailyBudget = cents(input.dailyLossBudget);
  const simultaneous = input.simultaneousContracts;
  const streak = input.lossStreak;
  const netPayout = input.netPayoutPercent;

  if (capital === null || stake === null || dailyBudget === null ||
      capital < 100 || stake < 1 || dailyBudget < 1 ||
      dailyBudget > capital || stake > capital ||
      !Number.isSafeInteger(simultaneous) || simultaneous < 1 || simultaneous > 100 ||
      !Number.isSafeInteger(streak) || streak < 1 || streak > 100 ||
      !Number.isFinite(netPayout) || netPayout <= 0 || netPayout > 500) {
    return null;
  }

  const exposure = stake * simultaneous;
  const sequentialLoss = stake * streak;
  const payoutFraction = netPayout / 100;
  const toMoney = (value: number) => Math.round(value) / 100;
  const winsToShow = [...new Set([
    0,
    Math.floor(simultaneous * .25),
    Math.floor(simultaneous * .5),
    Math.ceil(simultaneous * .75),
    simultaneous,
  ])].sort((a,b) => a-b);

  const scenarios = winsToShow.map(wins => {
    const losses = simultaneous - wins;
    const netCents = Math.round(wins * stake * payoutFraction) - losses * stake;
    return {
      wins, losses,
      netResult: toMoney(netCents),
      endingCapital: toMoney(capital + netCents),
    };
  });

  return {
    capital: toMoney(capital),
    stake: toMoney(stake),
    dailyLossBudget: toMoney(dailyBudget),
    grossExposure: toMoney(exposure),
    exposurePercent: exposure / capital * 100,
    dailyBudgetPercent: dailyBudget / capital * 100,
    stakePercent: stake / capital * 100,
    remainingBudgetAfterFullLosses: toMoney(Math.max(0, dailyBudget - exposure)),
    maxFullStakeLossesWithinBudget: Math.floor(Math.min(dailyBudget, capital) / stake),
    sequentialLossAmount: toMoney(sequentialLoss),
    virtualBalanceAfterStreak: toMoney(capital - sequentialLoss),
    breakEvenWinRatePercent: 100 / (1 + payoutFraction),
    netPayoutPercent: netPayout,
    breachDailyBudget: exposure > dailyBudget,
    breachCapital: exposure > capital,
    streakExceedsBudget: sequentialLoss > dailyBudget,
    payoutAssumption: payoutFraction,
    scenarios,
  };
}
