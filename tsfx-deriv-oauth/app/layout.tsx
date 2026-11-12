import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trade Scheme FX | Trade smarter. Stay in control.",
  description: "A customer-first trading tools platform. Connect your own Deriv account and stay in control.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
