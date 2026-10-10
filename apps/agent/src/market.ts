/**
 * Read-only data for the web app. Every value carries its source and time; anything that cannot be
 * read is null with the reason, never a filler value (AGENTS.md section 0.2).
 */
import { erc20BalanceOf, readMultiplierState, rawToUi } from "@bitstock/chain";
import { assessDividend, companyNote, explainHolding, explainMultiplierChange, formatFixed } from "@bitstock/explainer";
import { findMarketStatus } from "@bitstock/binance";
import { div, formatDecimal, mul, percentDiff, tryParseDecimal } from "@bitstock/guard";
import type { AgentContext } from "./context.ts";
import { NVDAB } from "./probes.ts";

type Sourced<T> = { value: T; source: string; asOf: string } | { value: null; source: string; asOf: string; error: string };

const now = () => new Date().toISOString();
async function read<T>(source: string, fn: () => Promise<T>): Promise<Sourced<T>> {
  try {
    return { value: await fn(), source, asOf: now() };
  } catch (e) {
    return { value: null, source, asOf: now(), error: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
}

let marketCache: { at: number; body: Record<string, unknown> } | null = null;

export async function marketView(ctx: AgentContext): Promise<Record<string, unknown>> {
  if (marketCache && Date.now() - marketCache.at < 30_000) return marketCache.body;
  const [market, profile, tokens, mult, ref] = await Promise.all([
    read("Binance Web3 API rwa/underlying-market", () => ctx.api.underlyingMarket(NVDAB)),
    read("Binance Web3 API rwa/underlying-profile", () => ctx.api.underlyingProfile(NVDAB)),
    read("Binance Web3 API rwa/tokens", () => ctx.api.rwaTokens("bstock")),
    read("BNB Smart Chain: uiMultiplier, newUIMultiplier, effectiveAt", () => readMultiplierState(ctx.rpcUrl, NVDAB)),
    read(ctx.reference.name, () => ctx.reference.read("NVDA")),
  ]);
  const status = market.value ? findMarketStatus(market.value) ?? null : null;
  const marketData = market.value ? ((market.value as { marketData?: Record<string, unknown> }).marketData ?? null) : null;
  const token = Array.isArray(tokens.value) ? (tokens.value as Array<Record<string, unknown>>).find((t) => String(t["tokenContractAddress"]).toLowerCase() === NVDAB.toLowerCase()) ?? null : null;
  const m = mult.value;
  const tokenPrice = typeof token?.["tokenPrice"] === "string" ? (token["tokenPrice"] as string) : null;
  let gap: string | null = null;
  const tp = tryParseDecimal(tokenPrice);
  const rp = tryParseDecimal(ref.value?.pricePerShare);
  if (tp !== undefined && rp !== undefined && rp > 0n && m && m.uiMultiplier > 0n) {
    gap = formatDecimal(percentDiff(div(tp, m.uiMultiplier), rp), 2);
  }
  const body = {
    token: { address: NVDAB, symbol: "NVDAB", name: typeof token?.["tokenName"] === "string" ? token["tokenName"] : null, logo: typeof token?.["tokenLogoUrl"] === "string" ? token["tokenLogoUrl"] : null, ticker: typeof token?.["underlyingTicker"] === "string" ? token["underlyingTicker"] : null },
    session: { value: status, source: market.source, asOf: market.asOf, ...("error" in market ? { error: market.error } : {}) },
    tokenPrice: { value: tokenPrice, source: tokens.source, asOf: tokens.asOf, note: "per token on BNB Smart Chain", ...("error" in tokens ? { error: tokens.error } : {}) },
    multiplier: m ? { value: { current: formatFixed(m.uiMultiplier, 18), pending: formatFixed(m.newUIMultiplier, 18), effectiveAt: m.effectiveAt.toString() }, source: mult.source, asOf: mult.asOf } : { value: null, source: mult.source, asOf: mult.asOf, error: "error" in mult ? mult.error : "unavailable" },
    reference: ref.value ? { value: ref.value, source: ref.value.sourceName ?? ref.source, asOf: ref.asOf } : { value: null, source: ref.source, asOf: ref.asOf, error: "error" in ref ? ref.error : "unavailable" },
    gapPercent: { value: gap, note: "token price per share against the independent stock price; computed from two independent sources" },
    company: { note: profile.value ? companyNote(profile.value) : null, source: profile.source, asOf: profile.asOf },
    marketData: { value: marketData, source: market.source, asOf: market.asOf },
  };
  marketCache = { at: Date.now(), body };
  return body;
}

export async function holdingsView(ctx: AgentContext, wallet: string): Promise<Record<string, unknown>> {
  const [bal, mult, ref] = await Promise.all([
    read("BNB Smart Chain: NVDAB balanceOf", () => erc20BalanceOf(ctx.rpcUrl, NVDAB, wallet)),
    read("BNB Smart Chain: uiMultiplier", () => readMultiplierState(ctx.rpcUrl, NVDAB)),
    read(ctx.reference.name, () => ctx.reference.read("NVDA")),
  ]);
  const raw = bal.value?.value ?? null;
  const m = mult.value?.uiMultiplier ?? null;
  const shares = raw !== null && m !== null ? rawToUi(raw, m) : null;
  const refPrice = ref.value ? ref.value.pricePerShare : null;
  const rp = tryParseDecimal(refPrice);
  const valueAtReference = shares !== null && rp !== undefined ? formatDecimal(mul(shares, rp), 2) : null;
  const verdict = m !== null ? assessDividend({ oldMultiplier: null, newMultiplier: { value: m, source: "uiMultiplier() on BNB Smart Chain" }, announced: null, reinvestPrice: null, confirmedWithholding: null, tolerancePercent: "2" }) : null;
  const buys = ctx.repo.recentDecisions(50).filter((d) => d.record.request.wallet.toLowerCase() === wallet.toLowerCase() && d.record.txHash).map((d) => ({ at: d.record.at, txHash: d.record.txHash, status: d.status, amountUsd: d.record.request.amountUsd, outcome: d.record.outcome }));
  return {
    wallet,
    balance: { raw: raw?.toString() ?? null, tokens: raw !== null ? formatFixed(raw, 6) : null, source: bal.source, asOf: bal.asOf, ...("error" in bal ? { error: bal.error } : {}) },
    multiplier: { value: m !== null ? formatFixed(m, 18) : null, source: mult.source, asOf: mult.asOf },
    shares: shares !== null ? formatFixed(shares, 6) : null,
    valueAtReference: { value: valueAtReference, price: refPrice, priceTime: ref.value?.priceTime ?? null, source: ref.value?.sourceName ?? ref.source, note: "shares × the independent stock price at its time; not a price you can sell at" },
    explanation: raw !== null && m !== null ? explainHolding(raw, m, "NVDAB", "NVIDIA") : null,
    multiplierExplanation: verdict ? explainMultiplierChange(verdict).replace("This is a multiplier change.", "The token's share multiplier is above 1.") : null,
    buys,
  };
}
