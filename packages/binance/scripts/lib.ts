import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BinanceApi } from "../src/api.ts";
import { BinanceClient, type RawResponse } from "../src/client.ts";

process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));

export const EVIDENCE_DIR = resolve(import.meta.dirname, "../../../docs/evidence");
mkdirSync(EVIDENCE_DIR, { recursive: true });

export const NVDAB = "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436";

let label = "unlabelled";
let seq = 0;
/** Name the evidence file for the next call(s). */
export function setLabel(name: string): void {
  label = name;
  seq = 0;
}

function save(raw: RawResponse): void {
  const file = resolve(EVIDENCE_DIR, `${label}${seq++ === 0 ? "" : `.${seq}`}.json`);
  const doc = {
    savedAt: new Date().toISOString(),
    request: { method: raw.method, path: raw.path, query: raw.query, body: raw.body ? JSON.parse(raw.body) : undefined },
    httpStatus: raw.httpStatus,
    response: raw.json,
  };
  writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
}

export function makeApi(): BinanceApi {
  const apiKey = process.env["BINANCE_WEB3_API_KEY"] ?? "";
  const apiSecret = process.env["BINANCE_WEB3_API_SECRET"] ?? "";
  const baseUrl = process.env["BINANCE_WEB3_BASE_URL"] || undefined;
  const client = new BinanceClient({
    apiKey,
    apiSecret,
    ...(baseUrl ? { baseUrl } : {}),
    callLogPath: resolve(EVIDENCE_DIR, "calls.jsonl"),
    onRaw: save,
    cacheTtlMs: 0,
  });
  return new BinanceApi(client);
}

export const show = (v: unknown): void => console.log(JSON.stringify(v, null, 2));
