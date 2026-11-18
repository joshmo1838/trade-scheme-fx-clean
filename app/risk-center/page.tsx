import type { Metadata } from "next";
import PortfolioRiskCenter from "@/app/components/PortfolioRiskCenter";
import "./risk-center.css";

export const metadata: Metadata = {
  title: "Risk Command Center | Trade Scheme FX",
  description: "Plan hypothetical full-stake contract losses, daily exposure and stress tests. Research only; no trades or settings changes.",
};

export default function RiskCenterPage() {
  return <PortfolioRiskCenter />;
}
