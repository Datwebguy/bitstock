/**
 * The guard's rules (AGENTS.md section 6). Pure functions of observed inputs: no I/O,
 * no clock reads, no randomness. The same inputs and config always give the same result.
 */
import { rescale } from "@bitstock/chain";
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

/** An integer amount from an upstream response, or undefined when it is missing or malformed. */
const intOrUndefined = (v: string | undefined): bigint | undefined => (typeof v === "string" && /^\d+$/.test(v) ? BigInt(v) : undefined);

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
  const base = { id: "session" as const, name: "Stock market", source: obs.source, asOf: obs.asOf, threshold: null };
  const s = obs.value;
  if (!s) {
    return { ...base, result: "unavailable", rawValue: obs.error ?? null, reason: "Bitstock could not read whether the stock market is open, so it will wait.", retryAt: null };
  }
  const raw = `openState=${s.openState}, reasonCode=${s.reasonCode ?? "null"}, marketStatus=${s.marketStatus ?? "null"}, reasonMsg=${s.reasonMsg ?? "null"}`;
  const code = s.reasonCode ?? "";
  if (code === "ASSET_PAUSED") {
    const why = PAUSE_REASONS[s.reasonMsg ?? ""] ?? (s.reasonMsg ? `"${s.reasonMsg}"` : "a reason the issuer did not state");
    return { ...base, result: "fail", rawValue: raw, reason: `The issuer has paused this token for ${why}.` };
  }
  if (code === "MARKET_PAUSED") return { ...base, result: "fail", rawValue: raw, reason: "Trading in this stock is paused." };
  if (code === "MARKET_MAINTENANCE") return { ...base, result: "fail", rawValue: raw, reason: "Trading is paused for maintenance." };
  if (code === "UNSUPPORTED") return { ...base, result: "fail", rawValue: raw, reason: "This stock cannot be traded right now." };
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
      reason: next ? `The US stock market is closed. It opens again at ${next}.` : "The US stock market is closed, and Binance did not say when it opens again.",
      retryAt: next,
    };
  }
  if (code === "TRADING") return { ...base, result: "pass", rawValue: raw, reason: "Binance shows this stock as open for trading." };
  return { ...base, result: "warn", rawValue: raw, reason: "Binance shows a market status Bitstock does not recognise, so it treats it with caution." };
}

// ---------- 2. multiplier ----------

export interface MultiplierObs {
  uiMultiplier: bigint;
  newUIMultiplier: bigint;
  /** Unix seconds; 0 when nothing is scheduled. */
  effectiveAt: bigint;
}

export function checkMultiplier(obs: Sourced<MultiplierObs>, now: Date, cfg: GuardConfig): Check {
  const base = { id: "multiplier" as const, name: "Shares per token", source: obs.source, asOf: obs.asOf, threshold: `change within ${cfg.multiplierWindowHours} h warns` };
  const m = obs.value;
  if (!m) return { ...base, result: "unavailable", rawValue: obs.error ?? null, reason: "Bitstock could not read how many shares each token stands for.", retryAt: null };
  if (m.uiMultiplier <= 0n) return { ...base, result: "fail", rawValue: m.uiMultiplier.toString(), reason: "The token says it stands for zero shares, which cannot be right." };
  const raw = `uiMultiplier=${formatDecimal(m.uiMultiplier, 18)}, newUIMultiplier=${formatDecimal(m.newUIMultiplier, 18)}, effectiveAt=${m.effectiveAt}`;
  const nowSec = BigInt(Math.floor(now.getTime() / 1000));
  const pending = m.effectiveAt > nowSec && m.newUIMultiplier !== m.uiMultiplier;
  if (!pending) return { ...base, result: "pass", rawValue: raw, reason: `Each token stands for ${formatDecimal(m.uiMultiplier, 6)} shares, and no change is planned.` };
  const when = new Date(Number(m.effectiveAt) * 1000).toISOString();
  const within = m.effectiveAt - nowSec <= BigInt(cfg.multiplierWindowHours * 3600);
  const change = `from ${formatDecimal(m.uiMultiplier, 6)} to ${formatDecimal(m.newUIMultiplier, 6)} shares per token at ${when}`;
  return within
    ? { ...base, result: "warn", rawValue: raw, reason: `The token is due to change within ${cfg.multiplierWindowHours} hours, ${change}. This usually means a company event such as a dividend or a split.` }
    : { ...base, result: "pass", rawValue: raw, reason: `A change is planned more than ${cfg.multiplierWindowHours} hours from now, ${change}.` };
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
  const base = { id: "reference" as const, name: "Price vs the real stock", source: ref.value?.sourceName ?? ref.source, asOf: ref.value?.priceTime ?? ref.asOf };
  const r = ref.value;
  if (!r) return { ...base, result: "unavailable", rawValue: ref.error ?? null, threshold: null, reason: "Bitstock could not get the stock's own price from a separate source, so this check cannot pass." };
  if (r.currency !== "USD") return { ...base, result: "unavailable", rawValue: `${r.pricePerShare} ${r.currency}`, threshold: null, reason: `The stock's own price is in ${r.currency}, not US dollars, so it cannot be compared.` };
  const refPrice = tryParseDecimal(r.pricePerShare);
  if (refPrice === undefined || refPrice <= 0n) return { ...base, result: "unavailable", rawValue: r.pricePerShare, threshold: null, reason: "The stock's own price could not be used." };
  if (quotePricePerToken === undefined || multiplier === undefined || multiplier <= 0n) {
    return { ...base, result: "unavailable", rawValue: r.pricePerShare, threshold: null, reason: "The buy price or the shares per token are not known, so the prices cannot be compared." };
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
    if (abs(gap) <= parseDecimal(cfg.referenceWarnPercent)) return { ...base, result: "pass", rawValue: raw, threshold, reason: `You would pay ${gapText} compared with the stock's own price, within the ${cfg.referenceWarnPercent}% Bitstock is comfortable with.` };
    if (abs(gap) <= parseDecimal(cfg.referenceMaxPercent)) return { ...base, result: "warn", rawValue: raw, threshold, reason: `You would pay ${gapText} compared with the stock's own price.` };
    return { ...base, result: "fail", rawValue: raw, threshold, reason: `You would pay ${gapText} compared with the stock's own price, more than the ${cfg.referenceMaxPercent}% allowed.` };
  }
  const threshold = `last close: never a pass, fail > ${cfg.referenceClosedMaxPercent}%`;
  if (abs(gap) > parseDecimal(cfg.referenceClosedMaxPercent)) {
    return { ...base, result: "fail", rawValue: raw, threshold, reason: `You would pay ${gapText} compared with the stock's last price from ${r.priceTime}, more than the ${cfg.referenceClosedMaxPercent}% allowed.` };
  }
  const head = fresh && r.session ? `The stock is trading outside normal market hours; its latest price is from ${r.priceTime}.` : `The stock's own price is not live right now; its latest price is from ${r.priceTime}.`;
  return { ...base, result: "warn", rawValue: raw, threshold, reason: `${head} You would pay ${gapText} compared with it, and the stock can move before normal trading.` };
}

// ---------- 4. execution quality ----------

const MARKET_HOURS_CODES = new Set([40369, 40367]);

/** The route the guard would use: the best SWAP route. RFQ routes cannot be dry-run and are never chosen. */
export function chooseRoute(routes: Route[]): Route | undefined {
  const swaps = routes.filter((r) => r.executionMode === "SWAP");
  const out = (r: Route) => intOrUndefined(r.toTokenAmount) ?? 0n;
  return swaps.find((r) => r.isBest) ?? [...swaps].sort((a, b) => (out(b) > out(a) ? 1 : out(b) < out(a) ? -1 : 0))[0];
}

export function checkExecution(q: Sourced<QuoteObs>, cfg: GuardConfig): Check {
  const threshold = `warn > ${cfg.priceImpactWarnPercent}%, fail > ${cfg.priceImpactMaxPercent}%`;
  const base = { id: "execution" as const, name: "Price impact", source: q.source, asOf: q.asOf, threshold };
  const v = q.value;
  if (!v || v.errorCode !== undefined) {
    if (v?.errorCode !== undefined && MARKET_HOURS_CODES.has(v.errorCode)) {
      return { ...base, result: "unavailable", rawValue: `error ${v.errorCode}`, reason: "Binance will not price this stock while its market is closed, so Bitstock will wait for the market to open.", retryAt: null };
    }
    const err = v?.errorCode !== undefined ? `error ${v.errorCode}${v.errorMessage ? `: ${v.errorMessage}` : ""}` : q.error;
    return { ...base, result: "unavailable", rawValue: err ?? null, reason: "Bitstock could not get a live price for this amount.", retryAt: null };
  }
  const routes = v.routes ?? [];
  if (routes.length === 0) return { ...base, result: "unavailable", rawValue: "no routes", reason: "Binance offered no way to make this trade right now.", retryAt: null };
  const route = chooseRoute(routes);
  if (!route) {
    return { ...base, result: "fail", rawValue: routes.map((r) => `${r.vendorName}:${r.executionMode}`).join(", "), reason: "Binance only offered a kind of trade that cannot be tested first, so Bitstock will not use it." };
  }
  const out = intOrUndefined(route.toTokenAmount);
  if (out === undefined) return { ...base, result: "unavailable", rawValue: `toTokenAmount=${route.toTokenAmount}`, reason: "The price offered did not say how much you would receive, so Bitstock cannot use it.", retryAt: null };
  if (out <= 0n) return { ...base, result: "fail", rawValue: `toTokenAmount=${route.toTokenAmount}`, reason: "The price offered would give you nothing." };
  const impact = tryParseDecimal(route.priceImpactPercent);
  if (impact === undefined) return { ...base, result: "unavailable", rawValue: `priceImpactPercent=${route.priceImpactPercent}`, reason: "The price offered did not say how much your buy would move the price.", retryAt: null };
  // Rounded for reading; a tiny impact reads "less than 0.01%" rather than a misleading 0. The exact figure stays in rawValue.
  const shown = abs(impact) < parseDecimal("0.01") ? "less than 0.01%" : `${formatDecimal(abs(impact), 2)}%`;
  const raw = `${route.vendorName} ${route.executionMode}, priceImpactPercent ${route.priceImpactPercent}, output ${route.toTokenAmount}`;
  if (abs(impact) > parseDecimal(cfg.priceImpactMaxPercent)) return { ...base, result: "fail", rawValue: raw, reason: `Your buy would move the price by ${shown}, more than the ${cfg.priceImpactMaxPercent}% allowed.` };
  if (abs(impact) > parseDecimal(cfg.priceImpactWarnPercent)) return { ...base, result: "warn", rawValue: raw, reason: `Your buy would move the price by ${shown}, more than usual.` };
  return { ...base, result: "pass", rawValue: raw, reason: `Your buy would move the price by ${shown}.` };
}

/** USD per token implied by a route: amount paid × the pay token's USD price ÷ tokens received. */
export function quotePricePerToken(route: Route | undefined): bigint | undefined {
  if (!route) return undefined;
  const paid = intOrUndefined(route.fromTokenAmount);
  const got = intOrUndefined(route.toTokenAmount);
  const unitPrice = tryParseDecimal(route.fromToken?.tokenUnitPrice);
  const fromDec = Number(route.fromToken?.decimal ?? NaN);
  const toDec = Number(route.toToken?.decimal ?? NaN);
  if (!paid || !got || got <= 0n || unitPrice === undefined || !Number.isInteger(fromDec) || !Number.isInteger(toDec)) return undefined;
  const paidFixed = rescale(paid, fromDec, 18);
  const gotFixed = rescale(got, toDec, 18);
  return div(mul(paidFixed, unitPrice), gotFixed);
}

// ---------- 5. simulation ----------

/** The swap transaction as built by the API, and the contract the quote said it would go to. */
export interface SwapPin {
  tx: { from: string; to: string; value: string };
  expectedTo: string | undefined;
}

export function checkSimulation(sim: Sourced<SimulationObs> & { skipped?: string }, stockToken: string, wallet: string, pin?: SwapPin, opts: { approvalByWallet?: boolean } = {}): Check {
  const base = { id: "simulation" as const, name: "Test run", source: sim.source, asOf: sim.asOf, threshold: "SUCCESS and the stock arrives" };
  // Pin the transaction before trusting any dry run of it: it must come from the buyer, go to the
  // contract the quote named as the spender, and carry no BNB.
  if (pin) {
    const raw = `to=${pin.tx.to}, expected=${pin.expectedTo ?? "unknown"}, value=${pin.tx.value}`;
    if (!pin.expectedTo || pin.tx.to.toLowerCase() !== pin.expectedTo.toLowerCase()) {
      return { ...base, result: "fail", rawValue: raw, reason: "The trade Binance prepared does not go where its price offer said, so Bitstock will not use it." };
    }
    if (pin.tx.from.toLowerCase() !== wallet.toLowerCase()) return { ...base, result: "fail", rawValue: raw, reason: "The trade Binance prepared is not from your wallet, so Bitstock will not use it." };
    if (!/^\d+$/.test(pin.tx.value || "0") || BigInt(pin.tx.value || "0") !== 0n) return { ...base, result: "fail", rawValue: raw, reason: "The trade Binance prepared would also send BNB, which buying with USDT never needs, so Bitstock will not use it." };
  }
  if (sim.skipped) return { ...base, result: "unavailable", rawValue: sim.skipped, reason: "Bitstock could not prepare this trade for a test run right now.", retryAt: null };
  const v = sim.value;
  if (!v) return { ...base, result: "unavailable", rawValue: sim.error ?? null, reason: "Bitstock could not test this trade right now.", retryAt: null };
  if (v.status !== "SUCCESS") {
    const why = v.failReason ?? "no reason given";
    if (/allowance/i.test(why)) {
      // An Agentic Wallet approves USDT inside its own swap command, so a missing approval is expected
      // there. The trade could not be tested, which is never a pass: it warns, so at most LIMIT (ADR 0007).
      if (opts.approvalByWallet) {
        return { ...base, result: "warn", rawValue: `status=${v.status}, failReason=${why}`, reason: "Bitstock could not test this exact trade from your Agentic Wallet, because the wallet has not yet approved USDT for it. Your wallet approves inside its own swap, so the buy may only go ahead with a tighter limit." };
      }
      return { ...base, result: "fail", rawValue: `status=${v.status}, failReason=${why}`, reason: "The test run failed because your wallet has not yet allowed this trade to use your USDT. Approve USDT in your wallet first, then check again." };
    }
    if (/exceeds balance|insufficient balance/i.test(why)) {
      return { ...base, result: "fail", rawValue: `status=${v.status}, failReason=${why}`, reason: "Your wallet does not hold enough USDT for this buy. Add USDT on BNB Smart Chain, then check again." };
    }
    return { ...base, result: "fail", rawValue: `status=${v.status}, failReason=${why}`, reason: "The test run of this trade failed, so Bitstock will not send it." };
  }
  const arriving = (v.balanceChanges ?? []).find(
    (c) => c.contractAddress?.toLowerCase() === stockToken.toLowerCase() && c.owner?.toLowerCase() === wallet.toLowerCase() && /^\d+$/.test(c.change ?? "0") && BigInt(c.change ?? "0") > 0n,
  );
  if (!arriving) return { ...base, result: "fail", rawValue: `status=SUCCESS, balanceChanges=${JSON.stringify(v.balanceChanges ?? [])}`, reason: "The test run worked but showed no stock arriving in your wallet, so Bitstock will not send it." };
  return { ...base, result: "pass", rawValue: `status=SUCCESS, stock change +${arriving.change}`, reason: "Bitstock tested this exact trade, and the stock arrives in your wallet." };
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
