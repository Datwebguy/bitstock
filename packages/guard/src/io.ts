/**
 * The guard's thin I/O layer: reads every input live, records where and when each came from,
 * then hands them to the pure rules. A read that fails becomes an "unavailable" input; it never
 * becomes a default value.
 */
import { BinanceApi, findMarketStatus, findSwapTx, type SimulationResult } from "@bitstock/binance";
import { erc20Allowance, isAddress, readMultiplierState } from "@bitstock/chain";
import type { GuardConfig } from "./config.ts";
import { parseDecimal, tryParseDecimal } from "./decimal.ts";
import { buildRecord } from "./record.ts";
import type { ReferencePriceSource } from "./reference.ts";
import {
  checkExecution, checkMultiplier, checkReference, checkSession, checkSimulation, chooseRoute, decide, quotePricePerToken,
  type MarketStatusObs, type MultiplierObs, type QuoteObs, type ReferenceObs, type Route, type SimulationObs, type Sourced, type SwapPin,
} from "./rules.ts";
import type { DecisionRecord, GuardInput, GuardRequest } from "./types.ts";

export interface GuardDeps {
  api: BinanceApi;
  rpcUrl: string;
  reference: ReferencePriceSource;
  /** Token paid with (USDT on BSC) and its decimals. */
  payToken: string;
  payDecimals: number;
  now?: () => Date;
}

const BINANCE = "Binance Web3 API";
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T; at: string } | { ok: false; error: string; at: string; code?: number }> {
  try {
    const value = await fn();
    return { ok: true, value, at: new Date().toISOString() };
  } catch (e) {
    const code = typeof (e as { code?: unknown }).code === "number" ? (e as { code: number }).code : undefined;
    return { ok: false, error: errText(e), at: new Date().toISOString(), ...(code !== undefined ? { code } : {}) };
  }
}

export interface GuardRun {
  record: DecisionRecord;
  /** The SWAP route the checks were run on, so the final transaction uses the same quote. */
  route: Route | undefined;
  /** Buy amount in the pay token's smallest units. */
  amountUnits: bigint;
}

export async function runGuard(deps: GuardDeps, req: GuardRequest, cfg: GuardConfig): Promise<DecisionRecord> {
  return (await runGuardWithContext(deps, req, cfg)).record;
}

export async function runGuardWithContext(deps: GuardDeps, req: GuardRequest, cfg: GuardConfig): Promise<GuardRun> {
  if (!isAddress(req.token) || !isAddress(req.wallet)) throw new Error("token and wallet must be addresses");
  const amountFixed = parseDecimal(req.amountUsd);
  if (amountFixed <= 0n) throw new Error("amount must be above zero");
  // The buy amount is expressed in the pay token (USDT), in its smallest units.
  const amountUnits = (amountFixed * 10n ** BigInt(deps.payDecimals)) / 10n ** 18n;
  const inputs: GuardInput[] = [];
  const add = (i: GuardInput) => inputs.push(i);

  // Reads that do not depend on each other run together.
  const [market, profile, mult, quote] = await Promise.all([
    timed(() => deps.api.underlyingMarket(req.token)),
    timed(() => deps.api.underlyingProfile(req.token)),
    timed(() => readMultiplierState(deps.rpcUrl, req.token)),
    timed(() => deps.api.quote({ fromTokenAddress: deps.payToken, toTokenAddress: req.token, amount: amountUnits.toString(), userWalletAddress: req.wallet })),
  ]);

  // 1. session
  const status = market.ok ? (findMarketStatus(market.value) as MarketStatusObs | undefined) : undefined;
  const sessionObs: Sourced<MarketStatusObs> = { source: `${BINANCE} rwa/underlying-market`, asOf: market.at, ...(status ? { value: status } : {}), ...(!market.ok ? { error: market.error } : !status ? { error: "no market-status object in the response" } : {}) };
  add({ name: "market status", value: status ?? null, source: sessionObs.source, asOf: market.at, status: status ? "ok" : "unavailable", ...(sessionObs.error ? { error: sessionObs.error } : {}) });

  // 2. multiplier
  const multObs: Sourced<MultiplierObs> = { source: "BSC eth_call uiMultiplier/newUIMultiplier/effectiveAt", asOf: mult.at, ...(mult.ok ? { value: mult.value } : { error: mult.error }) };
  add({ name: "multiplier state", value: mult.ok ? { uiMultiplier: mult.value.uiMultiplier.toString(), newUIMultiplier: mult.value.newUIMultiplier.toString(), effectiveAt: mult.value.effectiveAt.toString() } : null, source: multObs.source, asOf: mult.at, status: mult.ok ? "ok" : "unavailable", ...(!mult.ok ? { error: mult.error } : {}) });

  // 4. execution (read before the reference, which needs the quoted price)
  const routes: Route[] | undefined = quote.ok && Array.isArray(quote.value) ? (quote.value as Route[]) : undefined;
  const quoteVal: QuoteObs | undefined = quote.ok ? { routes: routes ?? [] } : quote.code !== undefined ? { errorCode: quote.code, errorMessage: quote.error } : undefined;
  const quoteObs: Sourced<QuoteObs> = { source: `${BINANCE} aggregator/quote`, asOf: quote.at, ...(quoteVal ? { value: quoteVal } : {}), ...(!quote.ok ? { error: quote.error } : {}) };
  add({ name: "quote", value: quote.ok ? quote.value : null, source: quoteObs.source, asOf: quote.at, status: quote.ok ? "ok" : "unavailable", ...(!quote.ok ? { error: quote.error } : {}) });
  const route = routes ? chooseRoute(routes) : undefined;

  // 3. independent reference
  const ticker = profile.ok ? String((profile.value as { underlyingTicker?: unknown })?.underlyingTicker ?? "") : "";
  add({ name: "underlying ticker", value: ticker || null, source: `${BINANCE} rwa/underlying-profile`, asOf: profile.at, status: ticker ? "ok" : "unavailable", ...(!profile.ok ? { error: profile.error } : {}) });
  const ref = ticker ? await timed(() => deps.reference.read(ticker)) : ({ ok: false, error: "underlying ticker unavailable", at: new Date().toISOString() } as const);
  const refObs: Sourced<ReferenceObs> = { source: deps.reference.name, asOf: ref.at, ...(ref.ok ? { value: ref.value } : { error: ref.error }) };
  add({ name: "independent price", value: ref.ok ? ref.value : null, source: (ref.ok ? ref.value.sourceName : undefined) ?? deps.reference.name, asOf: ref.ok ? ref.value.priceTime : ref.at, status: ref.ok ? "ok" : "unavailable", ...(!ref.ok ? { error: ref.error } : {}) });

  // 5. simulation: allowance first (the simulator is stateful), then build and dry-run the swap
  let simObs: Sourced<SimulationObs> & { skipped?: string } = { source: `${BINANCE} pre-transaction/simulate`, asOf: null };
  let pin: SwapPin | undefined;
  if (!route) {
    simObs = { ...simObs, skipped: "there is no swap route to test." };
  } else {
    const spender = route.approveTarget;
    if (spender && isAddress(spender)) {
      const allowance = await timed(() => erc20Allowance(deps.rpcUrl, deps.payToken, req.wallet, spender));
      add({ name: "pay-token allowance", value: allowance.ok ? { spender, allowance: allowance.value.value.toString(), needed: amountUnits.toString() } : null, source: "BSC eth_call allowance", asOf: allowance.at, status: allowance.ok ? "ok" : "unavailable", ...(!allowance.ok ? { error: allowance.error } : {}) });
    }
    const swap = await timed(() =>
      deps.api.swap({ fromTokenAddress: deps.payToken, toTokenAddress: req.token, amount: amountUnits.toString(), userWalletAddress: req.wallet, quoteId: String(route.quoteId), slippagePercent: cfg.defaultSlippagePercent, ...(route.vendorName ? { vendor: route.vendorName } : {}) }),
    );
    const tx = swap.ok ? findSwapTx(swap.value) : undefined;
    add({ name: "swap transaction", value: tx ? { from: tx.from, to: tx.to, value: tx.value ?? "0", dataBytes: (tx.data.length - 2) / 2 } : null, source: `${BINANCE} aggregator/swap`, asOf: swap.at, status: tx ? "ok" : "unavailable", ...(!swap.ok ? { error: swap.error } : !tx ? { error: "no transaction object in the response" } : {}) });
    if (tx) pin = { tx: { from: tx.from, to: tx.to, value: String(tx.value ?? "0") }, expectedTo: route.approveTarget };
    if (!tx) {
      simObs = { ...simObs, skipped: swap.ok ? "the swap response had no transaction to test." : `the swap could not be built (${swap.error}).` };
    } else {
      const sim = await timed(() => deps.api.simulate({ from: tx.from, to: tx.to, value: String(tx.value ?? "0"), data: tx.data }));
      simObs = { ...simObs, asOf: sim.at, ...(sim.ok ? { value: sim.value as SimulationResult as SimulationObs } : { error: sim.error }) };
      add({ name: "simulation", value: sim.ok ? sim.value : null, source: simObs.source, asOf: sim.at, status: sim.ok ? "ok" : "unavailable", ...(!sim.ok ? { error: sim.error } : {}) });
    }
  }

  const now = (deps.now ?? (() => new Date()))();
  const checks = [
    checkSession(sessionObs),
    checkMultiplier(multObs, now, cfg),
    checkReference(refObs, quotePricePerToken(route), mult.ok ? mult.value.uiMultiplier : undefined, now, cfg),
    checkExecution(quoteObs, cfg),
    checkSimulation(simObs, req.token, req.wallet, pin, { approvalByWallet: req.executor === "agentic-wallet", spend: { token: deps.payToken, maxUnits: amountUnits } }),
  ];
  const impact = tryParseDecimal(route?.priceImpactPercent);
  const decision = decide(checks, impact, now, cfg);
  const record = buildRecord(req, inputs, checks, decision, cfg, now);
  return { record, route, amountUnits };
}

