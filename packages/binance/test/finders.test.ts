import { describe, expect, it } from "vitest";
import { findMarketStatus, findSwapTx } from "../src/finders.ts";

// Shapes below are test fixtures; real responses are saved in docs/evidence/.
const status = { openState: false, marketStatus: "closed", reasonCode: "MARKET_CLOSED", reasonMsg: "Weekend or Holiday", nextOpenTime: 1, nextCloseTime: 2 };

describe("findMarketStatus", () => {
  it("finds the object under any key name", () => {
    expect(findMarketStatus({ tokenSymbol: "X", anyKey: status })).toBe(status);
  });
  it("finds it inside arrays and deeper levels", () => {
    expect(findMarketStatus({ list: [{ a: 1 }, { nested: { deeper: status } }] })).toBe(status);
  });
  it("finds it when the root is the object itself", () => {
    expect(findMarketStatus(status)).toBe(status);
  });
  it("returns undefined when absent so callers fail closed", () => {
    expect(findMarketStatus({ a: { b: 1 }, c: [1, 2] })).toBeUndefined();
    expect(findMarketStatus(null)).toBeUndefined();
    expect(findMarketStatus("text")).toBeUndefined();
  });
  it("ignores an openState that is not a boolean", () => {
    expect(findMarketStatus({ s: { openState: "true" } })).toBeUndefined();
  });
});

describe("findSwapTx", () => {
  const tx = { from: "0xa", to: "0xb", data: "0xdead", value: "0" };
  it("finds the transaction object by from/to/data", () => {
    expect(findSwapTx({ routerResult: { x: 1 }, whatever: tx })).toBe(tx);
  });
  it("requires all three string fields", () => {
    expect(findSwapTx({ t: { from: "0xa", to: "0xb" } })).toBeUndefined();
    expect(findSwapTx({ t: { from: "0xa", to: "0xb", data: 5 } })).toBeUndefined();
  });
  it("returns undefined for empty input", () => {
    expect(findSwapTx(undefined)).toBeUndefined();
  });
});
