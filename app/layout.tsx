import type { Metadata } from "next";
import "./globals.css";
import "./components/workspace-operations-deck.css";
import GlobalTicker from "../components/GlobalTicker";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.tradesche.com"),
  title: "Trade Scheme FX - Free Deriv Bots, AI & Smart Trading Tools",
  applicationName: "Trade Scheme FX",
  openGraph: { siteName: "Trade Scheme FX", type: "website" },
  description: "Explore 15 free Deriv bots, AI-powered market analysis, live charts, smart trading tools and virtual-money demo trading. Independent of Deriv.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><GlobalTicker />{children}</body></html>;
}
