"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** The gift's state as the agent reports it right now, never a status typed into the page. */
export function GiftPill() {
  const [g, setG] = useState<{ open: boolean; remaining?: number; boxes?: unknown[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => api<{ open: boolean; remaining?: number; boxes?: unknown[] }>("/gift").then((v) => { if (alive) { setG(v); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (failed) return <span className="pill idle">Status unavailable</span>;
  if (!g) return <span className="pill idle">Reading…</span>;
  if (!g.open) return <span className="pill warn">Not open right now</span>;
  return <Link href="/claim" className="pill good" style={{ textDecoration: "none" }}>Open · {g.remaining} of {g.boxes?.length} boxes left · Claim</Link>;
}
