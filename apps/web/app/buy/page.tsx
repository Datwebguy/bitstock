import type { Metadata } from "next";
import { BuyFlow } from "@/components/Buy";

export const metadata: Metadata = { title: "Buy" };

const NVDAB = "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436";

export default function BuyPage() {
  const maxUsd = process.env.NEXT_PUBLIC_BUY_MAX_USD || "5";
  return (
    <>
      <p className="eyebrow">Protected buy</p>
      <h1>Check, then buy</h1>
      <p className="lede">Bitstock runs five checks on live data and dry-runs the exact trade. You see every result, then sign in your own wallet.</p>
      <BuyFlow nvdab={NVDAB} maxUsd={maxUsd} />
    </>
  );
}
