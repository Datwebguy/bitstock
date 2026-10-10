import { Suspense } from "react";
import { SplitReveal } from "@/components/Motion";
import type { Metadata } from "next";
import { MarketHud } from "@/components/Market";

export const metadata: Metadata = { title: "Check" };

export default function CheckPage() {
  return (
    <>
      <p className="eyebrow">Live check · tokenized stocks on BNB Smart Chain</p>
      <SplitReveal as="h1" text="Is it a sensible time to buy?" />
      <p className="lede">Pick a stock. See whether its market is open, how many shares each token stands for, the real stock's price and the gap between them, all read live.</p>
      <Suspense><MarketHud /></Suspense>
      <p className="footer-note">Refreshed every 30 seconds. Not investment advice. Tokenized stocks can be paused or blocked by the company that issues them.</p>
    </>
  );
}
