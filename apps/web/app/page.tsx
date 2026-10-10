import { MarketHud } from "@/components/Market";

export default function CheckPage() {
  return (
    <>
      <p className="eyebrow">NVIDIA on BNB Smart Chain</p>
      <h1>Buy small. Only after the checks pass.</h1>
      <p className="lede">Before every buy, Bitstock reads the market, the token, an independent stock price and a dry run of the trade, then shows you each result and where it came from.</p>
      <MarketHud />
      <p className="footer-note">Live data, refreshed every 30 seconds. Not investment advice. Tokenized stocks can be paused or blocked by their issuer.</p>
    </>
  );
}
