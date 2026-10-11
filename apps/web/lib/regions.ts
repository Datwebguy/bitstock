/**
 * Jurisdictions where claims are refused (AGENTS.md section 0.5; docs/VERIFIED.md section 2).
 * Country codes are ISO 3166-1 alpha-2; Ukrainian regions are ISO 3166-2 subdivision codes.
 */
export const BLOCKED_COUNTRIES = new Set([
  "US", "GU", "MP", "PR", "VI", "AS", "UM", // United States and its territories
  "CA", "NL", "GB", "JP", "IR", "CU", "KP",
]);
export const BLOCKED_UA_REGIONS = new Set(["43", "40", "14", "09"]); // Crimea, Sevastopol, Donetsk, Luhansk

export type RegionVerdict = { blocked: true; reason: string } | { blocked: false; known: boolean };

export function regionVerdict(country: string | null | undefined, region: string | null | undefined): RegionVerdict {
  const c = (country ?? "").trim().toUpperCase();
  if (!c) return { blocked: false, known: false };
  if (BLOCKED_COUNTRIES.has(c)) return { blocked: true, reason: `country ${c}` };
  const r = (region ?? "").trim().toUpperCase().replace(/^UA-/, "");
  if (c === "UA" && BLOCKED_UA_REGIONS.has(r)) return { blocked: true, reason: `region UA-${r}` };
  return { blocked: false, known: true };
}

/** The same places in words, for the first-visit confirmation and the terms. */
export const RESTRICTED_PLACES = [
  "the United States and its territories",
  "Canada",
  "the Netherlands",
  "the United Kingdom",
  "Japan",
  "Iran",
  "Cuba",
  "North Korea",
  "Crimea and Sevastopol",
  "Donetsk",
  "Luhansk",
] as const;

/** The restricted places as one sentence fragment: "A, B or C". */
export function restrictedList(): string {
  const p = RESTRICTED_PLACES;
  return `${p.slice(0, -1).join(", ")} or ${p[p.length - 1]}`;
}
