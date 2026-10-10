import type { Metadata } from "next";
import { HoldingsView } from "@/components/Holdings";

export const metadata: Metadata = { title: "Holdings" };

export default function HoldingsPage() {
  return (
    <>
      <p className="eyebrow">Holdings and explain</p>
      <h1>What you own, in plain words</h1>
      <p className="lede">Your tokens, the shares they stand for, and what changes them.</p>
      <HoldingsView />
    </>
  );
}
