import type { Metadata } from "next";
import { SplitReveal } from "@/components/Motion";
import { restrictedList } from "@/lib/regions";

export const metadata: Metadata = { title: "Not available in your region", robots: { index: false } };

export default function ClaimRestricted() {
  return (
    <>
      <p className="eyebrow">Your first slice</p>
      <SplitReveal as="h1" text="Claims are not available in your region" />
      <section className="card">
        <p className="small">Free first slices cannot be claimed from {restrictedList()}. Your connection appears to come from one of these places, so this page will not offer a claim.</p>
        <p className="small muted">This is a legal restriction on the gift, not a judgement about you. Bitstock does not store anything about this visit.</p>
      </section>
    </>
  );
}
