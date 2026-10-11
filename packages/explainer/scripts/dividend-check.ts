/**
 * Live dividend sanity check for NVDAB (Prompt 3). Reads the multiplier from the chain and the
 * announced dividend and closes from the chart feed now. Prints the comparison and what is unconfirmed.
 * Run: node packages/explainer/scripts/dividend-check.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readMultiplierState } from "@bitstock/chain";
import { assessDividend, changePercent, explainMultiplierChange, formatFixed, impliedNetPerShare, parseFixed } from "../src/index.ts";

process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
const rpc = process.env["BSC_RPC_URL"] ?? "";
const NVDAB = "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436";
const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=1d&range=1y&events=div";

const state = await readMultiplierState(rpc, NVDAB);
const res = await fetch(CHART_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
const chart = ((await res.json()) as { chart: { result: Array<{ events?: { dividends?: Record<string, { amount: number; date: number }> }; timestamp: number[]; indicators: { quote: Array<{ close: number[] }> } }> } }).chart.result[0]!;
const divs = Object.values(chart.events?.dividends ?? {}).sort((a, b) => b.date - a.date);
const latest = divs[0];
if (!latest) throw new Error("no dividend in the last year");
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const exIdx = chart.timestamp.findIndex((t) => day(t) === day(latest.date));
const closeEx = chart.indicators.quote[0]!.close[exIdx];
const closeBefore = chart.indicators.quote[0]!.close[exIdx - 1];
const price = (n: number | undefined) => (n === undefined ? null : n.toFixed(2));

const assumedOld = 10n ** 18n;
const lines: string[] = [];
const out: Record<string, unknown> = { ranAt: new Date().toISOString(), multiplierNow: { uiMultiplier: state.uiMultiplier.toString(), newUIMultiplier: state.newUIMultiplier.toString(), effectiveAt: state.effectiveAt.toString(), source: `eth_call via ${new URL(rpc).host}` } };
lines.push(`multiplier now: ${formatFixed(state.uiMultiplier, 18)} (nothing pending: effectiveAt=${state.effectiveAt})`);
lines.push(`latest announced dividend (chart-feed events): ${latest.amount} USD per share, ex-date ${day(latest.date)}; close on ex-date ${price(closeEx)}, close the day before ${price(closeBefore)}`);
lines.push(`IF the multiplier was exactly 1.0 before (not verified): change ${formatFixed(changePercent(assumedOld, state.uiMultiplier), 4)}%`);
const scen: Record<string, unknown> = {};
for (const [label, p] of [["ex-date close", price(closeEx)], ["previous close", price(closeBefore)]] as const) {
  if (!p) continue;
  const net = impliedNetPerShare(assumedOld, state.uiMultiplier, parseFixed(p));
  scen[label] = { price: p, impliedNetPerShare: formatFixed(net, 6), grossIfWithholding30: formatFixed((net * 10n) / 7n, 6) };
  lines.push(`  at ${label} ${p}: implied net ${formatFixed(net, 6)} USD per share; would equal ${formatFixed((net * 10n) / 7n, 6)} gross only if 30% were withheld (rate not confirmed)`);
}
const verdict = assessDividend({
  oldMultiplier: null,
  newMultiplier: { value: state.uiMultiplier, source: "eth_call uiMultiplier()" },
  announced: { amountPerShare: String(latest.amount), exDate: day(latest.date), source: "market chart feed (events)" },
  reinvestPrice: null,
  confirmedWithholding: null,
  tolerancePercent: "2",
});
lines.push(`verdict: ${verdict.verdict}`);
lines.push(`text the app would show: ${explainMultiplierChange(verdict)}`);
Object.assign(out, { announced: { amount: latest.amount, exDate: day(latest.date), closeEx: price(closeEx), closeBefore: price(closeBefore), source: CHART_URL }, assumption: "multiplier was 1.0 before the change (not verified: no historical log retrievable)", scenarios: scen, verdict, text: explainMultiplierChange(verdict) });
console.log(lines.join("\n"));
writeFileSync(resolve(import.meta.dirname, "../../../docs/evidence/dividend-check-nvdab.json"), JSON.stringify(out, null, 2) + "\n");
