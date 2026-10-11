import { Suspense } from "react";
import type { Metadata } from "next";
import { AutopilotView } from "@/components/Autopilot";
import { SplitReveal } from "@/components/Motion";

export const metadata: Metadata = { title: "Autopilot" };

export default function AutopilotPage() {
  return (
    <>
      <p className="eyebrow">Autopilot · your own Binance Agentic Wallet</p>
      <SplitReveal as="h1" text="Buy at the open, only after the checks pass" />
      <p className="lede">Tell your AI agent what to buy and when. Bitstock waits for the market, checks everything, and your Agentic Wallet buys within the limits you set in the Binance App. You approve every buy.</p>
      <Suspense><AutopilotView /></Suspense>
    </>
  );
}
