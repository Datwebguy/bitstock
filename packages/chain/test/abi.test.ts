import { describe, expect, it } from "vitest";
import { decodeUint, encodeAddress, encodeUint, isAddress } from "../src/abi.ts";
import { selector } from "../src/keccak.ts";

describe("abi", () => {
  it("encodes an address as a lower-case padded word", () => {
    expect(encodeAddress("0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436")).toBe("00000000000000000000000002fca66c1d1afb4e2a7884261eb00f63598a7436");
  });
  it("rejects malformed addresses", () => {
    expect(isAddress("0x123")).toBe(false);
    expect(() => encodeAddress("0xZZfca66C1D1aFB4E2A7884261eB00F63598a7436")).toThrow();
  });
  it("encodes uints at the edges", () => {
    expect(encodeUint(0n)).toBe("0".repeat(64));
    expect(encodeUint((1n << 256n) - 1n)).toBe("f".repeat(64));
    expect(() => encodeUint(-1n)).toThrow();
    expect(() => encodeUint(1n << 256n)).toThrow();
  });
  it("decodes a uint and refuses an empty result instead of reading it as zero", () => {
    expect(decodeUint("0x0000000000000000000000000000000000000000000000000de37a7dfdbb85b9")).toBe(1000778223752807865n);
    expect(() => decodeUint("0x")).toThrow();
  });
  it("has the standard allowance selector", () => {
    expect(selector("allowance(address,address)")).toBe("0xdd62ed3e");
  });
});
