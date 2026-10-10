/**
 * Plain-language text (AGENTS.md sections 8 and 12). Wording for the dividend case is the owner's copy,
 * used verbatim. Numbers come only from the inputs.
 */
import { rawToUi } from "@bitstock/chain";
import type { DividendVerdict } from "./dividend.ts";
import { formatFixed } from "./multiplier.ts";

/** Phrases Bitstock never uses (AGENTS.md section 12). */
export const BANNED_PHRASES = [/grew while you slept/i, /\bguaranteed\b/i, /risk-free/i, /protects you from loss/i, /provably random/i, /\bmultiplier\(\)/, /BEP-8056/i, /tradingHalt/, /feeRate/, /b402 paymaster/i];

export function assertPlainAndAllowed(text: string): string {
  const hit = BANNED_PHRASES.find((p) => p.test(text));
  if (hit) throw new Error(`text uses a phrase Bitstock does not say: ${hit}`);
  return text;
}

/**
 * Every number in `text` must appear in `allowed` (the source data). This is the checker that any
 * rephrased text must pass (AGENTS.md section 4, item 2).
 */
export function numbersOnlyFromSource(text: string, allowed: string[]): { ok: boolean; unexpected: string[] } {
  const norm = (n: string) => n.replace(/,/g, "").replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  const allowedSet = new Set(allowed.map(norm));
  const found = text.match(/\d[\d,]*(\.\d+)?/g) ?? [];
  const unexpected = found.filter((n) => !allowedSet.has(norm(n)));
  return { ok: unexpected.length === 0, unexpected };
}

export function explainMultiplierChange(v: DividendVerdict): string {
  if (v.verdict === "dividend" && v.changePercent) {
    return assertPlainAndAllowed(
      `Your token now represents ${v.changePercent}% more shares. That is your reinvested dividend (already net of withholding). It offsets the share price drop on the ex-dividend date.`,
    );
  }
  const head = v.changePercent ? `Your token now represents ${v.changePercent}% more shares. This is a multiplier change.` : "This is a multiplier change.";
  const known = v.known.length ? ` What is known: ${v.known.join(" ")}` : "";
  const unknown = v.unknown.length ? ` Not yet confirmed: ${v.unknown.join(" ")}` : "";
  return assertPlainAndAllowed(`${head}${known}${unknown}`);
}

export function explainHolding(raw: bigint, uiMultiplier: bigint, symbol: string, companyName: string): string {
  const shares = rawToUi(raw, uiMultiplier);
  return assertPlainAndAllowed(`You hold ${formatFixed(raw, 6)} ${symbol}. Each token stands for ${formatFixed(uiMultiplier, 6)} shares, so you hold ${formatFixed(shares, 6)} shares of ${companyName}.`);
}

/** The company note: a template over the RWA profile fields. Missing fields read "unavailable". */
export function companyNote(profile: unknown): string {
  const p = (profile ?? {}) as { underlyingTicker?: unknown; companyInfo?: { ceo?: unknown; website?: unknown; industry?: unknown; description?: unknown } };
  const f = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "unavailable");
  const c = p.companyInfo ?? {};
  return assertPlainAndAllowed(`Ticker: ${f(p.underlyingTicker)}. Industry: ${f(c.industry)}. Chief executive: ${f(c.ceo)}. Website: ${f(c.website)}. ${f(c.description)}`);
}
