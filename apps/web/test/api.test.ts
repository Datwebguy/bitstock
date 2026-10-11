import { describe, expect, it } from "vitest";
import { fromLine, friendlySource, humanize, sessionWord, trimDecimal, units18 } from "../lib/api.ts";

describe("web display helpers", () => {
  it("names data sources in plain words", () => {
    expect(friendlySource("Binance Web3 API rwa/underlying-market")).toBe("Binance");
    expect(friendlySource("BSC eth_call uiMultiplier/newUIMultiplier/effectiveAt")).toBe("the token on BNB Smart Chain");
    expect(friendlySource("BNB Smart Chain: uiMultiplier, newUIMultiplier, effectiveAt")).toBe("the token on BNB Smart Chain");
    expect(friendlySource("Market chart feed (regularMarketPrice) (fallback; earlier source failed: Pyth Pro …)")).toBe("a separate market feed");
    expect(friendlySource("Binance Web3 API pre-transaction/simulate")).toBe("Binance test run");
    expect(friendlySource("Binance Web3 API aggregator/quote")).toBe("Binance live price");
    expect(friendlySource("something internal")).toBe("Bitstock");
  });
  it("says where and when in one line", () => {
    expect(fromLine("Binance Web3 API rwa/tokens", null)).toBe("From Binance");
    expect(fromLine("Binance Web3 API rwa/tokens", "2026-10-10T23:00:00.000Z")).toMatch(/^From Binance · /);
  });
  it("words market states plainly", () => {
    expect(sessionWord(null).text).toBe("Unavailable");
    expect(sessionWord({ openState: true, reasonCode: "TRADING" }).text).toBe("Trading");
    expect(sessionWord({ openState: false, reasonCode: "TRADING" }).text).toBe("Market closed");
    expect(sessionWord({ openState: true, reasonCode: "ASSET_PAUSED" }).cls).toBe("bad");
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
