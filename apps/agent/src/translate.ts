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

const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

/**
 * True when the translation keeps every protected part of the source, character for character, and adds no
 * number the source does not have (AGENTS.md section 4, item 2). Numbers are compared exactly as written, so a
 * decimal point turned into a decimal comma is refused too.
 */
export function keepsFacts(source: string, translated: string): boolean {
  if (!translated.trim()) return false;
  const numbersIn = new Set(source.match(NUMBER_RE) ?? []);
  const numbersOut = translated.match(NUMBER_RE) ?? [];
  if (numbersOut.some((n) => !numbersIn.has(n))) return false;
  const outSet = new Set(numbersOut);
  return protectedParts(source).every((p) => (/^\d/.test(p) ? outSet.has(p) : translated.includes(p)));
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

export interface TranslatorLimits {
  /** Most sentences kept on record; the oldest are dropped first. */
  maxRows: number;
  /** Most calls to the model per UTC day, across restarts. Past it, the English text is returned. */
  maxCallsPerDay: number;
}

/** The endpoint is public, so storage and model cost are both bounded (TRANSLATE_MAX_ROWS, TRANSLATE_MAX_CALLS_PER_DAY). */
export const DEFAULT_TRANSLATOR_LIMITS: TranslatorLimits = { maxRows: 20_000, maxCallsPerDay: 500 };

export class CachedTranslator implements Translator {
  readonly #db: DatabaseSync;
  readonly #complete: Complete | null;
  readonly #limits: TranslatorLimits;
  readonly #now: () => Date;

  constructor(dataDir: string, complete: Complete | null, limits: TranslatorLimits = DEFAULT_TRANSLATOR_LIMITS, now: () => Date = () => new Date()) {
    this.#limits = limits;
    this.#now = now;
    const path = join(dataDir, "bitstock.sqlite");
    mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.#db.exec("CREATE TABLE IF NOT EXISTS translations (lang TEXT NOT NULL, key TEXT NOT NULL, source TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (lang, key))");
    this.#db.exec("CREATE INDEX IF NOT EXISTS translations_at ON translations(at)");
    this.#db.exec("CREATE TABLE IF NOT EXISTS translation_usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL)");
    this.#complete = complete;
  }

  /** Close the database handle (tests, shutdown). */
  dispose(): void {
    this.#db.close();
  }

  /** Count one model call against today's budget. False when the budget is spent. */
  #spendCall(): boolean {
    const day = this.#now().toISOString().slice(0, 10);
    const row = this.#db.prepare("SELECT calls FROM translation_usage WHERE day = ?").get(day) as { calls: number } | undefined;
    if ((row ? Number(row.calls) : 0) >= this.#limits.maxCallsPerDay) return false;
    this.#db.prepare("INSERT INTO translation_usage (day, calls) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET calls = calls + 1").run(day);
    return true;
  }

  /** Keep at most maxRows sentences, dropping the oldest. */
  #trim(): void {
    const n = Number((this.#db.prepare("SELECT COUNT(*) AS n FROM translations").get() as { n: number }).n);
    if (n > this.#limits.maxRows) {
      this.#db.prepare("DELETE FROM translations WHERE rowid IN (SELECT rowid FROM translations ORDER BY at ASC LIMIT ?)").run(n - this.#limits.maxRows);
    }
  }

  get enabled(): boolean {
    return this.#complete !== null;
  }

  async translate(lang: string, texts: string[]): Promise<string[]> {
    const key = (t: string) => createHash("sha256").update(t).digest("hex");
    const get = this.#db.prepare("SELECT text FROM translations WHERE lang = ? AND key = ?");
    const out = texts.map((t) => (get.get(lang, key(t)) as { text: string } | undefined)?.text ?? null);
    const missing = [...new Set(texts.filter((_, i) => out[i] === null))];
    if (missing.length && this.#complete && this.#spendCall()) {
      const system = `You translate short pieces of a finance web app's interface from English into ${LANGUAGES[lang]}. Keep the meaning exact and the tone plain and calm. Keep every number, amount, percentage, date digit, wallet address, stock ticker and these names exactly as written: ${NAMES.join(", ")}. Do not add or remove information. Reply as JSON: {"t": [translations in the same order]}.`;
      try {
        const raw = await this.#complete(system, JSON.stringify(missing));
        const parsed = JSON.parse(raw) as { t?: unknown };
        const list = Array.isArray(parsed.t) ? parsed.t : [];
        const put = this.#db.prepare("INSERT OR REPLACE INTO translations (lang, key, source, text, at) VALUES (?, ?, ?, ?, ?)");
        missing.forEach((src, i) => {
          const tr = typeof list[i] === "string" ? (list[i] as string) : "";
          if (!tr.trim()) return; // the model gave nothing: ask again next time
          // A translation that changed a number or name is refused and the English is kept. Keeping it on record stops
          // the same sentence from being sent to the model again and again.
          put.run(lang, key(src), src, keepsFacts(src, tr) ? tr : src, this.#now().toISOString());
        });
        this.#trim();
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
  const limit = (name: string, fallback: number) => {
    const v = env[name];
    if (v === undefined || v === "") return fallback;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a whole number of zero or more`);
    return n;
  };
  const limits = { maxRows: limit("TRANSLATE_MAX_ROWS", DEFAULT_TRANSLATOR_LIMITS.maxRows), maxCallsPerDay: limit("TRANSLATE_MAX_CALLS_PER_DAY", DEFAULT_TRANSLATOR_LIMITS.maxCallsPerDay) };
  return new CachedTranslator(env["DATA_DIR"] || "./data", apiKey ? openAiComplete(apiKey, model) : null, limits);
}
