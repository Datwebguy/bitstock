/**
 * Read-only data for the web app. Every value carries its source and time; anything that cannot be
 * read is null with the reason, never a filler value (AGENTS.md section 0.2).
 */
import { erc20BalanceOf, readMultiplierState, rawToUi } from "@bitstock/chain";
import { assessDividend, companyNote, explainHolding, explainMultiplierChange, formatFixed } from "@bitstock/explainer";
import { findMarketStatus } from "@bitstock/binance";
import { div, formatDecimal, mul, percentDiff, tryParseDecimal } from "@bitstock/guard";
import type { AgentContext } from "./context.ts";
import { listedTokens, type ListedToken } from "./tokens.ts";

type Sourced<T> = { value: T; source: string; asOf: string } | { value: null; source: string; asOf: string; error: string };

const now = () => new Date().toISOString();
async function read<T>(source: string, fn: () => Promise<T>): Promise<Sourced<T>> {
  try {
    return { value: await fn(), source, asOf: now() };
  } catch (e) {
    return { value: null, source, asOf: now(), error: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
}

const marketCache = new Map<string, { at: number; body: Record<string, unknown> }>();

export async function marketView(ctx: AgentContext, token: ListedToken): Promise<Record<string, unknown>> {
  const hit = marketCache.get(token.address);
  if (hit && Date.now() - hit.at < 30_000) return hit.body;
  const [market, profile, tokens, mult, ref] = await Promise.all([
    read("Binance Web3 API rwa/underlying-market", () => ctx.api.underlyingMarket(token.address)),
    read("Binance Web3 API rwa/underlying-profile", () => ctx.api.underlyingProfile(token.address)),
    read("Binance Web3 API rwa/tokens", async () => (await listedTokens(ctx)).tokens),
    read("BNB Smart Chain: uiMultiplier, newUIMultiplier, effectiveAt", () => readMultiplierState(ctx.rpcUrl, token.address)),
    token.ticker ? read(ctx.reference.name, () => ctx.reference.read(token.ticker!)) : Promise.resolve({ value: null, source: ctx.reference.name, asOf: now(), error: "the stock ticker is unavailable" } as const),
  ]);
  const status = market.value ? findMarketStatus(market.value) ?? null : null;
  const marketData = market.value ? ((market.value as { marketData?: Record<string, unknown> }).marketData ?? null) : null;
  const live = tokens.value ? tokens.value.find((t) => t.address === token.address) ?? null : null;
  const m = mult.value;
  const tokenPrice = live?.price ?? null;
  let gap: string | null = null;
  const tp = tryParseDecimal(tokenPrice);
  const rp = tryParseDecimal(ref.value?.pricePerShare);
  if (tp !== undefined && rp !== undefined && rp > 0n && m && m.uiMultiplier > 0n) {
    gap = formatDecimal(percentDiff(div(tp, m.uiMultiplier), rp), 2);
  }
  const body = {
    token: { address: token.address, symbol: token.symbol, name: token.name, logo: token.logo, ticker: token.ticker, company: token.company },
    session: { value: status, source: market.source, asOf: market.asOf, ...("error" in market ? { error: market.error } : {}) },
    tokenPrice: { value: tokenPrice, source: tokens.source, asOf: tokens.asOf, note: "per token on BNB Smart Chain", ...("error" in tokens ? { error: tokens.error } : {}) },
    multiplier: m ? { value: { current: formatFixed(m.uiMultiplier, 18), pending: formatFixed(m.newUIMultiplier, 18), effectiveAt: m.effectiveAt.toString() }, source: mult.source, asOf: mult.asOf } : { value: null, source: mult.source, asOf: mult.asOf, error: "error" in mult ? mult.error : "unavailable" },
    reference: ref.value ? { value: ref.value, source: ref.value.sourceName ?? ref.source, asOf: ref.asOf } : { value: null, source: ref.source, asOf: ref.asOf, error: "error" in ref ? ref.error : "unavailable" },
    gapPercent: { value: gap, note: "token price per share against the independent stock price; computed from two independent sources" },
    company: { note: profile.value ? companyNote(profile.value) : null, source: profile.source, asOf: profile.asOf },
    marketData: { value: marketData, source: market.source, asOf: market.asOf },
  };
  marketCache.set(token.address, { at: Date.now(), body });
  return body;
}

const ONE_SHARE = 10n ** 18n;

/** Plain words for a shares-per-token figure when no confirmed dividend can be matched to it. */
export function sharesPerTokenNote(m: bigint, company: string): string {
  if (m === ONE_SHARE) return `Each token stands for exactly one share of ${company}.`;
  const dir = m > ONE_SHARE ? "a little more" : "a little less";
  return `Each token stands for ${formatFixed(m, 6)} shares of ${company}, ${dir} than one. Company events such as reinvested dividends change this number. Bitstock only calls a change a dividend when it can match it to the company's announcement, and it cannot do that for this token yet.`;
}

/** Run `fn` over `items` with at most `limit` in flight, so a 46-token sweep does not flood the node. */
async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function holdingsView(ctx: AgentContext, wallet: string): Promise<Record<string, unknown>> {
  const list = await listedTokens(ctx);
  const balances = await pool(list.tokens, 8, async (t) => ({ t, bal: await read(`BNB Smart Chain: ${t.symbol} balanceOf`, () => erc20BalanceOf(ctx.rpcUrl, t.address, wallet)) }));
  const unread = balances.filter((b) => b.bal.value === null).map((b) => b.t.symbol);
  const held = balances.filter((b) => b.bal.value !== null && b.bal.value.value > 0n);
  const positions = await Promise.all(
    held.map(async ({ t, bal }) => {
      const [mult, ref] = await Promise.all([
        read("BNB Smart Chain: uiMultiplier", () => readMultiplierState(ctx.rpcUrl, t.address)),
        t.ticker ? read(ctx.reference.name, () => ctx.reference.read(t.ticker!)) : Promise.resolve({ value: null, source: ctx.reference.name, asOf: now(), error: "the stock ticker is unavailable" } as const),
      ]);
      const raw = bal.value!.value;
      const m = mult.value?.uiMultiplier ?? null;
      const shares = m !== null ? rawToUi(raw, m) : null;
      const refPrice = ref.value ? ref.value.pricePerShare : null;
      const rp = tryParseDecimal(refPrice);
      const valueAtReference = shares !== null && rp !== undefined ? formatDecimal(mul(shares, rp), 2) : null;
      const verdict = m !== null ? assessDividend({ oldMultiplier: null, newMultiplier: { value: m, source: "uiMultiplier() on BNB Smart Chain" }, announced: null, reinvestPrice: null, confirmedWithholding: null, tolerancePercent: "2" }) : null;
      const company = t.company ?? t.ticker ?? t.symbol;
      return {
        token: { address: t.address, symbol: t.symbol, name: t.name, logo: t.logo, ticker: t.ticker, company },
        balance: { raw: raw.toString(), tokens: formatFixed(raw, 6), source: bal.source, asOf: bal.asOf },
        multiplier: { value: m !== null ? formatFixed(m, 18) : null, source: mult.source, asOf: mult.asOf },
        shares: shares !== null ? formatFixed(shares, 6) : null,
        valueAtReference: { value: valueAtReference, price: refPrice, priceTime: ref.value?.priceTime ?? null, source: ref.value?.sourceName ?? ref.source, note: "shares × the independent stock price at its time; not a price you can sell at" },
        explanation: m !== null ? explainHolding(raw, m, t.symbol, company) : null,
        multiplierExplanation: m === null || !verdict ? null : verdict.verdict === "dividend" ? explainMultiplierChange(verdict) : sharesPerTokenNote(m, company),
      };
    }),
  );
  const symbolOf = new Map(list.tokens.map((t) => [t.address, t.symbol]));
  const buys = ctx.repo.recentDecisions(200).filter((d) => d.record.request.wallet.toLowerCase() === wallet.toLowerCase() && d.record.txHash).map((d) => ({ at: d.record.at, txHash: d.record.txHash, status: d.status, amountUsd: d.record.request.amountUsd, outcome: d.record.outcome, symbol: symbolOf.get(d.record.request.token.toLowerCase()) ?? null }));
  return { wallet, positions, checked: list.tokens.length, unread, asOf: now(), buys };
}
