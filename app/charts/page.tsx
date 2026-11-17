import LiveCandleChart from "@/app/components/LiveCandleChart";

export const metadata = {
  title: "Live Candlestick Charts | Trade Scheme FX",
  description: "Public Deriv synthetic index ticks displayed as observed OHLC candlesticks. Research and practice only.",
};

export default function ChartsPage() {
  return <LiveCandleChart />;
}
