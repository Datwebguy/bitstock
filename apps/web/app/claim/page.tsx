import { SplitReveal } from "@/components/Motion";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Claim" };

export default function ClaimPage() {
  return (
    <>
      <p className="eyebrow">Your first slice</p>
      <SplitReveal as="h1" text="The free first slice is not open yet" />
      <p className="lede">When it opens, a person with no BNB will be able to receive a small amount of a tokenized stock as a gift, with the network fee paid for them. It is not available today, and nothing on this page pretends otherwise.</p>
      <section className="card">
        <h2>Who will be able to claim</h2>
        <p className="small">Claims will not be available from the United States, Canada, the Netherlands, the United Kingdom, Japan, Iran, Cuba, North Korea, Crimea, Donetsk or Luhansk.</p>
      </section>
    </>
  );
}
