/**
 * Every guard threshold, with its default and the reason for it (docs/METHOD.md explains each).
 * The process refuses to start on invalid values (AGENTS.md section 4, item 7).
 */

export interface GuardConfig {
  rulesVersion: string;
  /** Warn when a multiplier change is scheduled within this many hours. */
  multiplierWindowHours: number;
  /** Execution: warn above, fail above. */
  priceImpactWarnPercent: string;
  priceImpactMaxPercent: string;
  /** Reference gap while Wall Street is trading: pass up to warn, warn up to max, fail above. */
  referenceWarnPercent: string;
  referenceMaxPercent: string;
  /** Reference gap against a last close (market shut): never a pass; fail above this. */
  referenceClosedMaxPercent: string;
  /** A reference older than this is treated as a last close, not a live price. */
  referenceLiveMaxAgeMinutes: number;
  /** Slippage on GO. */
  defaultSlippagePercent: string;
  /** LIMIT rule: impact × multiplier + buffer, clamped to [floor, ceiling]. */
  limitImpactMultiplier: string;
  limitBufferPercent: string;
  limitFloorPercent: string;
  limitCeilingPercent: string;
  /** WAIT without a known reopen time: re-check after this many minutes. */
  waitRecheckMinutes: number;
}

export const DEFAULT_GUARD_CONFIG: GuardConfig = {
  rulesVersion: "1",
  multiplierWindowHours: 24,
  priceImpactWarnPercent: "0.3",
  priceImpactMaxPercent: "1.0",
  referenceWarnPercent: "0.5",
  referenceMaxPercent: "2.0",
  referenceClosedMaxPercent: "10.0",
  referenceLiveMaxAgeMinutes: 30,
  defaultSlippagePercent: "0.5",
  limitImpactMultiplier: "2",
  limitBufferPercent: "0.10",
  limitFloorPercent: "0.10",
  limitCeilingPercent: "0.25",
  waitRecheckMinutes: 15,
};

const DECIMAL = /^\d+(\.\d+)?$/;

/** Validate a config. Returns the list of problems; empty means valid. */
export function validateGuardConfig(c: GuardConfig): string[] {
  const problems: string[] = [];
  const dec = (k: keyof GuardConfig) => {
    const v = c[k];
    if (typeof v !== "string" || !DECIMAL.test(v)) problems.push(`${k} must be a non-negative decimal string, got ${JSON.stringify(v)}`);
  };
  const pos = (k: keyof GuardConfig) => {
    const v = c[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) problems.push(`${k} must be a positive number, got ${JSON.stringify(v)}`);
  };
  if (!c.rulesVersion) problems.push("rulesVersion is required");
  (["priceImpactWarnPercent", "priceImpactMaxPercent", "referenceWarnPercent", "referenceMaxPercent", "referenceClosedMaxPercent", "defaultSlippagePercent", "limitImpactMultiplier", "limitBufferPercent", "limitFloorPercent", "limitCeilingPercent"] as const).forEach(dec);
  (["multiplierWindowHours", "referenceLiveMaxAgeMinutes", "waitRecheckMinutes"] as const).forEach(pos);
  if (problems.length) return problems;
  const n = (k: keyof GuardConfig) => Number(c[k]);
  if (n("priceImpactWarnPercent") > n("priceImpactMaxPercent")) problems.push("priceImpactWarnPercent must not exceed priceImpactMaxPercent");
  if (n("referenceWarnPercent") > n("referenceMaxPercent")) problems.push("referenceWarnPercent must not exceed referenceMaxPercent");
  if (n("limitFloorPercent") > n("limitCeilingPercent")) problems.push("limitFloorPercent must not exceed limitCeilingPercent");
  if (n("limitCeilingPercent") > n("defaultSlippagePercent")) problems.push("limitCeilingPercent must not exceed defaultSlippagePercent (LIMIT must be tighter than GO)");
  if (n("defaultSlippagePercent") <= 0) problems.push("defaultSlippagePercent must be above zero");
  return problems;
}

/** Config from environment overrides on top of the defaults. Throws on invalid config. */
export function guardConfigFromEnv(env: NodeJS.ProcessEnv): GuardConfig {
  const c: GuardConfig = { ...DEFAULT_GUARD_CONFIG };
  if (env["GUARD_RULES_VERSION"]) c.rulesVersion = env["GUARD_RULES_VERSION"];
  if (env["GUARD_MAX_PRICE_IMPACT_PERCENT"]) c.priceImpactMaxPercent = env["GUARD_MAX_PRICE_IMPACT_PERCENT"];
  const problems = validateGuardConfig(c);
  if (problems.length) throw new Error(`Invalid guard config: ${problems.join("; ")}`);
  return c;
}
