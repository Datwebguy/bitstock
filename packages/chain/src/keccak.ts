/**
 * Keccak-256 (Ethereum's padding, not NIST SHA3-256), from the audited @noble/hashes library.
 * Used for selectors, event topics, addresses and transaction hashes.
 */
import { keccak_256 } from "@noble/hashes/sha3.js";

export function keccak256(input: Uint8Array): Uint8Array {
  return keccak_256(input);
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
