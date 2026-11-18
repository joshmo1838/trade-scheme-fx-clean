import type { Metadata } from "next";
import "./globals.css";
import "./components/workspace-operations-deck.css";
import GlobalTicker from "../components/GlobalTicker";

export const metadata: Metadata = {
  title: "Trade Scheme FX | Trading Workspace & Demo Learning",
  description: "Explore the Trade Scheme FX trading workspace, market tools, educational charts and customer-controlled Deriv Demo account learning. Independent of Deriv.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><GlobalTicker />{children}</body></html>;
}
