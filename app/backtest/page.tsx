import StrategyBacktestLab from "@/app/components/StrategyBacktestLab";

export const metadata = {
  title: "Strategy Backtest Research | Trade Scheme FX",
  description: "Historical public Deriv tick research with chronological holdout testing and illustrative paper strategy metrics.",
};

export default function Page() {
  return <StrategyBacktestLab />;
}
