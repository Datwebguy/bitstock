/**
 * The tokenized stocks Bitstock offers: whatever Binance's RWA Data API lists for bStock on BSC
 * right now. Nothing is hardcoded; a token that leaves the list stops being offered.
 */
import { findMarketStatus } from "@bitstock/binance";
import type { AgentContext } from "./context.ts";

export interface ListedToken {
  address: string;
  symbol: string;
  name: string | null;
  logo: string | null;
  ticker: string | null;
  company: string | null;
  decimals: number;
  price: string | null;
  session: { openState: boolean; reasonCode: string | null; reasonMsg: string | null; nextOpenTime: number | string | null } | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Parse the rwa/tokens response. Entries without a valid address, symbol or decimals are dropped. */
export function parseTokenList(raw: unknown): ListedToken[] {
  if (!Array.isArray(raw)) return [];
  const out: ListedToken[] = [];
  const seen = new Set<string>();
  for (const t of raw as Array<Record<string, unknown>>) {
    if (!t || typeof t !== "object") continue;
    const address = str(t["tokenContractAddress"]);
    const symbol = str(t["tokenSymbol"]);
    const decimals = Number(t["decimals"]);
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address) || !symbol || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) continue;
    if (String(t["binanceChainId"] ?? "56") !== "56") continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const status = findMarketStatus(t) ?? null;
    out.push({
      address: key,
      symbol,
      name: str(t["tokenName"]),
      logo: str(t["tokenLogoUrl"]),
      ticker: str(t["underlyingTicker"]),
      company: str(t["underlyingName"]),
      decimals,
      price: str(t["tokenPrice"]),
      session: status ? { openState: status.openState, reasonCode: status.reasonCode ?? null, reasonMsg: status.reasonMsg ?? null, nextOpenTime: status.nextOpenTime ?? null } : null,
    });
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

let cache: { at: number; asOf: string; tokens: ListedToken[] } | null = null;

/** The live list, cached for 30 seconds. Throws when Binance cannot be read and nothing is cached. */
export async function listedTokens(ctx: AgentContext): Promise<{ tokens: ListedToken[]; asOf: string; source: string }> {
  const source = "Binance Web3 API rwa/tokens";
  if (cache && Date.now() - cache.at < 30_000) return { tokens: cache.tokens, asOf: cache.asOf, source };
  const tokens = parseTokenList(await ctx.api.rwaTokens("bstock"));
  if (tokens.length === 0) throw new Error("Binance returned no tokenized stocks");
  cache = { at: Date.now(), asOf: new Date().toISOString(), tokens };
  return { tokens, asOf: cache.asOf, source };
}

/** Find a listed token by address or symbol (case-insensitive). */
export async function findToken(ctx: AgentContext, idOrSymbol: string): Promise<ListedToken | null> {
  const { tokens } = await listedTokens(ctx);
  const k = idOrSymbol.trim().toLowerCase();
  return tokens.find((t) => t.address === k || t.symbol.toLowerCase() === k) ?? null;
}
