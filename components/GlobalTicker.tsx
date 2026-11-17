"use client";
import { usePathname } from "next/navigation";
import MarketTicker from "@/components/MarketTicker";

/** The landing page places the market ticker below its navigation, as in the video.
 * Other routes retain the existing global ticker unchanged.
 */
export default function GlobalTicker() {
  const pathname = usePathname();
  return pathname === "/" ? null : <MarketTicker />;
}
