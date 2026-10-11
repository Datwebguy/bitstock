/**
 * Translation of on-screen text for the web app. A language model only rewords text here; it never
 * decides anything (AGENTS.md section 4, item 2). Every number, amount, address and name in the source
 * must come back unchanged, or the English text is kept. Results are cached, so each sentence is
 * translated once. Without OPENAI_API_KEY the English text is returned as it is.
 */
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const LANGUAGES: Record<string, string> = {
  zh: "Simplified Chinese",
  es: "Spanish",
  pt: "Brazilian Portuguese",
  tr: "Turkish",
  vi: "Vietnamese",
};
export const MAX_TEXTS = 60;
export const MAX_CHARS = 700;

// Names that must never be translated or dropped.
const NAMES = ["Bitstock", "Binance", "BNB Smart Chain", "BNB", "USDT", "WalletConnect", "BscScan", "Pyth", "Yahoo Finance", "Agentic Wallet", "PancakeSwap", "NVIDIA", "Nvidia"];

/** The parts of a text that must survive translation exactly: numbers, amounts, addresses, tickers and names. */
export function protectedParts(text: string): string[] {
  const parts = new Set<string>();
  for (const m of text.matchAll(/0x[0-9a-fA-F]{4,}(?:…[0-9a-fA-F]{2,})?/g)) parts.add(m[0]);
  for (const m of text.matchAll(/\d+(?:[.,]\d+)*/g)) parts.add(m[0]);
  for (const m of text.matchAll(/\b[A-Z]{2,6}\b/g)) parts.add(m[0]);
  for (const n of NAMES) if (text.includes(n)) parts.add(n);
  return [...parts];
}

/** True when the translation keeps every protected part of the source, character for character. */
export function keepsFacts(source: string, translated: string): boolean {
  if (!translated.trim()) return false;
  const numbersOut = new Set(translated.match(/\d+(?:[.,]\d+)*/g) ?? []);
  return protectedParts(source).every((p) => (/^\d/.test(p) ? numbersOut.has(p) : translated.includes(p)));
}

export interface Translator {
  translate(lang: string, texts: string[]): Promise<string[]>;
}

type Complete = (system: string, user: string) => Promise<string>;

export function openAiComplete(apiKey: string, model: string): Complete {
  return async (system, user) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`translation service answered HTTP ${res.status}`);
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return body.choices?.[0]?.message?.content ?? "";
  };
}

export class CachedTranslator implements Translator {
  readonly #db: DatabaseSync;
  readonly #complete: Complete | null;

  constructor(dataDir: string, complete: Complete | null) {
    const path = join(dataDir, "bitstock.sqlite");
    mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.#db.exec("CREATE TABLE IF NOT EXISTS translations (lang TEXT NOT NULL, key TEXT NOT NULL, source TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (lang, key))");
    this.#complete = complete;
  }

  get enabled(): boolean {
    return this.#complete !== null;
  }

  async translate(lang: string, texts: string[]): Promise<string[]> {
    const key = (t: string) => createHash("sha256").update(t).digest("hex");
    const get = this.#db.prepare("SELECT text FROM translations WHERE lang = ? AND key = ?");
    const out = texts.map((t) => (get.get(lang, key(t)) as { text: string } | undefined)?.text ?? null);
    const missing = [...new Set(texts.filter((_, i) => out[i] === null))];
    if (missing.length && this.#complete) {
      const system = `You translate short pieces of a finance web app's interface from English into ${LANGUAGES[lang]}. Keep the meaning exact and the tone plain and calm. Keep every number, amount, percentage, date digit, wallet address, stock ticker and these names exactly as written: ${NAMES.join(", ")}. Do not add or remove information. Reply as JSON: {"t": [translations in the same order]}.`;
      try {
        const raw = await this.#complete(system, JSON.stringify(missing));
        const parsed = JSON.parse(raw) as { t?: unknown };
        const list = Array.isArray(parsed.t) ? parsed.t : [];
        const put = this.#db.prepare("INSERT OR REPLACE INTO translations (lang, key, source, text, at) VALUES (?, ?, ?, ?, ?)");
        missing.forEach((src, i) => {
          const tr = typeof list[i] === "string" ? (list[i] as string) : "";
          if (keepsFacts(src, tr)) put.run(lang, key(src), src, tr, new Date().toISOString());
        });
      } catch {
        /* the English text stays */
      }
    }
    return texts.map((t, i) => out[i] ?? (get.get(lang, key(t)) as { text: string } | undefined)?.text ?? t);
  }
}

export function translatorFromEnv(env: NodeJS.ProcessEnv): CachedTranslator {
  const apiKey = env["OPENAI_API_KEY"];
  const model = env["OPENAI_MODEL"] || "gpt-4o-mini";
  return new CachedTranslator(env["DATA_DIR"] || "./data", apiKey ? openAiComplete(apiKey, model) : null);
}
