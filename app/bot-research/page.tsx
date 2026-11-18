import type { Metadata } from "next";
import StrategyLab from "@/app/strategy-lab/StrategyLab";

export const metadata:Metadata={
 title:"SENFX Bot Optimization Research | Trade Scheme FX",
 description:"Compare verified public-market-tick observations under three experimental filters for SENFX paper bots without modifying real trading or the existing forward test.",
};
export default function Page(){return <StrategyLab/>;}
