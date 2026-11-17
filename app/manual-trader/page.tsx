import ManualPaperTicket from "@/app/components/ManualPaperTicket";
export const metadata = {
  title: "Manual Paper Trader | Trade Scheme FX",
  description: "Practice manual Rise/Fall decisions against observed public Deriv ticks, without account orders or funds.",
};
export default function Page() { return <ManualPaperTicket />; }
