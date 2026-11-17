import BulkRiskPlanner from "@/app/components/BulkRiskPlanner";

export const metadata = {
  title: "Bulk Risk Planner | Trade Scheme FX",
  description: "Compare virtual batch exposure and contract scenarios without placing any trades.",
};

export default function Page() {
  return <BulkRiskPlanner />;
}
