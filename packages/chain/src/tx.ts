/**
 * Legacy (EIP-155) transaction signing. Signing uses @noble/curves (audited); this file only
 * serialises. Verified against the EIP-155 specification's test vector in test/tx.test.ts.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { isAddress } from "./abi.ts";
import { bigintToBytes, bytesToHex, hexToBytes } from "./hex.ts";
import { keccak256 } from "./keccak.ts";
import { rlpEncode } from "./rlp.ts";

export interface LegacyTx {
  nonce: bigint;
  gasPrice: bigint;
  gasLimit: bigint;
  to: string;
  value: bigint;
  data: string;
  chainId: bigint;
}

export interface SignedTx {
  raw: string;
  hash: string;
  from: string;
}

function fields(tx: LegacyTx) {
  if (!isAddress(tx.to)) throw new Error("invalid to address");
  return [bigintToBytes(tx.nonce), bigintToBytes(tx.gasPrice), bigintToBytes(tx.gasLimit), hexToBytes(tx.to), bigintToBytes(tx.value), hexToBytes(tx.data)];
}

/** The 32-byte hash that is signed: keccak256(rlp([nonce, gasPrice, gas, to, value, data, chainId, 0, 0])). */
export function signingHash(tx: LegacyTx): Uint8Array {
  return keccak256(rlpEncode([...fields(tx), bigintToBytes(tx.chainId), new Uint8Array(0), new Uint8Array(0)]));
}

export function addressFromPrivateKey(privateKey: string): string {
  const pub = secp256k1.getPublicKey(hexToBytes(privateKey), false); // 65 bytes, 0x04 prefix
  return toChecksumAddress(bytesToHex(keccak256(pub.subarray(1)).subarray(12)));
}

/** EIP-55 mixed-case checksum. */
export function toChecksumAddress(address: string): string {
  if (!isAddress(address)) throw new Error("invalid address");
  const lower = address.slice(2).toLowerCase();
  const hash = bytesToHex(keccak256(new TextEncoder().encode(lower))).slice(2);
  return "0x" + [...lower].map((c, i) => (parseInt(hash[i]!, 16) >= 8 ? c.toUpperCase() : c)).join("");
}

export function signLegacyTx(tx: LegacyTx, privateKey: string): SignedTx {
  const sig = secp256k1.sign(signingHash(tx), hexToBytes(privateKey), { prehash: false, lowS: true, format: "recovered" });
  const recovery = BigInt(sig[0]!);
  const r = BigInt(bytesToHex(sig.subarray(1, 33)));
  const s = BigInt(bytesToHex(sig.subarray(33, 65)));
  const v = recovery + tx.chainId * 2n + 35n;
  const raw = rlpEncode([...fields(tx), bigintToBytes(v), bigintToBytes(r), bigintToBytes(s)]);
  return { raw: bytesToHex(raw), hash: bytesToHex(keccak256(raw)), from: addressFromPrivateKey(privateKey) };
}
