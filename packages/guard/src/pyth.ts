/**
 * Pyth Pro (formerly Lazer) as the independent reference price (docs/adr/0003).
 * Docs: https://docs.pyth.network/price-feeds/pro. Feed IDs are resolved live from the public symbols API,
 * never hardcoded. The API key is read from the environment by the caller and sent only as a bearer token.
 */
import type { ReferenceObs } from "./rules.ts";
import type { ReferencePriceSource } from "./reference.ts";

export const PYTH_PRO_LATEST_URL = "https://pyth-lazer.dourolabs.app/v1/latest_price";
export const PYTH_SYMBOLS_URL = "https://pyth.dourolabs.app/v1/symbols";

export interface PythFeed {
  id: number;
  symbol: string;
  exponent: number;
  minChannel: string;
}

/** Pick the regular-hours US equity feed for a ticker from a symbols response. */
export function pickEquityFeed(symbols: unknown, ticker: string): PythFeed {
  if (!Array.isArray(symbols)) throw new Error("symbols response is not a list");
  const want = `Equity.US.${ticker.toUpperCase()}/USD`;
  const hit = (symbols as Array<Record<string, unknown>>).find((s) => s["symbol"] === want);
  if (!hit) throw new Error(`no Pyth Pro feed named ${want}`);
  if (hit["state"] !== "stable") throw new Error(`${want} is in state ${String(hit["state"])}, not stable`);
  const id = hit["pyth_lazer_id"];
  const exponent = hit["exponent"];
  const minChannel = hit["min_channel"];
  if (typeof id !== "number" || typeof exponent !== "number" || typeof minChannel !== "string") throw new Error(`${want} is missing its id, exponent or channel`);
  return { id, symbol: want, exponent, minChannel };
}

/** mantissa × 10^exponent as a plain decimal string, without floating point. */
export function scaleMantissa(mantissa: bigint, exponent: number): string {
  if (exponent >= 0) return (mantissa * 10n ** BigInt(exponent)).toString();
  const places = -exponent;
  const negative = mantissa < 0n;
  const digits = (negative ? -mantissa : mantissa).toString().padStart(places + 1, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

function findFeedObject(node: unknown, id: number, depth = 0): Record<string, unknown> | undefined {
  if (depth > 6 || typeof node !== "object" || node === null) return undefined;
  if (Array.isArray(node)) {
    for (const x of node) {
      const f = findFeedObject(x, id, depth + 1);
      if (f) return f;
    }
    return undefined;
  }
  const o = node as Record<string, unknown>;
  if (Number(o["priceFeedId"]) === id && "price" in o) return o;
  for (const v of Object.values(o)) {
    const f = findFeedObject(v, id, depth + 1);
    if (f) return f;
  }
  return undefined;
}

/** Parse a latest_price response for one feed. Throws unless it holds a price, an exponent and an update time. */
export function parsePythLatest(json: unknown, feed: PythFeed): ReferenceObs & { confidence?: string; publisherCount?: number } {
  const f = findFeedObject(json, feed.id);
  if (!f) throw new Error(`response has no entry for feed ${feed.id}`);
  const priceRaw = f["price"];
  if (priceRaw === null || priceRaw === undefined || !/^-?\d+$/.test(String(priceRaw))) throw new Error("feed has no price");
  const exponent = typeof f["exponent"] === "number" ? (f["exponent"] as number) : feed.exponent;
  const mantissa = BigInt(String(priceRaw));
  if (mantissa <= 0n) throw new Error("feed price is not positive");
  const updatedUs = f["feedUpdateTimestamp"];
  if (updatedUs === null || updatedUs === undefined || !/^\d+$/.test(String(updatedUs))) throw new Error("feed has no update time");
  const priceTime = new Date(Number(BigInt(String(updatedUs)) / 1000n)).toISOString();
  const conf = f["confidence"];
  const out: ReferenceObs & { confidence?: string; publisherCount?: number } = {
    pricePerShare: scaleMantissa(mantissa, exponent),
    currency: "USD",
    priceTime,
  };
  if (typeof f["marketSession"] === "string") out.session = f["marketSession"] as string;
  if (conf !== null && conf !== undefined && /^\d+$/.test(String(conf))) out.confidence = scaleMantissa(BigInt(String(conf)), exponent);
  if (typeof f["publisherCount"] === "number") out.publisherCount = f["publisherCount"] as number;
  return out;
}

export function pythLatestRequestBody(feed: PythFeed): Record<string, unknown> {
  return {
    priceFeedIds: [feed.id],
    properties: ["price", "exponent", "confidence", "publisherCount", "feedUpdateTimestamp", "marketSession"],
    formats: [],
    channel: feed.minChannel,
    parsed: true,
    jsonBinaryEncoding: "hex",
  };
}

export class PythProSource implements ReferencePriceSource {
  readonly name = "Pyth Pro (Equity.US regular-hours feed)";
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #feeds = new Map<string, PythFeed>();
  constructor(options: { apiKey: string; fetch?: typeof fetch; timeoutMs?: number }) {
    if (!options.apiKey) throw new Error("Pyth Pro needs an API key");
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 8000;
  }

  async feed(ticker: string): Promise<PythFeed> {
    const cached = this.#feeds.get(ticker);
    if (cached) return cached;
    const res = await this.#fetch(`${PYTH_SYMBOLS_URL}?query=${encodeURIComponent(ticker)}`, { signal: AbortSignal.timeout(this.#timeoutMs) });
    if (!res.ok) throw new Error(`symbols HTTP ${res.status}`);
    const feed = pickEquityFeed(await res.json(), ticker);
    this.#feeds.set(ticker, feed);
    return feed;
  }

  /** The raw latest_price response, for evidence. */
  async latestRaw(ticker: string): Promise<{ feed: PythFeed; httpStatus: number; body: unknown }> {
    const feed = await this.feed(ticker);
    const res = await this.#fetch(PYTH_PRO_LATEST_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.#apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(pythLatestRequestBody(feed)),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep the text */
    }
    return { feed, httpStatus: res.status, body };
  }

  async read(ticker: string): Promise<ReferenceObs> {
    const { feed, httpStatus, body } = await this.latestRaw(ticker);
    if (httpStatus !== 200) throw new Error(`latest_price HTTP ${httpStatus}${typeof body === "string" ? `: ${body.slice(0, 120)}` : ""}`);
    return { ...parsePythLatest(body, feed), sourceName: `${this.name}, feed ${feed.id} ${feed.symbol}` };
  }
}

/** Try each source in order; return the first answer and say which source gave it. */
export class FallbackReferenceSource implements ReferencePriceSource {
  readonly name: string;
  readonly #sources: ReferencePriceSource[];
  constructor(sources: ReferencePriceSource[]) {
    if (sources.length === 0) throw new Error("at least one reference source is needed");
    this.#sources = sources;
    this.name = sources.map((s) => s.name).join(", then ");
  }
  async read(ticker: string): Promise<ReferenceObs> {
    const errors: string[] = [];
    for (const [i, s] of this.#sources.entries()) {
      try {
        const r = await s.read(ticker);
        const label = r.sourceName ?? s.name;
        return { ...r, sourceName: i === 0 ? label : `${label} (fallback; earlier source failed: ${errors.join("; ")})` };
      } catch (e) {
        errors.push(`${s.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    throw new Error(errors.join("; "));
  }
}
