/**
 * ERC-20 transfer: build, dry-run with eth_call from the sender (the issuer's compliance hook can
 * refuse an address), sign and send, wait for the receipt. Caps and the kill switch are enforced by
 * the caller (apps/agent); this module never sends without a successful dry run.
 */
import { encodeAddress, encodeUint, isAddress } from "./abi.ts";
import { selector } from "./keccak.ts";
import { ethCall, RpcError, rpcCall } from "./rpc.ts";
import { signLegacyTx, type SignedTx } from "./tx.ts";

export const BSC_CHAIN_ID = 56n;

export function transferCalldata(to: string, amount: bigint): string {
  if (!isAddress(to)) throw new Error("invalid recipient");
  if (amount <= 0n) throw new Error("amount must be positive");
  return selector("transfer(address,uint256)") + encodeAddress(to) + encodeUint(amount);
}

/** Decode a Solidity Error(string) revert payload, if that is what it is. */
export function decodeRevertReason(data: unknown): string | undefined {
  if (typeof data !== "string" || !data.startsWith("0x08c379a0") || data.length < 138) return undefined;
  const body = data.slice(10);
  const len = Number(BigInt("0x" + body.slice(64, 128)));
  const hex = body.slice(128, 128 + len * 2);
  return Buffer.from(hex, "hex").toString("utf8");
}

export interface TransferSimulation {
  ok: boolean;
  reason: string;
}

/** Dry run of transfer(to, amount) from `from` at the latest block. */
export async function simulateTransfer(rpcUrl: string, token: string, from: string, to: string, amount: bigint): Promise<TransferSimulation> {
  try {
    const { result } = await ethCall(rpcUrl, token, transferCalldata(to, amount), from);
    // ERC-20 returns true; some tokens return nothing. Anything else is a refusal.
    if (result === "0x" || BigInt(result) === 1n) return { ok: true, reason: "The transfer would succeed." };
    return { ok: false, reason: "The token returned false for this transfer." };
  } catch (e) {
    if (e instanceof RpcError) {
      const why = decodeRevertReason(e.data) ?? e.message;
      return { ok: false, reason: `The transfer would be refused: ${why}` };
    }
    throw e;
  }
}

export interface Receipt {
  status: "success" | "reverted";
  blockNumber: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  transactionHash: string;
}

export async function getReceipt(rpcUrl: string, txHash: string): Promise<Receipt | null> {
  const { result } = await rpcCall<Record<string, string> | null>(rpcUrl, "eth_getTransactionReceipt", [txHash]);
  if (!result) return null;
  return {
    status: result["status"] === "0x1" ? "success" : "reverted",
    blockNumber: BigInt(result["blockNumber"] ?? "0x0"),
    gasUsed: BigInt(result["gasUsed"] ?? "0x0"),
    effectiveGasPrice: BigInt(result["effectiveGasPrice"] ?? "0x0"),
    transactionHash: txHash,
  };
}

export async function waitForReceipt(rpcUrl: string, txHash: string, timeoutMs = 60_000, pollMs = 1500): Promise<Receipt> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = await getReceipt(rpcUrl, txHash);
    if (r) return r;
    if (Date.now() > deadline) throw new Error(`no receipt for ${txHash} after ${timeoutMs} ms`);
    await new Promise((res) => setTimeout(res, pollMs));
  }
}

export interface PreparedTransfer {
  signed: SignedTx;
  gasLimit: bigint;
  gasPrice: bigint;
  nonce: bigint;
}

/** Dry-run, then sign. Throws with the plain reason if the dry run refuses. Does not broadcast. */
export async function prepareTransfer(rpcUrl: string, privateKey: string, from: string, token: string, to: string, amount: bigint, nonce?: bigint): Promise<PreparedTransfer> {
  const sim = await simulateTransfer(rpcUrl, token, from, to, amount);
  if (!sim.ok) throw new Error(sim.reason);
  const data = transferCalldata(to, amount);
  const [gas, price, count] = await Promise.all([
    rpcCall<string>(rpcUrl, "eth_estimateGas", [{ from, to: token, data }]),
    rpcCall<string>(rpcUrl, "eth_gasPrice", []),
    nonce === undefined ? rpcCall<string>(rpcUrl, "eth_getTransactionCount", [from, "pending"]) : Promise.resolve({ result: "0x" + nonce.toString(16), latencyMs: 0 }),
  ]);
  const gasLimit = (BigInt(gas.result) * 12n) / 10n; // 20% headroom over the estimate
  const tx = { nonce: BigInt(count.result), gasPrice: BigInt(price.result), gasLimit, to: token, value: 0n, data, chainId: BSC_CHAIN_ID };
  const signed = signLegacyTx(tx, privateKey);
  if (signed.from.toLowerCase() !== from.toLowerCase()) throw new Error("the key does not belong to the sending address");
  return { signed, gasLimit, gasPrice: tx.gasPrice, nonce: tx.nonce };
}

export async function sendRawTransaction(rpcUrl: string, raw: string): Promise<string> {
  const { result } = await rpcCall<string>(rpcUrl, "eth_sendRawTransaction", [raw]);
  return result;
}
