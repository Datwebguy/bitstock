/**
 * Fixed-point decimals as bigint with 18 fractional digits. No floating point touches a
 * price or an amount on the decision path (AGENTS.md section 4, item 6).
 */

export const SCALE = 18;
export const ONE = 10n ** 18n;

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Parse a plain decimal string ("230.53", "0.0006") into 18-digit fixed point. Digits past 18 are truncated toward zero. */
export function parseDecimal(text: string): bigint {
  const s = text.trim();
  if (!DECIMAL_RE.test(s)) throw new Error(`Not a plain decimal number: "${text}"`);
  const negative = s.startsWith("-");
  const [whole = "0", frac = ""] = (negative ? s.slice(1) : s).split(".");
  const value = BigInt(whole) * ONE + BigInt((frac + "0".repeat(SCALE)).slice(0, SCALE));
  return negative ? -value : value;
}

/** Parse, returning undefined instead of throwing (for optional inputs). */
export function tryParseDecimal(text: unknown): bigint | undefined {
  if (typeof text !== "string" && typeof text !== "number") return undefined;
  try {
    return parseDecimal(String(text));
  } catch {
    return undefined;
  }
}

/** Format 18-digit fixed point with `places` decimals, truncating. */
export function formatDecimal(value: bigint, places = 6): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / ONE;
  const frac = (abs % ONE).toString().padStart(SCALE, "0").slice(0, places);
  return `${negative ? "-" : ""}${whole}${places > 0 ? "." + frac : ""}`;
}

/** a * b in fixed point. */
export function mul(a: bigint, b: bigint): bigint {
  return (a * b) / ONE;
}

/** a / b in fixed point. Division by zero is an error, never infinity. */
export function div(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error("Division by zero");
  return (a * ONE) / b;
}

/** Token amount in smallest units (with `decimals`) to 18-digit fixed point. */
export function fromUnits(units: bigint, decimals: number): bigint {
  if (decimals === SCALE) return units;
  return decimals < SCALE ? units * 10n ** BigInt(SCALE - decimals) : units / 10n ** BigInt(decimals - SCALE);
}

/** Relative difference (a - b) / b in percent, as fixed point. */
export function percentDiff(a: bigint, b: bigint): bigint {
  return div((a - b) * 100n, b);
}

export function abs(v: bigint): bigint {
  return v < 0n ? -v : v;
}
