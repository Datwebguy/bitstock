/** The agent API. Every number shown in the app comes from here, with its source and time. */
export const AGENT_URL = (process.env.NEXT_PUBLIC_AGENT_URL ?? "").replace(/\/+$/, "");

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${AGENT_URL}/v1${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || (res.status === 429 ? "Too many requests. Wait a minute and try again." : "Bitstock could not reach its server. Try again in a moment."));
  return body;
}

export type Sourced<T> = { value: T | null; source: string; asOf: string; error?: string; note?: string };

export interface MarketStatus { openState: boolean; marketStatus: string | null; reasonCode: string | null; reasonMsg: string | null; nextOpenTime: number | string | null }

export interface MarketView {
  token: { address: string; symbol: string; name: string | null; logo: string | null; ticker: string | null; company: string | null };
  session: Sourced<MarketStatus>;
  tokenPrice: Sourced<string>;
  multiplier: Sourced<{ current: string; pending: string; effectiveAt: string }>;
  reference: Sourced<{ pricePerShare: string; currency: string; priceTime: string; session?: string; sourceName?: string }>;
  gapPercent: { value: string | null; note: string };
  company: { note: string | null; source: string; asOf: string };
  marketData: Sourced<Record<string, string | null>>;
}

export interface Check { id: string; name: string; result: "pass" | "warn" | "fail" | "unavailable"; rawValue: string | null; threshold: string | null; source: string; asOf: string | null; reason: string }

export interface Decision {
  id: string; at: string; rulesVersion: string; outcome: "GO" | "LIMIT" | "WAIT" | "BLOCK"; reason: string; recheckAt: string | null;
  limits: { slippagePercent: string; why: string } | null; checks: Check[]; status?: string; txHash: string | null; intentId?: string | null;
  prepared?: { from: string; to: string; value: string; data: string; gas: string; gasPrice: string; slippagePercent: string; minReceiveAmount: string | null; simulation: { status: string; stockArriving: string | null }; expiresAt: number } | null;
}

/** A buy that waited: the agent checks it again in full at recheckAt. Nothing is bought without the user. */
export interface Intent { id: string; status: "waiting" | "ready" | "blocked" | "cancelled"; reason: string; recheckAt: string; attempts: number; lastDecisionId: string }

/** A USDT approval for exactly one buy's amount, prepared and tested by the agent; the user signs it. */
export interface Approval {
  needed: boolean;
  spender: string;
  amount: string;
  current: string;
  tx: { from: string; to: string; value: string; data: string; gas: string; gasPrice: string; chainId: number } | null;
  expiresAt: number | null;
}

/** True when the only thing stopping this buy is that the wallet has not approved USDT for it yet. */
export function needsApproval(d: Pick<Decision, "outcome" | "checks">): boolean {
  if (d.outcome !== "BLOCK") return false;
  const failed = d.checks.filter((c) => c.result === "fail");
  return failed.length === 1 && failed[0]!.id === "simulation" && /allowance/i.test(failed[0]!.rawValue ?? "");
}

export interface Position {
  token: { address: string; symbol: string; name: string | null; logo: string | null; ticker: string | null; company: string };
  balance: { raw: string; tokens: string; source: string; asOf: string };
  multiplier: { value: string | null; source: string; asOf: string };
  shares: string | null;
  valueAtReference: { value: string | null; price: string | null; priceTime: string | null; source: string; note: string };
  explanation: string | null;
  multiplierExplanation: string | null;
}

export interface Holdings {
  wallet: string;
  positions: Position[];
  checked: number;
  unread: string[];
  asOf: string;
  buys: Array<{ at: string; txHash: string; status: string; amountUsd: string; outcome: Decision["outcome"]; symbol: string | null }>;
}

export interface ListedToken {
  address: string; symbol: string; name: string | null; logo: string | null; ticker: string | null; company: string | null; decimals: number; price: string | null;
  session: { openState: boolean; reasonCode: string | null; reasonMsg: string | null; nextOpenTime: number | string | null } | null;
}

export interface TokenList { tokens: ListedToken[]; asOf: string; source: string; featured: string }

export interface AgentConfig { featured: { address: string; symbol: string } | null; maxBuyUsd: string; chainId: number; killSwitch: boolean }

/** Plain decimal formatting without floating point. */
export function trimDecimal(s: string | null | undefined, places: number): string | null {
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  return places > 0 ? `${w}.${(f + "0".repeat(places)).slice(0, places)}` : w!;
}

export function units18(raw: string | null | undefined, places = 6): string | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const s = raw.padStart(19, "0");
  return `${s.slice(0, -18)}.${s.slice(-18).slice(0, places)}`;
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "unavailable";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unavailable";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Plain-language names for data sources; the full technical source stays in the stored decision record. */
export function friendlySource(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("yahoo")) return "Yahoo Finance";
  if (s.includes("pyth")) return "Pyth";
  if (s.includes("simulate")) return "Binance test run";
  if (s.includes("quote")) return "Binance live price";
  if (s.includes("binance")) return "Binance";
  if (s.includes("bnb smart chain") || s.includes("eth_call") || s.includes("bsc")) return "the token on BNB Smart Chain";
  return "Bitstock";
}

/** "From Binance · 10 Oct 2026, 23:40": where a value came from and when, in plain words. */
export function fromLine(source: string, asOf?: string | null): string {
  return asOf ? `From ${friendlySource(source)} · ${when(asOf)}` : `From ${friendlySource(source)}`;
}

/** Plain labels for a check's result. */
export const RESULT_LABEL: Record<Check["result"], string> = { pass: "OK", warn: "Caution", fail: "Failed", unavailable: "Not read" };

/** A plain word for a stock's market state, from the live status object. */
export function sessionWord(s: { openState: boolean; reasonCode: string | null } | null | undefined): { text: string; cls: string } {
  if (!s) return { text: "Unavailable", cls: "idle" };
  if (s.reasonCode === "ASSET_PAUSED") return { text: "Paused", cls: "bad" };
  if (s.reasonCode === "MARKET_PAUSED" || s.reasonCode === "MARKET_MAINTENANCE") return { text: "Paused", cls: "bad" };
  if (s.reasonCode === "ASSET_LIMITED") return { text: "Limited", cls: "warn" };
  if (!s.openState) return { text: "Market closed", cls: "warn" };
  return { text: "Trading", cls: "good" };
}

const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

/** Replace machine timestamps inside sentences with the reader's local date and time. */
export function humanize(text: string): string {
  return text.replace(ISO_RE, (iso) => when(iso));
}
