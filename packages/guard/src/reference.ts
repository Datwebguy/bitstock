/**
 * Independent reference price (docs/adr/0003). The source sits behind this interface so it can be replaced.
 * Current source: Yahoo Finance chart API. See docs/VERIFIED.md section 6 for its verified behaviour and limits.
 */
import type { ReferenceObs } from "./rules.ts";

export interface ReferencePriceSource {
  readonly name: string;
  read(ticker: string): Promise<ReferenceObs>;
}

export const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";

/** Parse a Yahoo chart response. Throws on anything that is not a usable, timestamped USD equity price. */
export function parseYahooChart(json: unknown, ticker: string): ReferenceObs {
  const chart = (json as { chart?: { result?: Array<{ meta?: Record<string, unknown> }>; error?: unknown } })?.chart;
  if (!chart) throw new Error("response has no chart object");
  if (chart.error) throw new Error(`source error: ${JSON.stringify(chart.error)}`);
  const meta = chart.result?.[0]?.meta;
  if (!meta) throw new Error("response has no result metadata");
  if (String(meta["symbol"]).toUpperCase() !== ticker.toUpperCase()) throw new Error(`symbol mismatch: asked ${ticker}, got ${String(meta["symbol"])}`);
  if (meta["instrumentType"] !== "EQUITY") throw new Error(`not an equity: ${String(meta["instrumentType"])}`);
  const price = meta["regularMarketPrice"];
  const time = meta["regularMarketTime"];
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) throw new Error("no usable regularMarketPrice");
  if (typeof time !== "number" || !Number.isFinite(time) || time <= 0) throw new Error("no usable regularMarketTime");
  // JSON numbers here carry at most a few decimals; String() gives the shortest exact representation of the parsed value.
  return { pricePerShare: String(price), currency: String(meta["currency"] ?? ""), priceTime: new Date(time * 1000).toISOString() };
}

export class YahooChartSource implements ReferencePriceSource {
  readonly name = "Yahoo Finance chart API (regularMarketPrice)";
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  constructor(options: { fetch?: typeof fetch; timeoutMs?: number } = {}) {
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 8000;
  }
  async read(ticker: string): Promise<ReferenceObs> {
    if (!/^[A-Z.]{1,10}$/.test(ticker)) throw new Error(`invalid ticker: ${ticker}`);
    const res = await this.#fetch(`${YAHOO_CHART_URL}${ticker}?interval=1d&range=1d`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; bitstock-guard)", Accept: "application/json" },
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseYahooChart(await res.json(), ticker);
  }
}
