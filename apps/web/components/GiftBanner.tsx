"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, trimDecimal, type ListedToken } from "@/lib/api";

interface Gift { open: boolean; token?: string; fundedUsd?: string | null; boxes?: unknown[]; remaining?: number; expiresAt?: string }

/** A banner that sends people to the free first slice while it is open. Everything shown is read from the agent. */
export function GiftBanner({ tokens }: { tokens: ListedToken[] | null }) {
  const [g, setG] = useState<Gift | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api<Gift>("/gift").then((v) => alive && setG(v)).catch(() => alive && setG(null));
    void load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!g?.open || !g.boxes?.length) return null;
  const token = tokens?.find((t) => t.address.toLowerCase() === g.token?.toLowerCase()) ?? null;
  const company = token?.company ?? token?.ticker ?? "a tokenized stock";
  const worth = g.fundedUsd ? trimDecimal(g.fundedUsd, 0) : null;
  return (
    <section className="gift-banner" aria-labelledby="gift-banner-title">
      <span className="gift-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9h16v4H4z M6 13h12v7H6z M12 9v11 M12 9c-2-4-5-3.5-5-1.5S10 9 12 9z M12 9c2-4 5-3.5 5-1.5S14 9 12 9z" /></svg>
      </span>
      <div className="gift-text">
        <p id="gift-banner-title" className="gift-title">Your first slice is free{worth ? `: $${worth} of ${company}, in ${g.boxes.length} boxes` : ""}</p>
        <p className="small muted">{g.remaining} of {g.boxes.length} boxes left. No BNB needed, because Bitstock pays the network fee. Not available in some countries.</p>
      </div>
      <Link className="btn btn-primary" href="/claim">Claim yours</Link>
    </section>
  );
}
