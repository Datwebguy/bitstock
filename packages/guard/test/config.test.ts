import { describe, expect, it } from "vitest";
import { DEFAULT_GUARD_CONFIG, guardConfigFromEnv, validateGuardConfig } from "../src/config.ts";

describe("guard config", () => {
  it("defaults are valid", () => {
    expect(validateGuardConfig(DEFAULT_GUARD_CONFIG)).toEqual([]);
  });
  it("refuses bad values", () => {
    expect(validateGuardConfig({ ...DEFAULT_GUARD_CONFIG, priceImpactMaxPercent: "abc" })).not.toEqual([]);
    expect(validateGuardConfig({ ...DEFAULT_GUARD_CONFIG, priceImpactWarnPercent: "2", priceImpactMaxPercent: "1" })).not.toEqual([]);
    expect(validateGuardConfig({ ...DEFAULT_GUARD_CONFIG, limitCeilingPercent: "0.9" })).not.toEqual([]);
    expect(validateGuardConfig({ ...DEFAULT_GUARD_CONFIG, multiplierWindowHours: 0 })).not.toEqual([]);
  });
  it("reads overrides from the environment and refuses to start on invalid ones", () => {
    expect(guardConfigFromEnv({ GUARD_RULES_VERSION: "2", GUARD_MAX_PRICE_IMPACT_PERCENT: "0.8" }).priceImpactMaxPercent).toBe("0.8");
    expect(() => guardConfigFromEnv({ GUARD_MAX_PRICE_IMPACT_PERCENT: "-1" })).toThrow();
  });
});
