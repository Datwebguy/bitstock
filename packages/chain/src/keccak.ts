/**
 * Keccak-256 (the original Keccak padding used by Ethereum, not NIST SHA3-256).
 * Small and dependency-free; tested against published vectors. Used for function
 * selectors and event topics, never for secrets. Verified only on inputs shorter than one
 * 136-byte block; do not rely on it for longer inputs until a multi-block vector is added.
 */

const MASK = (1n << 64n) - 1n;
const RATE_BYTES = 136;

const ROUND_CONSTANTS: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

const ROTATIONS: number[] = [
  1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44,
];
const PI_LANES: number[] = [
  10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1,
];

const rotl = (x: bigint, n: number): bigint => ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK;

function permute(s: bigint[]): void {
  const c: bigint[] = new Array<bigint>(5).fill(0n);
  for (let round = 0; round < 24; round++) {
    for (let x = 0; x < 5; x++) c[x] = s[x]! ^ s[x + 5]! ^ s[x + 10]! ^ s[x + 15]! ^ s[x + 20]!;
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5]! ^ rotl(c[(x + 1) % 5]!, 1);
      for (let y = 0; y < 25; y += 5) s[y + x] = s[y + x]! ^ d;
    }
    let current = s[1]!;
    for (let i = 0; i < 24; i++) {
      const lane = PI_LANES[i]!;
      const next = s[lane]!;
      s[lane] = rotl(current, ROTATIONS[i]!);
      current = next;
    }
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) c[x] = s[y + x]!;
      for (let x = 0; x < 5; x++) s[y + x] = c[x]! ^ (~c[(x + 1) % 5]! & MASK & c[(x + 2) % 5]!);
    }
    s[0] = s[0]! ^ ROUND_CONSTANTS[round]!;
  }
}

export function keccak256(input: Uint8Array): Uint8Array {
  const padded = new Uint8Array(Math.ceil((input.length + 1) / RATE_BYTES) * RATE_BYTES);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] = padded[padded.length - 1]! | 0x80;

  const state: bigint[] = new Array<bigint>(25).fill(0n);
  const view = new DataView(padded.buffer);
  for (let offset = 0; offset < padded.length; offset += RATE_BYTES) {
    for (let lane = 0; lane < RATE_BYTES / 8; lane++) state[lane] = state[lane]! ^ view.getBigUint64(offset + lane * 8, true);
    permute(state);
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let lane = 0; lane < 4; lane++) outView.setBigUint64(lane * 8, state[lane]!, true);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** keccak256 of a UTF-8 string, as 0x-hex. */
export function keccakHex(text: string): string {
  return toHex(keccak256(new TextEncoder().encode(text)));
}

/** First four bytes of keccak256 of the canonical signature, e.g. "uiMultiplier()". */
export function selector(signature: string): string {
  return keccakHex(signature).slice(0, 10);
}
