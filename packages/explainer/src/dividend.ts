/**
 * Before the UI may call a multiplier rise a "dividend", the implied per-share amount must match the
 * issuer's announcement (AGENTS.md section 8). Every input that cannot be confirmed makes the verdict
 * "multiplier_change", with what is and is not known spelled out.
 */
import { changePercent, formatFixed, impliedNetPerShare, ONE, parseFixed } from "./multiplier.ts";

export interface DividendEvidence {
  /** Multiplier before the change, and where that value came from (a decoded log or a stored snapshot). */
  oldMultiplier: { value: bigint; source: string } | null;
  newMultiplier: { value: bigint; source: string };
  /** Announced gross dividend per share and its ex-date, from a source independent of the token issuer's pool. */
  announced: { amountPerShare: string; exDate: string; source: string } | null;
  /** Share price used for the reinvestment, if the issuer states it; otherwise a market price with its label. */
  reinvestPrice: { value: string; label: string } | null;
  /** Withholding rate as a fraction ("0.30"), only when the issuer has confirmed it. */
  confirmedWithholding: string | null;
  /** How close the implied net must be to the expected net to count as a match, in percent. */
  tolerancePercent: string;
}

export interface DividendVerdict {
  verdict: "dividend" | "multiplier_change";
  changePercent: string | null;
  impliedNetPerShare: string | null;
  expectedNetPerShare: string | null;
  gapPercent: string | null;
  known: string[];
  unknown: string[];
}

export function assessDividend(e: DividendEvidence): DividendVerdict {
  const known: string[] = [`The token now stands for ${formatFixed(e.newMultiplier.value, 18)} shares (${e.newMultiplier.source}).`];
  const unknown: string[] = [];
  if (e.oldMultiplier) known.push(`Before the change it stood for ${formatFixed(e.oldMultiplier.value, 18)} shares (${e.oldMultiplier.source}).`);
  else unknown.push("The multiplier before the change has not been read from the chain.");
  if (e.announced) known.push(`The company announced ${e.announced.amountPerShare} USD per share with ex-date ${e.announced.exDate} (${e.announced.source}).`);
  else unknown.push("No dividend announcement was found.");
  if (!e.reinvestPrice) unknown.push("The share price used for the reinvestment is not known.");
  if (!e.confirmedWithholding) unknown.push("The withholding rate the issuer applies has not been confirmed.");

  const pct = e.oldMultiplier ? changePercent(e.oldMultiplier.value, e.newMultiplier.value) : null;
  const implied = e.oldMultiplier && e.reinvestPrice ? impliedNetPerShare(e.oldMultiplier.value, e.newMultiplier.value, parseFixed(e.reinvestPrice.value)) : null;
  const expected = e.announced && e.confirmedWithholding ? (parseFixed(e.announced.amountPerShare) * (ONE - parseFixed(e.confirmedWithholding))) / ONE : null;
  let gap: bigint | null = null;
  if (implied !== null && expected !== null && expected > 0n) gap = ((implied - expected) * 100n * ONE) / expected;

  const matches = gap !== null && (gap < 0n ? -gap : gap) <= parseFixed(e.tolerancePercent);
  return {
    verdict: matches && unknown.length === 0 ? "dividend" : "multiplier_change",
    changePercent: pct === null ? null : formatFixed(pct, 4),
    impliedNetPerShare: implied === null ? null : formatFixed(implied, 6),
    expectedNetPerShare: expected === null ? null : formatFixed(expected, 6),
    gapPercent: gap === null ? null : formatFixed(gap, 2),
    known,
    unknown,
  };
}
