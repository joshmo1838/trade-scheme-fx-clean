import HedgeScenarioPlanner from "@/app/components/HedgeScenarioPlanner";

export const metadata = {
  title: "Hedging Scenario Planner | Trade Scheme FX",
  description: "Educational price-exposure hedge simulations without executing broker orders.",
};

export default function Page() {
  return <HedgeScenarioPlanner />;
}
