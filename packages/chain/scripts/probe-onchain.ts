import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethCall, rpcCall, selector } from "../src/index.ts";

process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
const url = process.env["BSC_RPC_URL"] ?? "";
if (!url) throw new Error("BSC_RPC_URL is not set");
const NVDAB = "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436";
const ONE_E18 = (10n ** 18n).toString(16).padStart(64, "0");

const calls: Array<[string, string]> = [
  ["symbol()", selector("symbol()")],
  ["name()", selector("name()")],
  ["decimals()", selector("decimals()")],
  ["totalSupply()", selector("totalSupply()")],
  ["uiMultiplier()", selector("uiMultiplier()")],
  ["newUIMultiplier()", selector("newUIMultiplier()")],
  ["effectiveAt()", selector("effectiveAt()")],
  ["toUIAmount(uint256) with 1e18", selector("toUIAmount(uint256)") + ONE_E18],
  ["multiplier()  (expected to revert)", selector("multiplier()")],
];

const decodeString = (hex: string): string => {
  const b = Buffer.from(hex.slice(2), "hex");
  const len = Number(BigInt("0x" + b.subarray(32, 64).toString("hex")));
  return b.subarray(64, 64 + len).toString("utf8");
};

const out: Record<string, unknown> = { savedAt: new Date().toISOString(), rpcHost: new URL(url).host, contract: NVDAB, calls: [] };
const block = await rpcCall<string>(url, "eth_blockNumber", []);
const chain = await rpcCall<string>(url, "eth_chainId", []);
const head = await rpcCall<{ timestamp: string }>(url, "eth_getBlockByNumber", ["latest", false]);
out["chainId"] = parseInt(chain.result, 16);
out["blockNumber"] = parseInt(block.result, 16);
out["blockTimestamp"] = new Date(parseInt(head.result.timestamp, 16) * 1000).toISOString();
console.log(`chain ${out["chainId"]}  block ${out["blockNumber"]}  at ${out["blockTimestamp"]}`);

for (const [label, data] of calls) {
  const entry: Record<string, unknown> = { call: label, selector: data.slice(0, 10) };
  try {
    const r = await ethCall(url, NVDAB, data);
    entry["raw"] = r.result;
    entry["latencyMs"] = r.latencyMs;
    if (label.startsWith("symbol") || label.startsWith("name")) entry["decoded"] = decodeString(r.result);
    else if (r.result !== "0x") entry["decoded"] = BigInt(r.result).toString();
  } catch (e) {
    entry["error"] = e instanceof Error ? e.message : String(e);
  }
  (out["calls"] as unknown[]).push(entry);
  console.log(JSON.stringify(entry));
}

const mult = BigInt(String((out["calls"] as Array<Record<string, unknown>>).find((c) => c["call"] === "uiMultiplier()")?.["decoded"] ?? "0"));
if (mult > 0n) console.log(`uiMultiplier as decimal: ${mult / 10n ** 18n}.${(mult % 10n ** 18n).toString().padStart(18, "0")}`);

mkdirSync(resolve(import.meta.dirname, "../../../docs/evidence"), { recursive: true });
writeFileSync(resolve(import.meta.dirname, "../../../docs/evidence/07-onchain-nvdab.json"), JSON.stringify(out, null, 2) + "\n");
