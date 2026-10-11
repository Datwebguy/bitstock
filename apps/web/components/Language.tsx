"use client";
import { useEffect, useRef, useState } from "react";
import { AGENT_URL } from "@/lib/api";

/** Languages offered. Text is translated by the agent, which keeps every number and name exactly. */
export const LANGS = [
  { code: "en", label: "English" },
  { code: "zh", label: "简体中文" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "tr", label: "Türkçe" },
  { code: "vi", label: "Tiếng Việt" },
] as const;
type Lang = (typeof LANGS)[number]["code"];
const KEY = "lang";
const SKIP = "script,style,code,pre,textarea,select,option,.mono,.num,[data-no-translate],[aria-hidden=\"true\"],.wordmark";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGS.some((l) => l.code === saved)) return saved as Lang;
  } catch {
    /* storage unavailable */
  }
  const nav = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2).toLowerCase();
  return (LANGS.find((l) => l.code === nav)?.code ?? "en") as Lang;
}

function loadCache(lang: Lang): Map<string, string> {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(`tr:${lang}`) ?? "{}") as Record<string, string>));
  } catch {
    return new Map();
  }
}
function saveCache(lang: Lang, m: Map<string, string>): void {
  try {
    localStorage.setItem(`tr:${lang}`, JSON.stringify(Object.fromEntries([...m].slice(-1500))));
  } catch {
    /* full or unavailable: keep it in memory only */
  }
}

/** The picker, and the translator it drives: page text is swapped in place and restored for English. */
export function LanguagePicker() {
  const [lang, setLang] = useState<Lang>("en");
  const [status, setStatus] = useState<"idle" | "busy" | "failed">("idle");
  const state = useRef({ originals: new WeakMap<Text, string>(), ours: new WeakMap<Text, string>(), touched: new Set<Text>(), attrs: new Set<HTMLInputElement>() });

  useEffect(() => setLang(initialLang()), []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-Hans" : lang;
    const s = state.current;
    if (lang === "en") {
      for (const n of s.touched) { const o = s.originals.get(n); if (o !== undefined && n.isConnected) n.nodeValue = o; }
      for (const el of s.attrs) { const o = el.dataset.ph; if (o) el.placeholder = o; }
      s.touched.clear(); s.attrs.clear();
      setStatus("idle");
      return;
    }
    const cache = loadCache(lang);
    const pending = new Set<string>();
    // Sentences already sent in this language. A sentence the service returns unchanged (or could not translate)
    // is not asked for again, so the page never loops on the service.
    const tried = new Set<string>();
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined, retry: ReturnType<typeof setTimeout> | undefined, inflight = false;

    const apply = (n: Text, src: string) => {
      const tr = cache.get(src.trim());
      if (!tr) return false;
      const lead = src.match(/^\s*/)![0], trail = src.match(/\s*$/)![0];
      const v = lead + tr + trail;
      if (n.nodeValue !== v) { s.ours.set(n, v); n.nodeValue = v; }
      s.touched.add(n);
      return true;
    };
    const scan = () => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = w.nextNode())) {
        const n = node as Text; const v = n.nodeValue ?? "";
        if (s.ours.get(n) === v) continue;
        if (!n.parentElement || n.parentElement.closest(SKIP)) continue;
        const src = v; const key = src.trim();
        if (key.length < 2 || key.length > 700 || !/\p{L}{2}/u.test(key)) continue;
        s.originals.set(n, src);
        if (!apply(n, src) && !tried.has(key)) pending.add(key);
      }
      document.querySelectorAll<HTMLInputElement>("input[placeholder]").forEach((el) => {
        const src = el.dataset.ph ?? el.placeholder; el.dataset.ph = src;
        const tr = cache.get(src); if (tr) { el.placeholder = tr; s.attrs.add(el); } else if (/\p{L}{2}/u.test(src) && !tried.has(src)) pending.add(src);
      });
      if (pending.size) void flush();
    };
    const flush = async () => {
      if (inflight || !AGENT_URL) return;
      inflight = true;
      setStatus("busy");
      let failed = false;
      try {
        while (alive && pending.size) {
          const batch = [...pending].slice(0, 60);
          batch.forEach((b) => { pending.delete(b); tried.add(b); });
          const res = await fetch(`${AGENT_URL}/v1/translate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang, texts: batch }) }).catch(() => null);
          if (!res?.ok) { batch.forEach((b) => tried.delete(b)); failed = true; break; }
          const body = (await res.json().catch(() => ({}))) as { enabled?: boolean; translations?: string[] };
          if (!body.enabled) break; // translation is not switched on: English stays
          batch.forEach((src, i) => { const t = body.translations?.[i]; if (t && t !== src) cache.set(src, t); });
          saveCache(lang, cache);
          if (alive) scan(); // show each batch as it arrives
        }
      } finally {
        inflight = false;
      }
      if (!alive) return;
      setStatus(failed ? "failed" : "idle");
      if (failed) retry = setTimeout(() => { setStatus("idle"); scan(); }, 20_000); // try again later, not at once
    };
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(scan, 120); };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    scan();
    return () => { alive = false; mo.disconnect(); if (timer) clearTimeout(timer); if (retry) clearTimeout(retry); setStatus("idle"); };
  }, [lang]);

  return (
    <label className={`lang${status === "busy" ? " lang-busy" : status === "failed" ? " lang-failed" : ""}`} data-no-translate aria-busy={status === "busy"} title={status === "failed" ? "Translation is unavailable right now. It will try again shortly." : undefined}>
      <span className="sr-only">Language{status === "busy" ? ", translating" : status === "failed" ? ", translation unavailable right now" : ""}</span>
      <select
        value={lang}
        onChange={(e) => {
          const v = e.target.value as Lang;
          try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
          if (v === "en" || lang !== "en") {
            // restore English first so the next language translates from the original text
            setLang("en");
            if (v !== "en") setTimeout(() => setLang(v), 0);
          } else setLang(v);
        }}
      >
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  );
}
