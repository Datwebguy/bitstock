import { selector } from "./keccak.ts";
import { ethCall } from "./rpc.ts";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(value: string): boolean {
  return ADDRESS_RE.test(value);
}

/** One 32-byte ABI word for an address (left-padded, lower case, no 0x). */
export function encodeAddress(address: string): string {
  if (!isAddress(address)) throw new Error(`Not an address: ${address}`);
  return address.slice(2).toLowerCase().padStart(64, "0");
}

/** One 32-byte ABI word for a non-negative integer. */
export function encodeUint(value: bigint): string {
  if (value < 0n || value >= 1n << 256n) throw new Error("uint256 out of range");
  return value.toString(16).padStart(64, "0");
}

/** First 32-byte word of a result as an unsigned integer. Empty results are an error, never zero. */
export function decodeUint(hex: string): bigint {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (body.length < 64) throw new Error(`Result too short for uint256: ${hex}`);
  return BigInt("0x" + body.slice(0, 64));
}

export async function erc20Allowance(rpcUrl: string, token: string, owner: string, spender: string): Promise<{ value: bigint; latencyMs: number }> {
  const r = await ethCall(rpcUrl, token, selector("allowance(address,address)") + encodeAddress(owner) + encodeAddress(spender));
  return { value: decodeUint(r.result), latencyMs: r.latencyMs };
}

export async function erc20BalanceOf(rpcUrl: string, token: string, owner: string): Promise<{ value: bigint; latencyMs: number }> {
  const r = await ethCall(rpcUrl, token, selector("balanceOf(address)") + encodeAddress(owner));
  return { value: decodeUint(r.result), latencyMs: r.latencyMs };
}

/** ERC-8056 state: current multiplier, pending multiplier and when it takes effect (unix seconds, 0 when none). */
export async function readMultiplierState(rpcUrl: string, token: string): Promise<{ uiMultiplier: bigint; newUIMultiplier: bigint; effectiveAt: bigint }> {
  const [a, b, c] = await Promise.all([
    ethCall(rpcUrl, token, selector("uiMultiplier()")),
    ethCall(rpcUrl, token, selector("newUIMultiplier()")),
    ethCall(rpcUrl, token, selector("effectiveAt()")),
  ]);
  return { uiMultiplier: decodeUint(a.result), newUIMultiplier: decodeUint(b.result), effectiveAt: decodeUint(c.result) };
}
