import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findMarketStatus } from "@bitstock/binance";
import { DEFAULT_GUARD_CONFIG as cfg } from "../src/config.ts";
import { parseYahooChart } from "../src/reference.ts";
import { checkExecution, checkSession, checkSimulation, quotePricePerToken, type MarketStatusObs, type Route } from "../src/rules.ts";

// Replays real responses saved in docs/evidence/ (AGENTS.md section 4, item 9).
const ev = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../docs/evidence", name), "utf8"));
const NVDAB = "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436";

describe("contract: recorded live responses", () => {
  it("finds statusInfo in the real underlying-market response and reads it as trading", () => {
    const b2 = ev("b2-rwa-underlying-nvdab.railway-sg.json");
    const status = findMarketStatus(b2.result.market) as MarketStatusObs | undefined;
    expect(status?.reasonCode).toBe("TRADING");
    expect(checkSession({ source: "evidence", asOf: null, ...(status ? { value: status } : {}) }).result).toBe("pass");
  });
  it("reads the real Saturday quote as one SWAP route with tiny impact", () => {
    const routes = ev("b4-trading-quote-usdt-nvdab.railway-sg.json").result["$1"] as Route[];
    expect(checkExecution({ source: "evidence", asOf: null, value: { routes } }, cfg).result).toBe("pass");
    const p = quotePricePerToken(routes[0]);
    expect(Number(p! / 10n ** 15n) / 1000).toBeCloseTo(230.49, 1); // 1 USDT valued at its quoted USD price
  });
  it("reads the real missing-allowance simulation as a failure that asks for approval", () => {
    const sim = ev("b5-swap-build-and-simulate.railway-sg.json").result.simulation;
    const c = checkSimulation({ source: "evidence", asOf: null, value: sim }, NVDAB, "0x0000000000000000000000000000000000000001");
    expect(c.result).toBe("fail");
    expect(c.reason).toContain("Approve USDT");
  });
  it("parses the real Yahoo chart response for NVDA", () => {
    const r = parseYahooChart(ev("reference-yahoo-nvda-chart.json").response, "NVDA");
    expect(r).toEqual({ pricePerShare: "229.28", currency: "USD", priceTime: "2026-10-09T20:00:00.000Z" });
  });
  it("refuses a Yahoo response for the wrong symbol or with an error", () => {
    const body = ev("reference-yahoo-nvda-chart.json").response;
    expect(() => parseYahooChart(body, "TSLA")).toThrow(/symbol mismatch/);
    expect(() => parseYahooChart({ chart: { error: { code: "Not Found" } } }, "NVDA")).toThrow();
  });
});
