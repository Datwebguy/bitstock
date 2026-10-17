import { describe, expect, it } from "vitest";
import { assignmentText, BOX_WEIGHTS, boxAmounts, commitment, newSecret, shuffle, verifyReveal } from "../src/gift.ts";

describe("gift boxes", () => {
  it("weights sum to 100", () => {
    expect(BOX_WEIGHTS.reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("splits what was received, rounds each box down to 8 decimals, never more than received", () => {
    const received = 4333697515150079n; // fixture, smallest units
    const boxes = boxAmounts(received);
    expect(boxes).toHaveLength(10);
    for (const b of boxes) expect(b % 10n ** 10n).toBe(0n);
    const total = boxes.reduce((a, b) => a + b, 0n);
    expect(total <= received).toBe(true);
    expect(received - total < 10n * 10n ** 10n).toBe(true);
    expect(boxes[0]).toBe(866730000000000n);
  });
  it("refuses zero and amounts too small for ten boxes", () => {
    expect(() => boxAmounts(0n)).toThrow();
    expect(() => boxAmounts(10n ** 10n)).toThrow(/too small/);
  });
});

describe("draw", () => {
  it("shuffles without losing or adding boxes", () => {
    const boxes = boxAmounts(10n ** 18n);
    const s = shuffle(boxes);
    expect([...s].sort()).toEqual([...boxes].sort());
  });
  it("commits to the assignment and verifies the reveal; any change fails", () => {
    const secret = newSecret();
    const text = assignmentText(shuffle(boxAmounts(10n ** 18n)));
    const c = commitment(text, secret);
    expect(c).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyReveal(c, text, secret)).toBe(true);
    expect(verifyReveal(c, text.replace("1", "2"), secret)).toBe(false);
    expect(verifyReveal(c, text, newSecret())).toBe(false);
    expect(() => commitment(text, "zz")).toThrow();
  });
});

import { claimRegionAllowed, giftConfigFromEnv } from "../src/gift-service.ts";

describe("gift config and region", () => {
  it("refuses a relayer BNB cap above 0.01 and bad keys; derives addresses from keys", () => {
    expect(() => giftConfigFromEnv({ GIFT_RELAYER_MAX_BNB: "0.02" })).toThrow(/0.01/);
    expect(() => giftConfigFromEnv({ GIFT_VAULT_PRIVATE_KEY: "abc" })).toThrow();
    const key = "0x4646464646464646464646464646464646464646464646464646464646464646";
    expect(() => giftConfigFromEnv({ GIFT_VAULT_PRIVATE_KEY: key })).toThrow(/GIFT_TOKEN/); // no stock is chosen for the operator
    const c = giftConfigFromEnv({ GIFT_VAULT_PRIVATE_KEY: key, GIFT_TOKEN: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436" });
    expect(c.vault).toBe("0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f");
    expect(c.relayer).toBeNull();
    expect(c.maxRelayerBnbWei).toBe(10n ** 16n);
  });
  it("reads the vault's test pool, with a $1 default, and refuses one that is not a dollar amount", () => {
    expect(giftConfigFromEnv({}).testPoolUsd).toBe("1");
    expect(giftConfigFromEnv({ GIFT_TEST_POOL_USD: "2.50" }).testPoolUsd).toBe("2.50");
    expect(() => giftConfigFromEnv({ GIFT_TEST_POOL_USD: "lots" })).toThrow(/GIFT_TEST_POOL_USD/);
  });
  it("refuses restricted and unknown places", () => {
    for (const c of ["US", "CA", "NL", "GB", "JP", "IR", "CU", "KP", "PR"]) expect(claimRegionAllowed(c, null)).toBe(false);
    expect(claimRegionAllowed("UA", "43")).toBe(false);
    expect(claimRegionAllowed("UA", "30")).toBe(true);
    expect(claimRegionAllowed("NG", null)).toBe(true);
    expect(claimRegionAllowed(null, null)).toBe(false);
  });
});
