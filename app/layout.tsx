import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trade Scheme FX | Trade smarter. Stay in control.',
  description: 'Explore automated trading technology with customer-controlled broker connections and clear risk information.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
