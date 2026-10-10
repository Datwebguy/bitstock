import { SplitReveal } from "@/components/Motion";
import type { Metadata } from "next";
import { HoldingsView } from "@/components/Holdings";

export const metadata: Metadata = { title: "Holdings" };

export default function HoldingsPage() {
  return (
    <>
      <p className="eyebrow">Holdings and explain</p>
      <SplitReveal as="h1" text="What you own, in plain words" />
      <p className="lede">Your tokens, the shares they stand for, and what changes them.</p>
      <HoldingsView />
    </>
  );
}
