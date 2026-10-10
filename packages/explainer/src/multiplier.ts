/**
 * ERC-8056 multiplier math (docs/VERIFIED.md section 4). Each raw token stands for `uiMultiplier`
 * shares (18 decimals). Fixed point with 18 decimals throughout; no floating point.
 */
import { MULTIPLIER_ONE } from "@bitstock/chain";

export const ONE = MULTIPLIER_ONE;

/** Percent more shares per token after a change: (new / old - 1) × 100, as 18-decimal fixed point. */
export function changePercent(oldMultiplier: bigint, newMultiplier: bigint): bigint {
  if (oldMultiplier <= 0n || newMultiplier <= 0n) throw new Error("multipliers must be positive");
  return ((newMultiplier - oldMultiplier) * 100n * ONE) / oldMultiplier;
}

/**
 * The reinvested amount per share that a multiplier rise implies, at the share price used for the
 * reinvestment: (new / old - 1) × price. This is net of any withholding, because the multiplier
 * already reflects the net amount. Never subtract withholding from it again.
 */
export function impliedNetPerShare(oldMultiplier: bigint, newMultiplier: bigint, sharePrice: bigint): bigint {
  if (oldMultiplier <= 0n || sharePrice <= 0n) throw new Error("multiplier and price must be positive");
  return ((newMultiplier - oldMultiplier) * sharePrice) / oldMultiplier;
}

export function formatFixed(v: bigint, places: number): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const frac = (a % ONE).toString().padStart(18, "0").slice(0, places);
  return `${neg ? "-" : ""}${a / ONE}${places ? "." + frac : ""}`;
}

export function parseFixed(text: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`not a plain decimal: ${text}`);
  const [w = "0", f = ""] = text.split(".");
  return BigInt(w) * ONE + BigInt((f + "0".repeat(18)).slice(0, 18));
}
