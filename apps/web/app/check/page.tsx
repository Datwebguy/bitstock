import type { Metadata } from "next";
import { MarketHud } from "@/components/Market";

export const metadata: Metadata = { title: "Check" };

export default function CheckPage() {
  return (
    <>
      <p className="eyebrow">Live check · NVIDIA on BNB Smart Chain</p>
      <h1>Is it a sensible time to buy?</h1>
      <p className="lede">The market, the token, an independent stock price and the gap between them, read live with their sources.</p>
      <MarketHud />
      <p className="footer-note">Refreshed every 30 seconds. Not investment advice. Tokenized stocks can be paused or blocked by their issuer.</p>
    </>
  );
}
