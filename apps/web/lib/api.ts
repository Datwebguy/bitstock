/** The agent API. Every number shown in the app comes from here, with its source and time. */
export const AGENT_URL = (process.env.NEXT_PUBLIC_AGENT_URL ?? "").replace(/\/+$/, "");

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${AGENT_URL}/v1${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `The service answered ${res.status}.`);
  return body;
}

export type Sourced<T> = { value: T | null; source: string; asOf: string; error?: string; note?: string };

export interface MarketStatus { openState: boolean; marketStatus: string | null; reasonCode: string | null; reasonMsg: string | null; nextOpenTime: number | string | null }

export interface MarketView {
  token: { address: string; symbol: string; name: string | null; logo: string | null; ticker: string | null };
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
  limits: { slippagePercent: string; why: string } | null; checks: Check[]; status?: string; txHash: string | null;
  prepared?: { from: string; to: string; value: string; data: string; gas: string; gasPrice: string; slippagePercent: string; minReceiveAmount: string | null; simulation: { status: string; stockArriving: string | null }; expiresAt: number } | null;
}

export interface Holdings {
  wallet: string;
  balance: { raw: string | null; tokens: string | null; source: string; asOf: string; error?: string };
  multiplier: { value: string | null; source: string; asOf: string };
  shares: string | null;
  valueAtReference: { value: string | null; price: string | null; priceTime: string | null; source: string; note: string };
  explanation: string | null;
  multiplierExplanation: string | null;
  buys: Array<{ at: string; txHash: string; status: string; amountUsd: string; outcome: string }>;
}

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
  if (s.includes("fallback") && s.includes("yahoo")) return "Yahoo Finance stock price (our first choice, Pyth, was unavailable)";
  if (s.includes("pyth")) return "Pyth stock price";
  if (s.includes("yahoo")) return "Yahoo Finance stock price";
  if (s.includes("simulate")) return "Binance dry run of this exact trade";
  if (s.includes("quote")) return "Binance live quote for this amount";
  if (s.includes("underlying-market") || s.includes("rwa/tokens") || s.includes("rwa/price")) return "Binance market data";
  if (s.includes("profile")) return "Binance company profile";
  if (s.includes("uimultiplier") || s.includes("eth_call") || s.includes("bnb smart chain")) return "The NVDAB token contract on BNB Smart Chain";
  return source;
}

const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

/** Replace machine timestamps inside sentences with the reader's local date and time. */
export function humanize(text: string): string {
  return text.replace(ISO_RE, (iso) => when(iso));
}
