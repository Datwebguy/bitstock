import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_GUARD_CONFIG as cfg } from "../src/config.ts";
import { FallbackReferenceSource, parsePythLatest, pickEquityFeed, pythLatestRequestBody, scaleMantissa } from "../src/pyth.ts";
import type { ReferencePriceSource } from "../src/reference.ts";
import { checkReference } from "../src/rules.ts";

const ev = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../docs/evidence", name), "utf8"));

describe("pyth pro", () => {
  it("picks the regular-hours US equity feed from the real symbols entry", () => {
    const entry = ev("pyth-pro-symbols-nvda.json").response_entry_for_1314;
    expect(pickEquityFeed([entry], "NVDA")).toEqual({ id: 1314, symbol: "Equity.US.NVDA/USD", exponent: -5, minChannel: "fixed_rate@50ms" });
  });
  it("refuses a missing or non-stable feed", () => {
    expect(() => pickEquityFeed([], "NVDA")).toThrow(/no Pyth Pro feed/);
    expect(() => pickEquityFeed([{ symbol: "Equity.US.NVDA/USD", state: "inactive" }], "NVDA")).toThrow(/not stable/);
  });
  it("scales mantissas exactly", () => {
    expect(scaleMantissa(22928000n, -5)).toBe("229.28000");
    expect(scaleMantissa(5n, -5)).toBe("0.00005");
    expect(scaleMantissa(0n, -5)).toBe("0.00000");
    expect(scaleMantissa(-12n, -2)).toBe("-0.12");
    expect(scaleMantissa(7n, 2)).toBe("700");
  });
  // Shape from the Pyth Pro payload reference (priceFeedId, price mantissa, exponent, feedUpdateTimestamp in µs, marketSession).
  // This is a test fixture only; the live response is checked separately and saved in docs/evidence/.
  const fixture = { parsed: { timestampUs: "1791576000000000", priceFeeds: [{ priceFeedId: 1314, price: "22928000", exponent: -5, confidence: "1500", publisherCount: 4, feedUpdateTimestamp: 1791576000000000, marketSession: "closed" }] } };
  const feed = { id: 1314, symbol: "Equity.US.NVDA/USD", exponent: -5, minChannel: "fixed_rate@50ms" };
  it("parses a feed entry found by shape", () => {
    expect(parsePythLatest(fixture, feed)).toEqual({ pricePerShare: "229.28000", currency: "USD", priceTime: "2026-10-09T20:00:00.000Z", session: "closed", confidence: "0.01500", publisherCount: 4 });
  });
  it("refuses responses without the feed, a price or a time", () => {
    expect(() => parsePythLatest({ parsed: { priceFeeds: [] } }, feed)).toThrow(/no entry/);
    expect(() => parsePythLatest({ parsed: { priceFeeds: [{ priceFeedId: 1314, price: null }] } }, feed)).toThrow(/no price/);
    expect(() => parsePythLatest({ parsed: { priceFeeds: [{ priceFeedId: 1314, price: "1", exponent: -5 }] } }, feed)).toThrow(/update time/);
  });
  it("asks for the feed at its minimum channel with the properties the guard uses", () => {
    expect(pythLatestRequestBody(feed)).toMatchObject({ priceFeedIds: [1314], channel: "fixed_rate@50ms" });
  });
  it("treats a fresh price outside the regular session as not live (never a pass)", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    const perToken = 230n * 10n ** 18n;
    const c = checkReference({ source: "t", asOf: null, value: { pricePerShare: "230", currency: "USD", priceTime: "2026-10-12T11:59:00Z", session: "preMarket" } }, perToken, 10n ** 18n, now, cfg);
    expect(c.result).toBe("warn");
    const live = checkReference({ source: "t", asOf: null, value: { pricePerShare: "230", currency: "USD", priceTime: "2026-10-12T11:59:00Z", session: "regular" } }, perToken, 10n ** 18n, now, cfg);
    expect(live.result).toBe("pass");
  });
  it("falls back in order and says which source answered", async () => {
    const bad: ReferencePriceSource = { name: "A", read: async () => { throw new Error("HTTP 401"); } };
    const good: ReferencePriceSource = { name: "B", read: async () => ({ pricePerShare: "1", currency: "USD", priceTime: "2026-10-09T20:00:00Z" }) };
    const r = await new FallbackReferenceSource([bad, good]).read("NVDA");
    expect(r.sourceName).toContain("B (fallback; earlier source failed: A: HTTP 401)");
    await expect(new FallbackReferenceSource([bad]).read("NVDA")).rejects.toThrow(/HTTP 401/);
  });
});
