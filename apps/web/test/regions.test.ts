import { describe, expect, it } from "vitest";
import { regionVerdict } from "../lib/regions.ts";

describe("claim region block", () => {
  it("blocks every listed country, case-insensitively", () => {
    for (const c of ["US", "us", "CA", "NL", "GB", "JP", "IR", "CU", "KP", "PR", "GU"]) expect(regionVerdict(c, null).blocked).toBe(true);
  });
  it("blocks Crimea, Sevastopol, Donetsk and Luhansk but not the rest of Ukraine", () => {
    for (const r of ["43", "UA-40", "14", "09"]) expect(regionVerdict("UA", r).blocked).toBe(true);
    expect(regionVerdict("UA", "30")).toEqual({ blocked: false, known: true });
  });
  it("allows other countries and reports an unknown country as unknown, not allowed", () => {
    expect(regionVerdict("SG", null)).toEqual({ blocked: false, known: true });
    expect(regionVerdict("", null)).toEqual({ blocked: false, known: false });
    expect(regionVerdict(undefined, undefined)).toEqual({ blocked: false, known: false });
  });
});
