/**
 * The guard's rules (AGENTS.md section 6). Pure functions of observed inputs: no I/O,
 * no clock reads, no randomness. The same inputs and config always give the same result.
 */
import type { GuardConfig } from "./config.ts";
import { abs, div, formatDecimal, mul, parseDecimal, percentDiff, tryParseDecimal } from "./decimal.ts";
import type { Check, Outcome, SlippageLimit } from "./types.ts";

// ---------- shared observation shapes ----------

export interface MarketStatusObs {
  openState: boolean;
  marketStatus: string | null;
  reasonCode: string | null;
  reasonMsg: string | null;
  nextOpenTime: number | string | null;
  nextCloseTime: number | string | null;
}

export interface Sourced<T> {
  value?: T;
  error?: string;
  source: string;
  asOf: string | null;
}

export interface Route {
  quoteId?: string;
  vendorName?: string;
  executionMode?: string;
  toTokenAmount?: string;
  fromTokenAmount?: string;
  priceImpactPercent?: string;
  isBest?: boolean;
  approveTarget?: string;
  fromToken?: { tokenUnitPrice?: string; decimal?: string };
  toToken?: { decimal?: string };
}

export interface QuoteObs {
  routes?: Route[];
  /** Set when the quote call failed. */
  errorCode?: number;
  errorMessage?: string;
}

export interface SimulationObs {
  status?: string;
  failReason?: string;
  balanceChanges?: Array<{ contractAddress?: string; change?: string; owner?: string }>;
}

const toIso = (t: number | string | null | undefined): string | null => {
  if (t === null || t === undefined || t === "") return null;
  const n = typeof t === "number" ? t : Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString();
};

// ---------- 1. session ----------

const PAUSE_REASONS: Record<string, string> = {
  cash_dividend: "a cash dividend",
  stock_dividend: "a stock dividend",
  stock_split: "a stock split",
  merger: "a merger",
  acquisition: "an acquisition",
  spinoff: "a spin-off",
  maintenance: "maintenance",
  "corporate action": "a corporate action",
};

export function checkSession(obs: Sourced<MarketStatusObs>): Check {
  const base = { id: "session" as const, name: "Market session", source: obs.source, asOf: obs.asOf, threshold: null };
  const s = obs.value;
  if (!s) {
    return { ...base, result: "unavailable", rawValue: null, reason: `The market status could not be read${obs.error ? ` (${obs.error})` : ""}, so Bitstock will wait.`, retryAt: null };
  }
  const raw = `openState=${s.openState}, reasonCode=${s.reasonCode ?? "null"}, marketStatus=${s.marketStatus ?? "null"}, reasonMsg=${s.reasonMsg ?? "null"}`;
  const code = s.reasonCode ?? "";
  if (code === "ASSET_PAUSED") {
    const why = PAUSE_REASONS[s.reasonMsg ?? ""] ?? (s.reasonMsg ? `"${s.reasonMsg}"` : "a reason the issuer did not state");
    return { ...base, result: "fail", rawValue: raw, reason: `The issuer has paused this token for ${why}.` };
  }
  if (code === "MARKET_PAUSED") return { ...base, result: "fail", rawValue: raw, reason: "Trading in the underlying market is paused." };
  if (code === "MARKET_MAINTENANCE") return { ...base, result: "fail", rawValue: raw, reason: "The market is under maintenance." };
  if (code === "UNSUPPORTED") return { ...base, result: "fail", rawValue: raw, reason: "This token is not supported for trading." };
  if (code === "ASSET_LIMITED") {
    const why = s.reasonMsg === "earnings" ? " around an earnings release" : s.reasonMsg ? ` (${s.reasonMsg})` : "";
    return { ...base, result: "warn", rawValue: raw, reason: `Trading in this token is limited${why}; prices can move more than usual.` };
  }
  if (!s.openState) {
    const next = toIso(s.nextOpenTime);
    return {
      ...base,
      result: "warn",
      rawValue: raw,
      reason: next ? `Wall Street is closed. It next opens at ${next}.` : "Wall Street is closed and the next opening time was not given.",
      retryAt: next,
    };
  }
  if (code === "TRADING") return { ...base, result: "pass", rawValue: raw, reason: "The market reports this token as trading." };
  return { ...base, result: "warn", rawValue: raw, reason: `The market reports an unrecognised status code (${code || "none"}), so Bitstock treats it with caution.` };
}

// ---------- 2. multiplier ----------

export interface MultiplierObs {
  uiMultiplier: bigint;
  newUIMultiplier: bigint;
  /** Unix seconds; 0 when nothing is scheduled. */
  effectiveAt: bigint;
}

export function checkMultiplier(obs: Sourced<MultiplierObs>, now: Date, cfg: GuardConfig): Check {
  const base = { id: "multiplier" as const, name: "Share multiplier", source: obs.source, asOf: obs.asOf, threshold: `change within ${cfg.multiplierWindowHours} h warns` };
  const m = obs.value;
  if (!m) return { ...base, result: "unavailable", rawValue: null, reason: `The token's share multiplier could not be read${obs.error ? ` (${obs.error})` : ""}.`, retryAt: null };
  if (m.uiMultiplier <= 0n) return { ...base, result: "fail", rawValue: m.uiMultiplier.toString(), reason: "The token reports a share multiplier of zero, which cannot be right." };
  const raw = `uiMultiplier=${formatDecimal(m.uiMultiplier, 18)}, newUIMultiplier=${formatDecimal(m.newUIMultiplier, 18)}, effectiveAt=${m.effectiveAt}`;
  const nowSec = BigInt(Math.floor(now.getTime() / 1000));
  const pending = m.effectiveAt > nowSec && m.newUIMultiplier !== m.uiMultiplier;
  if (!pending) return { ...base, result: "pass", rawValue: raw, reason: `Each token stands for ${formatDecimal(m.uiMultiplier, 6)} shares and no change is scheduled.` };
  const when = new Date(Number(m.effectiveAt) * 1000).toISOString();
  const within = m.effectiveAt - nowSec <= BigInt(cfg.multiplierWindowHours * 3600);
  const change = `from ${formatDecimal(m.uiMultiplier, 6)} to ${formatDecimal(m.newUIMultiplier, 6)} shares per token at ${when}`;
  return within
    ? { ...base, result: "warn", rawValue: raw, reason: `A change to the token is scheduled within ${cfg.multiplierWindowHours} hours: ${change}.` }
    : { ...base, result: "pass", rawValue: raw, reason: `A change is scheduled later than ${cfg.multiplierWindowHours} hours from now: ${change}.` };
}

// ---------- 3. independent reference ----------

export interface ReferenceObs {
  pricePerShare: string;
  currency: string;
  /** ISO time of the price (last trade or close). */
  priceTime: string;
  /** The source's own market session label, when it gives one (Pyth: regular, preMarket, postMarket, overNight, closed). */
  session?: string;
  /** Which source actually answered (a fallback chain may try several). */
  sourceName?: string;
}

export function checkReference(
  ref: Sourced<ReferenceObs>,
  quotePricePerToken: bigint | undefined,
  multiplier: bigint | undefined,
  now: Date,
  cfg: GuardConfig,
): Check {
  const base = { id: "reference" as const, name: "Independent price", source: ref.value?.sourceName ?? ref.source, asOf: ref.value?.priceTime ?? ref.asOf };
  const r = ref.value;
  if (!r) return { ...base, result: "unavailable", rawValue: null, threshold: null, reason: `No independent price is available${ref.error ? ` (${ref.error})` : ""}, so this check cannot pass.` };
  if (r.currency !== "USD") return { ...base, result: "unavailable", rawValue: `${r.pricePerShare} ${r.currency}`, threshold: null, reason: `The independent price is in ${r.currency}, not US dollars, so it cannot be compared.` };
  const refPrice = tryParseDecimal(r.pricePerShare);
  if (refPrice === undefined || refPrice <= 0n) return { ...base, result: "unavailable", rawValue: r.pricePerShare, threshold: null, reason: "The independent price is not a usable number." };
  if (quotePricePerToken === undefined || multiplier === undefined || multiplier <= 0n) {
    return { ...base, result: "unavailable", rawValue: r.pricePerShare, threshold: null, reason: "The buy price or the share multiplier is unavailable, so the prices cannot be compared." };
  }
  const perShare = div(quotePricePerToken, multiplier);
  const gap = percentDiff(perShare, refPrice);
  const ageMinutes = (now.getTime() - Date.parse(r.priceTime)) / 60_000;
  const fresh = Number.isFinite(ageMinutes) && ageMinutes >= 0 && ageMinutes <= cfg.referenceLiveMaxAgeMinutes;
  // A price counts as live only when it is fresh and, if the source labels sessions, from the regular session.
  const live = fresh && (r.session === undefined || r.session === "regular");
  const raw = `buy price per share ${formatDecimal(perShare, 4)} USD vs ${formatDecimal(refPrice, 4)} USD, gap ${formatDecimal(gap, 3)}%`;
  const gapText = `${gap >= 0n ? "+" : ""}${formatDecimal(gap, 2)}%`;
  if (live) {
    const threshold = `pass ≤ ${cfg.referenceWarnPercent}%, fail > ${cfg.referenceMaxPercent}%`;
    if (abs(gap) <= parseDecimal(cfg.referenceWarnPercent)) return { ...base, result: "pass", rawValue: raw, threshold, reason: `The buy price is within ${cfg.referenceWarnPercent}% of the stock's price (${gapText}).` };
    if (abs(gap) <= parseDecimal(cfg.referenceMaxPercent)) return { ...base, result: "warn", rawValue: raw, threshold, reason: `The buy price is ${gapText} away from the stock's price.` };
    return { ...base, result: "fail", rawValue: raw, threshold, reason: `The buy price is ${gapText} away from the stock's price, more than the ${cfg.referenceMaxPercent}% allowed.` };
  }
  const threshold = `last close: never a pass, fail > ${cfg.referenceClosedMaxPercent}%`;
  if (abs(gap) > parseDecimal(cfg.referenceClosedMaxPercent)) {
    return { ...base, result: "fail", rawValue: raw, threshold, reason: `The buy price is ${gapText} away from the last close at ${r.priceTime}, more than the ${cfg.referenceClosedMaxPercent}% allowed.` };
  }
  const when = fresh && r.session ? `a ${r.session} price from ${r.priceTime}` : `from ${r.priceTime}`;
  return { ...base, result: "warn", rawValue: raw, threshold, reason: `The stock is not in its regular session; its latest price is ${when}. The buy price is ${gapText} away from it, and the stock can move before regular trading.` };
}

// ---------- 4. execution quality ----------

const MARKET_HOURS_CODES = new Set([40369, 40367]);

/** The route the guard would use: the best SWAP route. RFQ routes cannot be dry-run and are never chosen. */
export function chooseRoute(routes: Route[]): Route | undefined {
  const swaps = routes.filter((r) => r.executionMode === "SWAP");
  return swaps.find((r) => r.isBest) ?? [...swaps].sort((a, b) => (BigInt(b.toTokenAmount ?? "0") > BigInt(a.toTokenAmount ?? "0") ? 1 : -1))[0];
}

export function checkExecution(q: Sourced<QuoteObs>, cfg: GuardConfig): Check {
  const threshold = `warn > ${cfg.priceImpactWarnPercent}%, fail > ${cfg.priceImpactMaxPercent}%`;
  const base = { id: "execution" as const, name: "Price and route", source: q.source, asOf: q.asOf, threshold };
  const v = q.value;
  if (!v || v.errorCode !== undefined) {
    if (v?.errorCode !== undefined && MARKET_HOURS_CODES.has(v.errorCode)) {
      return { ...base, result: "unavailable", rawValue: `error ${v.errorCode}`, reason: "Binance will not quote this stock while its exchange is closed, so Bitstock will wait for the next session.", retryAt: null };
    }
    const err = v?.errorCode !== undefined ? `error ${v.errorCode}${v.errorMessage ? `: ${v.errorMessage}` : ""}` : q.error;
    return { ...base, result: "unavailable", rawValue: err ?? null, reason: `A live price could not be fetched${err ? ` (${err})` : ""}.`, retryAt: null };
  }
  const routes = v.routes ?? [];
  if (routes.length === 0) return { ...base, result: "unavailable", rawValue: "no routes", reason: "Binance returned no way to make this trade right now.", retryAt: null };
  const route = chooseRoute(routes);
  if (!route) {
    return { ...base, result: "fail", rawValue: routes.map((r) => `${r.vendorName}:${r.executionMode}`).join(", "), reason: "Only a quote-on-request route is offered. It cannot be tested before sending, so Bitstock will not use it." };
  }
  const out = BigInt(route.toTokenAmount ?? "0");
  if (out <= 0n) return { ...base, result: "fail", rawValue: `toTokenAmount=${route.toTokenAmount}`, reason: "The quote would deliver nothing." };
  const impact = tryParseDecimal(route.priceImpactPercent);
  if (impact === undefined) return { ...base, result: "unavailable", rawValue: `priceImpactPercent=${route.priceImpactPercent}`, reason: "The quote did not include a usable price impact.", retryAt: null };
  // Show the API's own figure: rounding a tiny impact to a few places would print a misleading 0.
  const shown = route.priceImpactPercent;
  const raw = `${route.vendorName} ${route.executionMode}, priceImpactPercent ${shown}, output ${route.toTokenAmount}`;
  if (abs(impact) > parseDecimal(cfg.priceImpactMaxPercent)) return { ...base, result: "fail", rawValue: raw, reason: `This buy would move the price by ${shown}%, more than the ${cfg.priceImpactMaxPercent}% allowed.` };
  if (abs(impact) > parseDecimal(cfg.priceImpactWarnPercent)) return { ...base, result: "warn", rawValue: raw, reason: `This buy would move the price by ${shown}%.` };
  return { ...base, result: "pass", rawValue: raw, reason: `A direct swap route is available and this buy would move the price by ${shown}%.` };
}

/** USD per token implied by a route: amount paid × the pay token's USD price ÷ tokens received. */
export function quotePricePerToken(route: Route | undefined): bigint | undefined {
  if (!route) return undefined;
  const paid = route.fromTokenAmount ? BigInt(route.fromTokenAmount) : undefined;
  const got = route.toTokenAmount ? BigInt(route.toTokenAmount) : undefined;
  const unitPrice = tryParseDecimal(route.fromToken?.tokenUnitPrice);
  const fromDec = Number(route.fromToken?.decimal ?? NaN);
  const toDec = Number(route.toToken?.decimal ?? NaN);
  if (!paid || !got || got <= 0n || unitPrice === undefined || !Number.isInteger(fromDec) || !Number.isInteger(toDec)) return undefined;
  const paidFixed = paid * 10n ** 18n / 10n ** BigInt(fromDec);
  const gotFixed = got * 10n ** 18n / 10n ** BigInt(toDec);
  return div(mul(paidFixed, unitPrice), gotFixed);
}

// ---------- 5. simulation ----------

export function checkSimulation(sim: Sourced<SimulationObs> & { skipped?: string }, stockToken: string, wallet: string): Check {
  const base = { id: "simulation" as const, name: "Dry run", source: sim.source, asOf: sim.asOf, threshold: "SUCCESS and the stock arrives" };
  if (sim.skipped) return { ...base, result: "unavailable", rawValue: null, reason: `The dry run was not run: ${sim.skipped}`, retryAt: null };
  const v = sim.value;
  if (!v) return { ...base, result: "unavailable", rawValue: null, reason: `The dry run could not be performed${sim.error ? ` (${sim.error})` : ""}.`, retryAt: null };
  if (v.status !== "SUCCESS") {
    const why = v.failReason ?? "no reason given";
    if (/allowance/i.test(why)) {
      return { ...base, result: "fail", rawValue: `status=${v.status}, failReason=${why}`, reason: "The dry run failed because this wallet has not yet approved USDT for the swap. Approve first, then check again." };
    }
    return { ...base, result: "fail", rawValue: `status=${v.status}, failReason=${why}`, reason: `The dry run failed: ${why}.` };
  }
  const arriving = (v.balanceChanges ?? []).find(
    (c) => c.contractAddress?.toLowerCase() === stockToken.toLowerCase() && c.owner?.toLowerCase() === wallet.toLowerCase() && BigInt(c.change ?? "0") > 0n,
  );
  if (!arriving) return { ...base, result: "fail", rawValue: `status=SUCCESS, balanceChanges=${JSON.stringify(v.balanceChanges ?? [])}`, reason: "The dry run succeeded but showed no stock arriving in this wallet, so Bitstock will not send it." };
  return { ...base, result: "pass", rawValue: `status=SUCCESS, stock change +${arriving.change}`, reason: "The dry run succeeded and the stock arrives in this wallet." };
}

// ---------- outcome ----------

export interface Decision {
  outcome: Outcome;
  reason: string;
  limits: SlippageLimit | null;
  recheckAt: string | null;
}

/** LIMIT slippage: price impact × multiplier + buffer, clamped to [floor, ceiling] (docs/METHOD.md). */
export function limitSlippage(impactPercent: bigint, cfg: GuardConfig): SlippageLimit {
  const raw = mul(abs(impactPercent), parseDecimal(cfg.limitImpactMultiplier)) + parseDecimal(cfg.limitBufferPercent);
  const floor = parseDecimal(cfg.limitFloorPercent);
  const ceiling = parseDecimal(cfg.limitCeilingPercent);
  const chosen = raw < floor ? floor : raw > ceiling ? ceiling : raw;
  return {
    slippagePercent: formatDecimal(chosen, 4),
    why: `Warnings present: slippage tightened to impact ${formatDecimal(abs(impactPercent), 6)}% × ${cfg.limitImpactMultiplier} + ${cfg.limitBufferPercent}%, kept between ${cfg.limitFloorPercent}% and ${cfg.limitCeilingPercent}% (rule in docs/METHOD.md).`,
  };
}

/**
 * GO when every check passes; LIMIT when there are warnings (a missing independent price counts as a warning);
 * WAIT when any other input is unavailable; BLOCK on any failure. Order of precedence: BLOCK, WAIT, LIMIT, GO.
 */
export function decide(checks: Check[], impactPercent: bigint | undefined, now: Date, cfg: GuardConfig): Decision {
  const failed = checks.find((c) => c.result === "fail");
  if (failed) return { outcome: "BLOCK", reason: failed.reason, limits: null, recheckAt: null };

  const missing = checks.filter((c) => c.result === "unavailable" && c.id !== "reference");
  if (missing.length > 0) {
    const known = checks.map((c) => c.retryAt).filter((t): t is string => typeof t === "string").sort();
    const recheckAt = known[0] ?? new Date(now.getTime() + cfg.waitRecheckMinutes * 60_000).toISOString();
    return { outcome: "WAIT", reason: missing[0]!.reason, limits: null, recheckAt };
  }

  const warned = checks.filter((c) => c.result === "warn" || (c.id === "reference" && c.result === "unavailable"));
  if (warned.length > 0) {
    // impactPercent is known here: the execution check passed or warned, so it read one.
    const limits = limitSlippage(impactPercent ?? 0n, cfg);
    return { outcome: "LIMIT", reason: warned.map((c) => c.reason).join(" "), limits, recheckAt: null };
  }
  return {
    outcome: "GO",
    reason: "Every check passed.",
    limits: { slippagePercent: cfg.defaultSlippagePercent, why: "All checks passed: default slippage." },
    recheckAt: null,
  };
}
