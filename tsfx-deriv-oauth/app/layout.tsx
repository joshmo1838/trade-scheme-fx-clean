import type { Metadata } from "next";
import "./globals.css";
import MarketTicker from "../components/MarketTicker";

export const metadata: Metadata = {
  title: "Trade Scheme FX | T&J AI Market Assistant",
  description: "Meet T&J, the Trade Scheme FX AI market-analysis assistant. Explore forex, gold, indices and trading tools while staying in control.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><MarketTicker />{children}</body></html>;
}
