import { describe, expect, it } from "vitest";
import { keccakHex, selector } from "../src/keccak.ts";

describe("keccak256", () => {
  it("matches the published empty-input vector", () => {
    expect(keccakHex("")).toBe("0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  });
  it("matches the published vector for 'abc'", () => {
    expect(keccakHex("abc")).toBe("0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
  });
  it("matches the published vector for the quick brown fox sentence", () => {
    expect(keccakHex("The quick brown fox jumps over the lazy dog")).toBe("0x4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15");
  });
  it("produces the well-known ERC-20 selectors", () => {
    expect(selector("transfer(address,uint256)")).toBe("0xa9059cbb");
    expect(selector("balanceOf(address)")).toBe("0x70a08231");
    expect(selector("decimals()")).toBe("0x313ce567");
    expect(selector("totalSupply()")).toBe("0x18160ddd");
  });
  it("reproduces the ERC-8056 selector and event topic recorded in docs/VERIFIED.md", () => {
    expect(selector("uiMultiplier()")).toBe("0xa60bf13d");
    expect(keccakHex("UIMultiplierUpdated(uint256,uint256,uint256)")).toBe("0x2205df4534432b2f60654a3fdb48737ffdaf3e9edb1a498bd985bc026b15b055");
  });
});
