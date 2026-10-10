import { describe, expect, it } from "vitest";
import { friendlySource, humanize, trimDecimal, units18 } from "../lib/api.ts";

describe("web display helpers", () => {
  it("names data sources in plain words", () => {
    expect(friendlySource("Binance Web3 API rwa/underlying-market")).toBe("Binance market data");
    expect(friendlySource("BSC eth_call uiMultiplier/newUIMultiplier/effectiveAt")).toBe("The NVDAB token contract on BNB Smart Chain");
    expect(friendlySource("Yahoo Finance chart API (regularMarketPrice) (fallback; earlier source failed: Pyth Pro …)")).toContain("Pyth, was unavailable");
    expect(friendlySource("Binance Web3 API pre-transaction/simulate")).toBe("Binance dry run of this exact trade");
  });
  it("replaces machine timestamps in sentences", () => {
    expect(humanize("from 2026-10-09T20:00:00.000Z. ok")).not.toContain("T20:00:00");
  });
  it("formats decimals without floating point", () => {
    expect(trimDecimal("230.70940392173479711845", 2)).toBe("230.70");
    expect(trimDecimal("abc", 2)).toBeNull();
    expect(units18("4333697515150079")).toBe("0.004333");
    expect(units18(null)).toBeNull();
  });
});
