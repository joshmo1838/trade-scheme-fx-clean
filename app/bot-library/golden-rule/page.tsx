import type {Metadata} from "next";
import GoldenRuleLab from "./GoldenRuleLab";
export const metadata:Metadata={
 title:"SENFX Golden Rule | Paper-Only Profitability Evidence Lab",
 description:"Prospective research for the fifteen original SENFX bots. Paper observations only; no broker execution, real-money trading or promised profits."
};
export default function GoldenRulePage(){return <GoldenRuleLab/>;}
