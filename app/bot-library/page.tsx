import type {Metadata} from "next";
import FifteenPaperBotLibrary from "./FifteenPaperBotLibrary";
export const metadata:Metadata={
 title:"15 SENFX Deriv Paper Bots | Trade Scheme FX",
 description:"Explore and run 15 original public-market-tick research bots with paper-only risk caps and emergency Stop. No Deriv Demo or Real orders.",
};
export default function Page(){return <FifteenPaperBotLibrary/>;}
