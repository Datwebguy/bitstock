/**
 * The one conversion module for money (AGENTS.md section 4, item 6). Amounts are bigint smallest units;
 * decimal strings exist only at the edges (user input, display). No floating point anywhere.
 */

const DECIMAL_RE = /^\d+(\.\d+)?$/;
export const MULTIPLIER_ONE = 10n ** 18n;

/** "1.5" with 18 decimals → 1500000000000000000n. Refuses more fractional digits than the token has. */
export function toUnits(amount: string, decimals: number): bigint {
  assertDecimals(decimals);
  const s = amount.trim();
  if (!DECIMAL_RE.test(s)) throw new Error(`Not a non-negative decimal amount: "${amount}"`);
  const [whole = "0", frac = ""] = s.split(".");
  if (frac.length > decimals) throw new Error(`"${amount}" has more than ${decimals} decimal places`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

/** 1500000000000000000n with 18 decimals → "1.5". Exact; trailing zeros removed. */
export function fromUnits(units: bigint, decimals: number): string {
  assertDecimals(decimals);
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = (abs / base).toString();
  const frac = decimals === 0 ? "" : (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

/** Round down to `places` decimals (in smallest units). Used for box sizes (AGENTS.md section 9). */
export function floorToPlaces(units: bigint, decimals: number, places: number): bigint {
  assertDecimals(decimals);
  if (places >= decimals) return units;
  const step = 10n ** BigInt(decimals - places);
  return (units / step) * step;
}

/** ERC-8056: raw balance → shares (UI amount), with the multiplier at 18 decimals. Rounds down. */
export function rawToUi(raw: bigint, uiMultiplier: bigint): bigint {
  if (uiMultiplier <= 0n) throw new Error("multiplier must be positive");
  return (raw * uiMultiplier) / MULTIPLIER_ONE;
}

/** ERC-8056: shares (UI amount) → raw balance. Rounds down, so it never claims more raw tokens than exist. */
export function uiToRaw(ui: bigint, uiMultiplier: bigint): bigint {
  if (uiMultiplier <= 0n) throw new Error("multiplier must be positive");
  return (ui * MULTIPLIER_ONE) / uiMultiplier;
}

/** Re-express an amount with `from` decimals in `to` decimals, rounding down. */
export function rescale(units: bigint, from: number, to: number): bigint {
  assertDecimals(from);
  assertDecimals(to);
  return to >= from ? units * 10n ** BigInt(to - from) : units / 10n ** BigInt(from - to);
}

function assertDecimals(d: number): void {
  if (!Number.isInteger(d) || d < 0 || d > 36) throw new Error(`invalid decimals: ${d}`);
}
