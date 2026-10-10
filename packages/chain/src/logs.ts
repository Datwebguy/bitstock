import { keccakHex } from "./keccak.ts";
import { rpcCall } from "./rpc.ts";

export const UI_MULTIPLIER_UPDATED_SIGNATURE = "UIMultiplierUpdated(uint256,uint256,uint256)";
export const UI_MULTIPLIER_UPDATED_TOPIC = keccakHex(UI_MULTIPLIER_UPDATED_SIGNATURE);

export interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

export interface MultiplierUpdate {
  oldMultiplier: bigint;
  newMultiplier: bigint;
  effectiveAt: bigint;
  blockNumber: bigint;
  transactionHash: string;
  logIndex: number;
}

/**
 * Decode an ERC-8056 UIMultiplierUpdated log. Which parameters are indexed has not been observed on
 * NVDAB yet, so both complete layouts are accepted (none indexed, all indexed); a mixed layout is
 * refused rather than guessed.
 */
export function decodeMultiplierUpdated(log: RawLog): MultiplierUpdate {
  if (log.topics[0]?.toLowerCase() !== UI_MULTIPLIER_UPDATED_TOPIC) throw new Error("not a UIMultiplierUpdated log");
  const words = (hex: string) => (hex.slice(2).match(/.{64}/g) ?? []).map((w) => BigInt("0x" + w));
  let values: bigint[];
  if (log.topics.length === 1) values = words(log.data);
  else if (log.topics.length === 4) values = log.topics.slice(1).map((t) => BigInt(t));
  else throw new Error(`unexpected layout: ${log.topics.length - 1} indexed parameters`);
  if (values.length < 3) throw new Error("log data too short");
  return {
    oldMultiplier: values[0]!,
    newMultiplier: values[1]!,
    effectiveAt: values[2]!,
    blockNumber: BigInt(log.blockNumber),
    transactionHash: log.transactionHash,
    logIndex: Number(BigInt(log.logIndex)),
  };
}

/** UIMultiplierUpdated logs for a token, fetched in chunks the RPC accepts. */
export async function getMultiplierUpdates(rpcUrl: string, token: string, fromBlock: bigint, toBlock: bigint, chunk = 5000n): Promise<MultiplierUpdate[]> {
  const out: MultiplierUpdate[] = [];
  for (let start = fromBlock; start <= toBlock; start += chunk) {
    const end = start + chunk - 1n < toBlock ? start + chunk - 1n : toBlock;
    const { result } = await rpcCall<RawLog[]>(rpcUrl, "eth_getLogs", [{ address: token, topics: [UI_MULTIPLIER_UPDATED_TOPIC], fromBlock: "0x" + start.toString(16), toBlock: "0x" + end.toString(16) }]);
    for (const log of result) out.push(decodeMultiplierUpdated(log));
  }
  return out;
}
