import { describe, expect, it } from "vitest";
import { DEFAULT_GUARD_CONFIG as cfg } from "../src/config.ts";
import { parseDecimal } from "../src/decimal.ts";
import {
  checkExecution, checkMultiplier, checkReference, checkSession, checkSimulation, chooseRoute, decide, limitSlippage, quotePricePerToken,
  type MarketStatusObs, type Route,
} from "../src/rules.ts";
import type { Check } from "../src/types.ts";

// Fixtures for pure-rule tests only. Real responses are replayed in contract.test.ts.
const NOW = new Date("2026-10-12T15:00:00.000Z");
const STOCK = "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436";
const WALLET = "0x1111111111111111111111111111111111111111";
const status = (s: Partial<MarketStatusObs>): MarketStatusObs => ({ openState: true, marketStatus: "regular", reasonCode: "TRADING", reasonMsg: null, nextOpenTime: null, nextCloseTime: null, ...s });
const sess = (s?: MarketStatusObs, error?: string) => checkSession({ source: "test", asOf: NOW.toISOString(), ...(s ? { value: s } : {}), ...(error ? { error } : {}) });

describe("1. session", () => {
  it("passes when the market is open and trading", () => {
    expect(sess(status({})).result).toBe("pass");
  });
  it("passes on the live Saturday shape (openState true, TRADING, marketStatus null)", () => {
    expect(sess(status({ marketStatus: null })).result).toBe("pass");
  });
  it("warns when closed and gives the next open time", () => {
    const open = Date.parse("2026-10-12T13:30:00.000Z");
    const c = sess(status({ openState: false, marketStatus: "closed", reasonCode: "MARKET_CLOSED", reasonMsg: "Weekend or Holiday", nextOpenTime: open }));
    expect(c.result).toBe("warn");
    expect(c.reason).toContain("2026-10-12T13:30:00.000Z");
    expect(c.retryAt).toBe("2026-10-12T13:30:00.000Z");
  });
  it("warns when closed without a next open time and says so", () => {
    const c = sess(status({ openState: false, reasonCode: "MARKET_CLOSED", nextOpenTime: null }));
    expect(c.result).toBe("warn");
    expect(c.reason).toContain("did not say when");
  });
  for (const msg of ["cash_dividend", "stock_dividend", "stock_split", "merger", "acquisition", "spinoff", "maintenance", "corporate action"]) {
    it(`fails on ASSET_PAUSED for ${msg}`, () => {
      const c = sess(status({ openState: false, reasonCode: "ASSET_PAUSED", reasonMsg: msg, marketStatus: "pause" }));
      expect(c.result).toBe("fail");
      expect(c.reason).toMatch(/^The issuer has paused this token for /);
      expect(c.reason).not.toContain("undefined");
    });
  }
  it("fails on ASSET_PAUSED with an unknown reason and still explains", () => {
    expect(sess(status({ reasonCode: "ASSET_PAUSED", reasonMsg: null })).reason).toContain("did not state");
  });
  it("warns on ASSET_LIMITED for earnings", () => {
    const c = sess(status({ reasonCode: "ASSET_LIMITED", reasonMsg: "earnings" }));
    expect(c.result).toBe("warn");
    expect(c.reason).toContain("earnings");
  });
  it("fails on MARKET_PAUSED, MARKET_MAINTENANCE and UNSUPPORTED", () => {
    for (const code of ["MARKET_PAUSED", "MARKET_MAINTENANCE", "UNSUPPORTED"]) expect(sess(status({ reasonCode: code })).result).toBe("fail");
  });
  it("is unavailable when the status object is missing (fail closed)", () => {
    expect(sess(undefined, "no market-status object in the response").result).toBe("unavailable");
  });
  it("warns on an unrecognised code instead of passing", () => {
    expect(sess(status({ reasonCode: "SOMETHING_NEW" })).result).toBe("warn");
  });
});

describe("2. multiplier", () => {
  const m = (ui: string, next: string, at: number) => checkMultiplier({ source: "test", asOf: null, value: { uiMultiplier: parseDecimal(ui), newUIMultiplier: parseDecimal(next), effectiveAt: BigInt(at) } }, NOW, cfg);
  const nowSec = NOW.getTime() / 1000;
  it("passes when nothing is scheduled", () => {
    expect(m("1.000778223752807865", "1.000778223752807865", 0).result).toBe("pass");
  });
  it("warns when a change is scheduled within 24 hours", () => {
    const c = m("1.000778", "1.0015", nowSec + 3600);
    expect(c.result).toBe("warn");
    expect(c.reason).toContain("1.001500");
  });
  it("warns at exactly 24 hours and passes just beyond", () => {
    expect(m("1", "1.1", nowSec + 24 * 3600).result).toBe("warn");
    expect(m("1", "1.1", nowSec + 24 * 3600 + 1).result).toBe("pass");
  });
  it("passes once the effective time is in the past (the contract already returns the new value)", () => {
    expect(m("1.1", "1.1", nowSec - 60).result).toBe("pass");
  });
  it("is unavailable when it cannot be read, and fails on a zero multiplier", () => {
    expect(checkMultiplier({ source: "test", asOf: null, error: "timeout" }, NOW, cfg).result).toBe("unavailable");
    expect(m("0", "0", 0).result).toBe("fail");
  });
});

describe("3. independent reference", () => {
  const mult = parseDecimal("1.000778223752807865");
  const perToken = (perShare: string) => (parseDecimal(perShare) * mult) / 10n ** 18n;
  const ref = (price: string, minutesAgo: number, currency = "USD") => ({ source: "test", asOf: null, value: { pricePerShare: price, currency, priceTime: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString() } });
  it("is unavailable (never a pass) when no independent price exists", () => {
    const c = checkReference({ source: "test", asOf: null, error: "HTTP 429" }, perToken("230"), mult, NOW, cfg);
    expect(c.result).toBe("unavailable");
    expect(c.reason).toContain("cannot pass");
  });
  it("passes within 0.5% of a live price, converting through the multiplier", () => {
    expect(checkReference(ref("230.00", 5), perToken("230.50"), mult, NOW, cfg).result).toBe("pass");
  });
  it("warns between 0.5% and 2% of a live price and fails beyond", () => {
    expect(checkReference(ref("230.00", 5), perToken("233.00"), mult, NOW, cfg).result).toBe("warn");
    expect(checkReference(ref("230.00", 5), perToken("240.00"), mult, NOW, cfg).result).toBe("fail");
  });
  it("never passes against a last close, even with zero gap", () => {
    const c = checkReference(ref("230.00", 60 * 40), perToken("230.00"), mult, NOW, cfg);
    expect(c.result).toBe("warn");
    expect(c.reason).toContain("not live right now");
  });
  it("fails against a last close beyond 10%", () => {
    expect(checkReference(ref("200.00", 60 * 40), perToken("230.00"), mult, NOW, cfg).result).toBe("fail");
  });
  it("is unavailable for a non-USD price or a missing quote", () => {
    expect(checkReference(ref("230", 5, "EUR"), perToken("230"), mult, NOW, cfg).result).toBe("unavailable");
    expect(checkReference(ref("230", 5), undefined, mult, NOW, cfg).result).toBe("unavailable");
  });
});

describe("4. execution", () => {
  const swap = (impact: string, extra: Partial<Route> = {}): Route => ({ vendorName: "LiquidMesh", executionMode: "SWAP", toTokenAmount: "4334315581714481", priceImpactPercent: impact, isBest: true, ...extra });
  const ex = (routes: Route[]) => checkExecution({ source: "test", asOf: null, value: { routes } }, cfg);
  it("passes a SWAP route with tiny impact and words it without a misleading zero", () => {
    const c = ex([swap("0.0006252806")]);
    expect(c.result).toBe("pass");
    expect(c.reason).toBe("Your buy would move the price by less than 0.01%.");
    expect(c.rawValue).toContain("0.0006252806");
    expect(ex([swap("0.5")]).reason).toContain("0.50%");
  });
  it("refuses an RFQ-only quote", () => {
    const c = ex([{ vendorName: "PcsXRfq", executionMode: "RFQ", toTokenAmount: "5", priceImpactPercent: "0" }]);
    expect(c.result).toBe("fail");
    expect(c.reason).toContain("cannot be tested");
  });
  it("uses the SWAP route when RFQ is also offered", () => {
    expect(ex([{ vendorName: "PcsXRfq", executionMode: "RFQ", toTokenAmount: "9", priceImpactPercent: "0" }, swap("0.01", { isBest: false })]).result).toBe("pass");
  });
  it("warns above 0.3% impact and fails above 1%", () => {
    expect(ex([swap("0.5")]).result).toBe("warn");
    expect(ex([swap("1.01")]).result).toBe("fail");
  });
  it("fails on zero output", () => {
    expect(ex([swap("0", { toTokenAmount: "0" })]).result).toBe("fail");
  });
  it("reads a malformed amount from upstream as unavailable instead of throwing", () => {
    for (const bad of ["abc", "1.5", "-5", "0x10", " "]) {
      expect(() => ex([swap("0", { toTokenAmount: bad })])).not.toThrow();
      expect(ex([swap("0", { toTokenAmount: bad })]).result).toBe("unavailable");
    }
    expect(() => chooseRoute([swap("0", { isBest: false, toTokenAmount: "oops" }), swap("0", { isBest: false })])).not.toThrow();
    expect(quotePricePerToken({ fromTokenAmount: "x", toTokenAmount: "5", fromToken: { tokenUnitPrice: "1", decimal: "18" }, toToken: { decimal: "18" } })).toBeUndefined();
  });
  it("fails closed on a malformed BNB value or token change in the test run", () => {
    const pin = { tx: { from: WALLET, to: "0x" + "ab".repeat(20), value: "1.5" }, expectedTo: "0x" + "ab".repeat(20) };
    expect(() => checkSimulation({ source: "test", asOf: null, value: { status: "SUCCESS" } }, STOCK, WALLET, pin)).not.toThrow();
    expect(checkSimulation({ source: "test", asOf: null, value: { status: "SUCCESS" } }, STOCK, WALLET, pin).result).toBe("fail");
    const bad = { status: "SUCCESS", balanceChanges: [{ contractAddress: STOCK, owner: WALLET, change: "12abc" }] };
    expect(checkSimulation({ source: "test", asOf: null, value: bad }, STOCK, WALLET).result).toBe("fail");
  });
  it("is unavailable when Binance refuses to quote while the exchange is closed (40369)", () => {
    const c = checkExecution({ source: "test", asOf: null, value: { errorCode: 40369, errorMessage: "closed" } }, cfg);
    expect(c.result).toBe("unavailable");
    expect(c.reason).toContain("closed");
  });
  it("is unavailable with no routes or no quote", () => {
    expect(ex([]).result).toBe("unavailable");
    expect(checkExecution({ source: "test", asOf: null, error: "network" }, cfg).result).toBe("unavailable");
  });
  it("computes the USD price per token from a route", () => {
    const p = quotePricePerToken({ fromTokenAmount: "1000000000000000000", toTokenAmount: "4334315581714481", fromToken: { tokenUnitPrice: "1", decimal: "18" }, toToken: { decimal: "18" } });
    expect(p).toBeDefined();
    expect(Number(p! / 10n ** 14n) / 10_000).toBeCloseTo(230.7169, 3);
    expect(quotePricePerToken({ fromTokenAmount: "1", toTokenAmount: "0", fromToken: { tokenUnitPrice: "1", decimal: "18" }, toToken: { decimal: "18" } })).toBeUndefined();
  });
});

describe("5. simulation", () => {
  const sim = (v: object) => checkSimulation({ source: "test", asOf: null, value: v }, STOCK, WALLET);
  it("passes when SUCCESS shows the stock arriving in the wallet", () => {
    expect(sim({ status: "SUCCESS", balanceChanges: [{ contractAddress: STOCK.toLowerCase(), owner: WALLET, change: "4334315581714481" }] }).result).toBe("pass");
  });
  it("fails when the simulation failed", () => {
    expect(sim({ status: "FAILED", failReason: "execution reverted" }).result).toBe("fail");
  });
  it("fails with an approval explanation on the real missing-allowance revert", () => {
    const c = sim({ status: "FAILED", failReason: "execution reverted: BEP20: transfer amount exceeds allowance", balanceChanges: [] });
    expect(c.result).toBe("fail");
    expect(c.reason).toContain("Approve USDT");
  });
  it("warns, never passes, on a missing approval when an Agentic Wallet will approve inside its own swap", () => {
    const failed = { source: "test", asOf: null, value: { status: "FAILED", failReason: "execution reverted: BEP20: transfer amount exceeds allowance", balanceChanges: [] } };
    const c = checkSimulation(failed, STOCK, WALLET, undefined, { approvalByWallet: true });
    expect(c.result).toBe("warn");
    expect(c.reason).toContain("Agentic Wallet");
    // Any other failure still fails for an Agentic Wallet.
    expect(checkSimulation({ ...failed, value: { ...failed.value, failReason: "execution reverted: paused" } }, STOCK, WALLET, undefined, { approvalByWallet: true }).result).toBe("fail");
  });
  it("says how much USDT the wallet holds and how much the buy needs", () => {
    const failed = { source: "t", asOf: null, value: { status: "FAILED", failReason: "execution reverted: BEP20: transfer amount exceeds balance", balanceChanges: [] } };
    const USDT = "0x55d398326f99059fF775485246999027B3197955";
    const c = checkSimulation(failed, STOCK, WALLET, undefined, { spend: { token: USDT, maxUnits: 10n ** 18n, decimals: 18 }, heldUnits: 0n });
    expect(c.result).toBe("fail");
    expect(c.reason).toBe("Your wallet holds 0.00 USDT on BNB Smart Chain, and this buy needs 1.00 USDT. Add USDT on BNB Smart Chain, then check again.");
    // A shortfall is never rounded away: 0.999 USDT reads 0.99.
    expect(checkSimulation(failed, STOCK, WALLET, undefined, { spend: { token: USDT, maxUnits: 10n ** 18n }, heldUnits: 999n * 10n ** 15n }).reason).toContain("holds 0.99 USDT");
  });
  it("says plainly when the wallet lacks USDT", () => {
    const c = sim({ status: "FAILED", failReason: "execution reverted: BEP20: transfer amount exceeds balance", balanceChanges: [] });
    expect(c.result).toBe("fail");
    expect(c.reason).toContain("does not hold enough USDT");
  });
  it("fails when SUCCESS shows no stock arriving", () => {
    expect(sim({ status: "SUCCESS", balanceChanges: [] }).result).toBe("fail");
    expect(sim({ status: "SUCCESS", balanceChanges: [{ contractAddress: STOCK, owner: "0x2222222222222222222222222222222222222222", change: "5" }] }).result).toBe("fail");
    expect(sim({ status: "SUCCESS", balanceChanges: [{ contractAddress: STOCK, owner: WALLET, change: "-5" }] }).result).toBe("fail");
  });
  const ROUTER = "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5";
  const ok = { status: "SUCCESS", balanceChanges: [{ contractAddress: STOCK, owner: WALLET, change: "5" }] };
  const pinned = (to: string, from = WALLET, value = "0", expectedTo: string | undefined = ROUTER) =>
    checkSimulation({ source: "t", asOf: null, value: ok }, STOCK, WALLET, { tx: { from, to, value }, expectedTo });
  it("passes when the swap goes to the contract the quote named, from the buyer, with no BNB", () => {
    expect(pinned(ROUTER.toLowerCase()).result).toBe("pass");
  });
  it("fails a swap to any other contract, even if its dry run succeeds", () => {
    const c = pinned("0x9999999999999999999999999999999999999999");
    expect(c.result).toBe("fail");
    expect(c.reason).toContain("does not go where its price offer said");
    const unknownTarget = checkSimulation({ source: "t", asOf: null, value: ok }, STOCK, WALLET, { tx: { from: WALLET, to: ROUTER, value: "0" }, expectedTo: undefined });
    expect(unknownTarget.result).toBe("fail");
  });
  it("fails a swap from another wallet or carrying BNB", () => {
    expect(pinned(ROUTER, "0x2222222222222222222222222222222222222222").result).toBe("fail");
    expect(pinned(ROUTER, WALLET, "1").result).toBe("fail");
  });
  describe("pay-token outflow", () => {
    const USDT = "0x55d398326f99059fF775485246999027B3197955";
    const ONE_USDT = 10n ** 18n;
    const spent = (changes: Array<{ contractAddress: string; owner: string; change: string }>) =>
      checkSimulation({ source: "t", asOf: null, value: { status: "SUCCESS", balanceChanges: [{ contractAddress: STOCK, owner: WALLET, change: "5" }, ...changes] } }, STOCK, WALLET, undefined, { spend: { token: USDT, maxUnits: ONE_USDT } });
    it("passes when exactly the chosen amount leaves the wallet", () => {
      const c = spent([{ contractAddress: USDT.toLowerCase(), owner: WALLET, change: "-1000000000000000000" }]);
      expect(c.result).toBe("pass");
      expect(c.rawValue).toContain("pay-token change -1000000000000000000");
    });
    it("fails when more than the chosen amount would leave the wallet", () => {
      const c = spent([{ contractAddress: USDT, owner: WALLET, change: "-1000000000000000001" }]);
      expect(c.result).toBe("fail");
      expect(c.reason).toContain("more USDT");
      // Split across lines it is still added up.
      expect(spent([{ contractAddress: USDT, owner: WALLET, change: "-600000000000000000" }, { contractAddress: USDT, owner: WALLET, change: "-600000000000000000" }]).result).toBe("fail");
    });
    it("fails closed when the outflow is missing, positive or malformed", () => {
      expect(spent([]).result).toBe("fail");
      expect(spent([{ contractAddress: USDT, owner: "0x2222222222222222222222222222222222222222", change: "-1" }]).result).toBe("fail");
      expect(spent([{ contractAddress: USDT, owner: WALLET, change: "5" }]).result).toBe("fail");
      expect(spent([{ contractAddress: USDT, owner: WALLET, change: "-1e18" }]).result).toBe("fail");
    });
  });
  it("is unavailable when skipped or unreachable", () => {
    expect(checkSimulation({ source: "t", asOf: null, skipped: "no route" }, STOCK, WALLET).result).toBe("unavailable");
    expect(checkSimulation({ source: "t", asOf: null, error: "timeout" }, STOCK, WALLET).result).toBe("unavailable");
  });
});

describe("outcome", () => {
  const c = (id: Check["id"], result: Check["result"], retryAt?: string): Check => ({ id, name: id, result, rawValue: null, threshold: null, source: "t", asOf: null, reason: `${id} ${result}`, ...(retryAt ? { retryAt } : {}) });
  const all = (over: Partial<Record<Check["id"], Check["result"]>>) =>
    (["session", "multiplier", "reference", "execution", "simulation"] as const).map((id) => c(id, over[id] ?? "pass"));
  const impact = parseDecimal("0.0006");
  it("GO only when every check passes", () => {
    const d = decide(all({}), impact, NOW, cfg);
    expect(d.outcome).toBe("GO");
    expect(d.limits?.slippagePercent).toBe("0.5");
  });
  it("LIMIT on any warning, with a tighter slippage", () => {
    const d = decide(all({ session: "warn" }), impact, NOW, cfg);
    expect(d.outcome).toBe("LIMIT");
    expect(Number(d.limits!.slippagePercent)).toBeLessThan(0.5);
  });
  it("LIMIT, never GO, when only the independent price is missing", () => {
    expect(decide(all({ reference: "unavailable" }), impact, NOW, cfg).outcome).toBe("LIMIT");
  });
  it("WAIT when another input is unavailable, re-checking at the known reopen time", () => {
    const checks = all({ execution: "unavailable" });
    checks[0] = c("session", "warn", "2026-10-12T13:30:00.000Z");
    const d = decide(checks, undefined, NOW, cfg);
    expect(d.outcome).toBe("WAIT");
    expect(d.recheckAt).toBe("2026-10-12T13:30:00.000Z");
  });
  it("WAIT without a known time re-checks after the configured minutes", () => {
    expect(decide(all({ simulation: "unavailable" }), impact, NOW, cfg).recheckAt).toBe("2026-10-12T15:15:00.000Z");
  });
  it("BLOCK beats everything", () => {
    const d = decide(all({ session: "unavailable", reference: "warn", simulation: "fail" }), impact, NOW, cfg);
    expect(d.outcome).toBe("BLOCK");
    expect(d.reason).toBe("simulation fail");
  });
});

describe("LIMIT slippage rule", () => {
  it("uses the floor for zero or tiny impact", () => {
    expect(limitSlippage(0n, cfg).slippagePercent).toBe("0.1000");
    expect(limitSlippage(parseDecimal("0.0006252806"), cfg).slippagePercent).toBe("0.1012");
  });
  it("scales with impact in the middle", () => {
    expect(limitSlippage(parseDecimal("0.05"), cfg).slippagePercent).toBe("0.2000");
  });
  it("caps at the ceiling for large impact", () => {
    expect(limitSlippage(parseDecimal("5"), cfg).slippagePercent).toBe("0.2500");
  });
});
