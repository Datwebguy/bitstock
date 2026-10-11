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
  const state = useRef({ originals: new WeakMap<Text, string>(), ours: new WeakMap<Text, string>(), touched: new Set<Text>(), attrs: new Set<HTMLInputElement>() });

  useEffect(() => setLang(initialLang()), []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-Hans" : lang;
    const s = state.current;
    if (lang === "en") {
      for (const n of s.touched) { const o = s.originals.get(n); if (o !== undefined && n.isConnected) n.nodeValue = o; }
      for (const el of s.attrs) { const o = el.dataset.ph; if (o) el.placeholder = o; }
      s.touched.clear(); s.attrs.clear();
      return;
    }
    const cache = loadCache(lang);
    const pending = new Set<string>();
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined, inflight = false;

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
        if (!apply(n, src)) pending.add(key);
      }
      document.querySelectorAll<HTMLInputElement>("input[placeholder]").forEach((el) => {
        const src = el.dataset.ph ?? el.placeholder; el.dataset.ph = src;
        const tr = cache.get(src); if (tr) { el.placeholder = tr; s.attrs.add(el); } else if (/\p{L}{2}/u.test(src)) pending.add(src);
      });
      if (pending.size) void flush();
    };
    const flush = async () => {
      if (inflight || !AGENT_URL) return;
      inflight = true;
      try {
        while (alive && pending.size) {
          const batch = [...pending].slice(0, 60); batch.forEach((b) => pending.delete(b));
          const res = await fetch(`${AGENT_URL}/v1/translate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang, texts: batch }) }).catch(() => null);
          if (!res?.ok) break;
          const body = (await res.json()) as { enabled?: boolean; translations?: string[] };
          if (!body.enabled) break; // translation is not switched on: English stays
          batch.forEach((src, i) => { const t = body.translations?.[i]; if (t && t !== src) cache.set(src, t); });
          saveCache(lang, cache);
        }
      } finally {
        inflight = false;
      }
      if (alive) scan();
    };
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(scan, 120); };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    scan();
    return () => { alive = false; mo.disconnect(); if (timer) clearTimeout(timer); };
  }, [lang]);

  return (
    <label className="lang" data-no-translate>
      <span className="sr-only">Language</span>
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
