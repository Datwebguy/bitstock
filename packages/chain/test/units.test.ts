import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { floorToPlaces, fromUnits, MULTIPLIER_ONE, rawToUi, rescale, toUnits, uiToRaw } from "../src/units.ts";

const decimals = fc.integer({ min: 0, max: 36 });
const amount = fc.bigInt({ min: 0n, max: (1n << 200n) });
const multiplier = fc.bigInt({ min: 1n, max: 10n ** 20n }); // up to 100 shares per token

describe("units: examples", () => {
  it("converts both ways exactly", () => {
    expect(toUnits("1.5", 18)).toBe(1_500000000000000000n);
    expect(fromUnits(1_500000000000000000n, 18)).toBe("1.5");
    expect(toUnits("0", 18)).toBe(0n);
    expect(fromUnits(0n, 18)).toBe("0");
    expect(fromUnits(1n, 18)).toBe("0.000000000000000001");
    expect(toUnits("10", 0)).toBe(10n);
  });
  it("refuses junk, negatives and excess precision rather than rounding silently", () => {
    for (const bad of ["", "-1", "1e3", "1.2.3", "abc", " "]) expect(() => toUnits(bad, 18)).toThrow();
    expect(() => toUnits("0.1234567", 6)).toThrow(/decimal places/);
    expect(() => toUnits("1", -1)).toThrow();
  });
  it("floors to 8 places for box sizes", () => {
    expect(fromUnits(floorToPlaces(toUnits("0.123456789123", 18), 18, 8), 18)).toBe("0.12345678");
  });
  it("applies the live NVDAB multiplier", () => {
    const m = 1000778223752807865n;
    expect(rawToUi(10n ** 18n, m)).toBe(m);
    expect(uiToRaw(m, m)).toBe(10n ** 18n);
    expect(() => rawToUi(1n, 0n)).toThrow();
  });
});

describe("units: properties", () => {
  it("fromUnits then toUnits returns the same amount", () => {
    fc.assert(fc.property(amount, decimals, (u, d) => toUnits(fromUnits(u, d), d) === u));
  });
  it("fromUnits never uses exponent notation or trailing zeros", () => {
    fc.assert(fc.property(amount, decimals, (u, d) => {
      const s = fromUnits(u, d);
      return !/e/i.test(s) && !(s.includes(".") && s.endsWith("0"));
    }));
  });
  it("rawToUi then uiToRaw never gives back more raw tokens than went in", () => {
    fc.assert(fc.property(amount, multiplier, (raw, m) => uiToRaw(rawToUi(raw, m), m) <= raw));
  });
  it("the round trip loses less than one raw unit per share-unit of rounding", () => {
    fc.assert(fc.property(amount, multiplier, (raw, m) => raw - uiToRaw(rawToUi(raw, m), m) <= MULTIPLIER_ONE / m + 1n));
  });
  it("rawToUi is monotonic", () => {
    fc.assert(fc.property(amount, amount, multiplier, (a, b, m) => (a <= b ? rawToUi(a, m) <= rawToUi(b, m) : rawToUi(a, m) >= rawToUi(b, m))));
  });
  it("floorToPlaces never rounds up and keeps at most that many places", () => {
    fc.assert(fc.property(amount, fc.integer({ min: 0, max: 18 }), (u, p) => {
      const f = floorToPlaces(u, 18, p);
      const frac = fromUnits(f, 18).split(".")[1] ?? "";
      return f <= u && frac.length <= p;
    }));
  });
  it("rescaling up then down is the identity", () => {
    fc.assert(fc.property(amount, fc.integer({ min: 0, max: 18 }), fc.integer({ min: 0, max: 18 }), (u, a, b) => {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      return rescale(rescale(u, lo, hi), hi, lo) === u;
    }));
  });
});
