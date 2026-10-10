import { describe, expect, it } from "vitest";
import { sharesPerTokenNote } from "../src/market.ts";
import { parseTokenList } from "../src/tokens.ts";

// Shapes follow the recorded rwa/tokens response; values are test fixtures only.
const entry = (over: Record<string, unknown> = {}) => ({
  binanceChainId: "56",
  tokenContractAddress: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
  tokenSymbol: "NVDAB",
  tokenName: "NVIDIA bStock",
  decimals: "18",
  underlyingTicker: "NVDA",
  underlyingName: "Nvidia Corp",
  tokenPrice: "1.5",
  statusInfo: { openState: false, marketStatus: null, reasonCode: "TRADING", reasonMsg: null, nextOpenTime: null, nextCloseTime: null },
  ...over,
});

describe("parseTokenList", () => {
  it("keeps valid entries, lower-cases addresses and sorts by symbol", () => {
    const list = parseTokenList([entry({ tokenSymbol: "TSLAB", tokenContractAddress: "0x5B1910EAAD6450E50F816082AA078C41F10C292F" }), entry()]);
    expect(list.map((t) => t.symbol)).toEqual(["NVDAB", "TSLAB"]);
    expect(list[1]!.address).toBe("0x5b1910eaad6450e50f816082aa078c41f10c292f");
    expect(list[0]!.session?.openState).toBe(false);
    expect(list[0]!.company).toBe("Nvidia Corp");
  });
  it("drops entries with a bad address, symbol, decimals or chain, and duplicates", () => {
    expect(parseTokenList([entry({ tokenContractAddress: "0x12" }), entry({ tokenSymbol: "" }), entry({ decimals: "x" }), entry({ binanceChainId: "1" })])).toEqual([]);
    expect(parseTokenList([entry(), entry()])).toHaveLength(1);
  });
  it("returns nothing for a response that is not a list", () => {
    expect(parseTokenList(null)).toEqual([]);
    expect(parseTokenList({ data: [] })).toEqual([]);
  });
  it("reads a missing price or status as null, never a filler", () => {
    const [t] = parseTokenList([entry({ tokenPrice: "", statusInfo: undefined })]);
    expect(t!.price).toBeNull();
    expect(t!.session).toBeNull();
  });
});

describe("sharesPerTokenNote", () => {
  it("says exactly one share at a multiplier of one", () => {
    expect(sharesPerTokenNote(10n ** 18n, "Nvidia Corp")).toBe("Each token stands for exactly one share of Nvidia Corp.");
  });
  it("says more or less than one and does not call it a dividend", () => {
    expect(sharesPerTokenNote(1000778223752807865n, "Nvidia Corp")).toMatch(/^Each token stands for 1\.000778 shares of Nvidia Corp, a little more than one\./);
    expect(sharesPerTokenNote(999000000000000000n, "X")).toMatch(/a little less than one/);
  });
});
