import test from "node:test";
import assert from "node:assert/strict";
import { calculateRiskPlan } from "../lib/risk/command-center.ts";

const defaults = {
  capital: 500, stake: 5, dailyLossBudget: 20,
  simultaneousContracts: 3, lossStreak: 5, netPayoutPercent: 80,
};

test("Risk center computes full-loss budgets in integer cents", () => {
  const plan = calculateRiskPlan(defaults);
  assert.ok(plan);
  assert.equal(plan.grossExposure, 15);
  assert.equal(plan.exposurePercent, 3);
  assert.equal(plan.stakePercent, 1);
  assert.equal(plan.dailyBudgetPercent, 4);
  assert.equal(plan.remainingBudgetAfterFullLosses, 5);
  assert.equal(plan.maxFullStakeLossesWithinBudget, 4);
  assert.equal(plan.sequentialLossAmount, 25);
  assert.equal(plan.virtualBalanceAfterStreak, 475);
  assert.equal(plan.breachDailyBudget, false);
  assert.equal(plan.streakExceedsBudget, true);
  assert.ok(Math.abs(plan.breakEvenWinRatePercent - 55.55555555555556) < 1e-8);
});

test("Risk center warnings cover simultaneous budget and virtual balance breaches", () => {
  const budget = calculateRiskPlan({...defaults, simultaneousContracts: 5});
  assert.ok(budget);
  assert.equal(budget.grossExposure, 25);
  assert.equal(budget.breachDailyBudget, true);
  assert.equal(budget.breachCapital, false);

  const capital = calculateRiskPlan({...defaults, simultaneousContracts: 100});
  assert.ok(capital);
  assert.equal(capital.breachCapital, false);
  const overCapital = calculateRiskPlan({
    ...defaults, capital: 100, stake: 25, dailyLossBudget: 50, simultaneousContracts: 5,
  });
  assert.ok(overCapital);
  assert.equal(overCapital.breachCapital, true);
});

test("Outcome examples use assumed NET payout, not gross payout or a forecast", () => {
  const plan = calculateRiskPlan(defaults);
  assert.ok(plan);
  const noWins = plan.scenarios.find(x => x.wins === 0);
  const allWins = plan.scenarios.find(x => x.wins === 3);
  assert.deepEqual(noWins, {wins:0,losses:3,netResult:-15,endingCapital:485});
  assert.deepEqual(allWins, {wins:3,losses:0,netResult:12,endingCapital:512});
  assert.equal(new Set(plan.scenarios.map(x => x.wins)).size, plan.scenarios.length);
});

test("Money rounding never accumulates floating point pennies", () => {
  const plan = calculateRiskPlan({
    capital: 100, stake: .35, dailyLossBudget: 1.05,
    simultaneousContracts: 3, lossStreak: 2, netPayoutPercent: 75,
  });
  assert.ok(plan);
  assert.equal(plan.grossExposure, 1.05);
  assert.equal(plan.remainingBudgetAfterFullLosses, 0);
  assert.equal(plan.maxFullStakeLossesWithinBudget, 3);
  assert.equal(plan.sequentialLossAmount, .7);
});

test("Malformed or overly optimistic risk parameters fail closed", () => {
  for (const overrides of [
    {capital:0},{capital:-2},{capital:Infinity},{capital:NaN},
    {stake:0},{stake:Infinity},{stake:600},
    {dailyLossBudget:0},{dailyLossBudget:600},{dailyLossBudget:Infinity},
    {simultaneousContracts:0},{simultaneousContracts:101},
    {simultaneousContracts:1.5},{lossStreak:0},{lossStreak:101},
    {lossStreak:2.5},{netPayoutPercent:0},{netPayoutPercent:-1},
    {netPayoutPercent:501},{netPayoutPercent:Infinity},
  ]) {
    assert.equal(calculateRiskPlan({...defaults,...overrides}), null,
      "Invalid input unexpectedly calculated: " + JSON.stringify(overrides));
  }
});
