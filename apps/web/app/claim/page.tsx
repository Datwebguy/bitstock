import { SplitReveal } from "@/components/Motion";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { ClaimView } from "@/components/Claim";
import { restrictedList } from "@/lib/regions";

export const metadata: Metadata = { title: "Claim" };

export default async function ClaimPage() {
  const region = (await headers()).get("x-claim-region");
  return (
    <>
      <p className="eyebrow">Your first slice</p>
      <SplitReveal as="h1" text="A free first slice of a tokenized stock" />
      <p className="lede">A small amount of a tokenized stock, as a gift. No BNB needed: Bitstock pays the network fee. It is not available from {restrictedList()}.</p>
      <ClaimView region={region} />
    </>
  );
}
