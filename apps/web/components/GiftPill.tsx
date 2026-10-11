"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** The gift's state as the agent reports it right now, never a status typed into the page. */
export function GiftPill() {
  const [g, setG] = useState<{ open: boolean; remaining?: number; boxes?: unknown[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api<{ open: boolean; remaining?: number; boxes?: unknown[] }>("/gift").then(setG).catch(() => setFailed(true));
  }, []);
  if (failed) return <span className="pill idle">Status unavailable</span>;
  if (!g) return <span className="pill idle">Reading…</span>;
  if (!g.open) return <span className="pill warn">Not open right now</span>;
  return <span className="pill good">Open · {g.remaining} of {g.boxes?.length} boxes left</span>;
}
