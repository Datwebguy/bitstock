import { describe, expect, it } from "vitest";
import { div, formatDecimal, fromUnits, mul, ONE, parseDecimal, percentDiff, tryParseDecimal } from "../src/decimal.ts";

describe("decimal", () => {
  it("parses plain decimals exactly", () => {
    expect(parseDecimal("230.53")).toBe(230_530000000000000000n);
    expect(parseDecimal("0")).toBe(0n);
    expect(parseDecimal("0.000000000000000001")).toBe(1n);
    expect(parseDecimal("-1.5")).toBe(-1_500000000000000000n);
  });
  it("truncates digits beyond 18 rather than rounding up", () => {
    expect(parseDecimal("0.0000000000000000019")).toBe(1n);
  });
  it("handles huge values without precision loss", () => {
    expect(parseDecimal("5536424160000.00")).toBe(5536424160000n * ONE);
    expect(formatDecimal(parseDecimal("123456789012345678901234567890.5"), 1)).toBe("123456789012345678901234567890.5");
  });
  it("rejects scientific notation, blanks and junk", () => {
    for (const bad of ["1e5", "", " ", "abc", "1.2.3", "$229.28", "NaN"]) expect(() => parseDecimal(bad)).toThrow();
    expect(tryParseDecimal("1e5")).toBeUndefined();
    expect(tryParseDecimal(undefined)).toBeUndefined();
  });
  it("multiplies, divides and refuses division by zero", () => {
    expect(mul(parseDecimal("2"), parseDecimal("1.5"))).toBe(parseDecimal("3"));
    expect(div(parseDecimal("1"), parseDecimal("4"))).toBe(parseDecimal("0.25"));
    expect(() => div(ONE, 0n)).toThrow();
  });
  it("computes percent differences", () => {
    expect(formatDecimal(percentDiff(parseDecimal("101"), parseDecimal("100")), 4)).toBe("1.0000");
    expect(formatDecimal(percentDiff(parseDecimal("99"), parseDecimal("100")), 4)).toBe("-1.0000");
  });
  it("converts token units of other decimals", () => {
    expect(fromUnits(1_000000n, 6)).toBe(ONE);
    expect(fromUnits(10n ** 20n, 20)).toBe(ONE);
  });
});
