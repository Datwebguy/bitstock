/**
 * The front door's gift (AGENTS.md section 9): box sizes from the amount actually received, a draw
 * committed in advance and revealed after, and the order in which claims take boxes. Pure functions;
 * sending lives in gift-service.ts.
 */
import { createHash, randomBytes, randomInt } from "node:crypto";

/** Box weights in percent. They sum to 100 (unit-tested). */
export const BOX_WEIGHTS = [20, 15, 15, 10, 10, 10, 5, 5, 5, 5] as const;

/** Box amounts in smallest units from what the vault actually received, each rounded down to 8 decimals. */
export function boxAmounts(received: bigint, decimals = 18): bigint[] {
  if (received <= 0n) throw new Error("nothing was received to divide into boxes");
  const step = decimals > 8 ? 10n ** BigInt(decimals - 8) : 1n;
  const boxes = BOX_WEIGHTS.map((w) => (((received * BigInt(w)) / 100n) / step) * step);
  if (boxes.some((b) => b <= 0n)) throw new Error("the amount received is too small for ten boxes");
  return boxes;
}

/** Fisher-Yates shuffle with the OS cryptographic random source. */
export function shuffle<T>(items: readonly T[], rand: (max: number) => number = randomInt): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** The assignment as committed: the order claims take boxes, as decimal strings of smallest units. */
export function assignmentText(order: bigint[]): string {
  return JSON.stringify(order.map((b) => b.toString()));
}

/** sha256(assignment || secret), hex. Published before the gift opens; the secret is revealed after. */
export function commitment(assignment: string, secretHex: string): string {
  if (!/^[0-9a-f]{64}$/.test(secretHex)) throw new Error("the secret must be 32 bytes of hex");
  return createHash("sha256").update(assignment + secretHex, "utf8").digest("hex");
}

export function newSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Anyone can check a reveal: the published commitment must equal sha256(assignment || secret). */
export function verifyReveal(published: string, assignment: string, secretHex: string): boolean {
  return commitment(assignment, secretHex) === published.toLowerCase();
}
