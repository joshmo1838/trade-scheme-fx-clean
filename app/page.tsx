import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { alternates: { canonical: "https://www.tradesche.com/" } };

export default function Home() {
  redirect("/login");
}
