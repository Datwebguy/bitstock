import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assessDividend, type DividendEvidence } from "../src/dividend.ts";
import { changePercent, formatFixed, impliedNetPerShare, parseFixed } from "../src/multiplier.ts";
import { assertPlainAndAllowed, companyNote, explainHolding, explainMultiplierChange, numbersOnlyFromSource } from "../src/render.ts";

const LIVE = 1000778223752807865n; // NVDAB uiMultiplier read live, docs/evidence/07-onchain-nvdab.json
const ev = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../docs/evidence", name), "utf8"));

describe("multiplier math", () => {
  it("computes the percent change", () => {
    expect(formatFixed(changePercent(10n ** 18n, LIVE), 4)).toBe("0.0778");
    expect(formatFixed(changePercent(LIVE, LIVE), 4)).toBe("0.0000");
    expect(() => changePercent(0n, LIVE)).toThrow();
  });
  it("implied amount is already net: it is not reduced again by withholding", () => {
    const net = impliedNetPerShare(10n ** 18n, LIVE, parseFixed("224.87"));
    expect(formatFixed(net, 6)).toBe("0.174999");
  });
});

// Fixture: complete, matching evidence. Real inputs are run by the live dividend check script.
const complete: DividendEvidence = {
  oldMultiplier: { value: 10n ** 18n, source: "test" },
  newMultiplier: { value: LIVE, source: "test" },
  announced: { amountPerShare: "0.25", exDate: "2026-09-10", source: "test" },
  reinvestPrice: { value: "224.87", label: "test" },
  confirmedWithholding: "0.30",
  tolerancePercent: "2",
};

describe("dividend check", () => {
  it("says dividend, in the owner's words, only when everything is known and matches", () => {
    const v = assessDividend(complete);
    expect(v.verdict).toBe("dividend");
    expect(explainMultiplierChange(v)).toBe(
      "Your token now represents 0.0778% more shares. That is your reinvested dividend (already net of withholding). It offsets the share price drop on the ex-dividend date.",
    );
  });
  it("says multiplier change when the implied amount does not match the announcement", () => {
    const v = assessDividend({ ...complete, announced: { ...complete.announced!, amountPerShare: "0.50" } });
    expect(v.verdict).toBe("multiplier_change");
    expect(explainMultiplierChange(v)).toContain("This is a multiplier change.");
  });
  it("says multiplier change when the earlier multiplier or the withholding rate is unconfirmed", () => {
    expect(assessDividend({ ...complete, oldMultiplier: null }).verdict).toBe("multiplier_change");
    const v = assessDividend({ ...complete, confirmedWithholding: null });
    expect(v.verdict).toBe("multiplier_change");
    expect(explainMultiplierChange(v)).toContain("withholding rate the issuer applies has not been confirmed");
  });
  it("never claims holdings grew", () => {
    for (const v of [assessDividend(complete), assessDividend({ ...complete, oldMultiplier: null })]) expect(explainMultiplierChange(v)).not.toMatch(/grew|slept/i);
  });
});

describe("text checks", () => {
  it("rejects phrases Bitstock does not say", () => {
    expect(() => assertPlainAndAllowed("Your holdings grew while you slept")).toThrow();
    expect(() => assertPlainAndAllowed("A guaranteed return")).toThrow();
    expect(() => assertPlainAndAllowed("This is provably random")).toThrow();
    expect(assertPlainAndAllowed("Committed in advance and revealed after.")).toBeTruthy();
  });
  it("rejects any number not in the source data", () => {
    expect(numbersOnlyFromSource("You hold 0.004334 NVDAB, 1,000 shares", ["0.004334", "1000"]).ok).toBe(true);
    expect(numbersOnlyFromSource("Up 12% this week", ["0.0778"])).toEqual({ ok: false, unexpected: ["12"] });
  });
  it("explains a holding in shares", () => {
    expect(explainHolding(10n ** 18n, LIVE, "NVDAB", "NVIDIA")).toBe("You hold 1.000000 NVDAB. Each token stands for 1.000778 shares, so you hold 1.000778 shares of NVIDIA.");
  });
  it("renders the company note from the real profile response, and says unavailable for missing fields", () => {
    const profile = ev("b2-rwa-underlying-nvdab.railway-sg.json").result.profile;
    const note = companyNote(profile);
    expect(note).toContain("Ticker: NVDA. Industry: Technology. Chief executive: Jensen Huang. Website: https://www.nvidia.com.");
    expect(companyNote({})).toBe("Ticker: unavailable. Industry: unavailable. Chief executive: unavailable. Website: unavailable. unavailable");
  });
});
