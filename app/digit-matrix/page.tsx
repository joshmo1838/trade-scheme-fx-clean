import type { Metadata } from "next";
import DigitMatrixScanner from "@/app/components/DigitMatrixScanner";

export const metadata: Metadata = {
  title: "SENFX Digit Matrix | Public Volatility Digit Scanner | Trade Scheme FX",
  description: "Scan observed last-digit patterns across ten available Deriv volatility indices. Precision-correct, no fabricated profits, and no broker order submission.",
};

export default function Page(){return <DigitMatrixScanner />;}
