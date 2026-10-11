import { Suspense } from "react";
import { SplitReveal } from "@/components/Motion";
import type { Metadata } from "next";
import { BuyFlow } from "@/components/Buy";

export const metadata: Metadata = { title: "Buy" };

export default function BuyPage() {
  return (
    <>
      <p className="eyebrow">Protected buy</p>
      <SplitReveal as="h1" text="Check, then buy" />
      <p className="lede">Pick a stock and an amount. Bitstock runs five checks on live data and tests your exact trade. You see every result, then sign in your own wallet.</p>
      <Suspense><BuyFlow /></Suspense>
    </>
  );
}
