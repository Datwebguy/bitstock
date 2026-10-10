import { describe, expect, it } from "vitest";
import { planScan } from "../src/sentry.ts";

describe("sentry scan planning", () => {
  it("starts at the head on the first run (history begins now)", () => {
    expect(planScan(null, 1000n)).toEqual({ from: 1000n, to: 1000n, skipped: null });
  });
  it("continues from the block after the cursor", () => {
    expect(planScan(990n, 1000n, 4000n)).toEqual({ from: 991n, to: 1000n, skipped: null });
  });
  it("does nothing when already at the head", () => {
    expect(planScan(1000n, 1000n)).toBeNull();
  });
  it("records the skipped range when the gap is wider than one scan", () => {
    expect(planScan(0n, 10_000n, 4000n)).toEqual({ from: 6001n, to: 10_000n, skipped: { from: 1n, to: 6000n } });
  });
  it("covers exactly maxSpan blocks without a gap at the boundary", () => {
    expect(planScan(0n, 4000n, 4000n)).toEqual({ from: 1n, to: 4000n, skipped: null });
  });
});
