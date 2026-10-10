import { join } from "node:path";
import { BinanceApi, BinanceClient } from "@bitstock/binance";
import { guardConfigFromEnv, type GuardConfig, type ReferencePriceSource } from "@bitstock/guard";
import { referenceSource } from "./guard.ts";
import { SqliteRepository, type Repository } from "./store.ts";

/** Everything a request handler needs, built once at start. Invalid config stops the process. */
export interface AgentContext {
  env: NodeJS.ProcessEnv;
  repo: Repository;
  api: BinanceApi;
  rpcUrl: string;
  /** RPC for transaction and receipt lookups; some public nodes refuse these (docs/VERIFIED.md). */
  txRpcUrl: string;
  reference: ReferencePriceSource;
  cfg: GuardConfig;
  caps: { maxBuyUsd: string };
  /** API errors by code, for the health endpoint. */
  apiErrors: Map<string, number>;
}

export function buildContext(env: NodeJS.ProcessEnv): AgentContext {
  const cfg = guardConfigFromEnv(env);
  const maxBuyUsd = env["BUY_MAX_USD"] || "5";
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(maxBuyUsd) || Number(maxBuyUsd) <= 0) throw new Error("BUY_MAX_USD must be a dollar amount above zero");
  const apiErrors = new Map<string, number>();
  const baseUrl = env["BINANCE_WEB3_BASE_URL"];
  const client = new BinanceClient({
    apiKey: env["BINANCE_WEB3_API_KEY"] ?? "",
    apiSecret: env["BINANCE_WEB3_API_SECRET"] ?? "",
    ...(baseUrl ? { baseUrl } : {}),
    onRaw: (r) => {
      const code = typeof r.json === "object" && r.json !== null ? String((r.json as { code?: unknown }).code ?? "") : "";
      if (r.httpStatus !== 200 || (code !== "0" && code !== "")) apiErrors.set(`${r.httpStatus}:${code}`, (apiErrors.get(`${r.httpStatus}:${code}`) ?? 0) + 1);
    },
  });
  return {
    env,
    repo: new SqliteRepository(join(env["DATA_DIR"] || "./data", "bitstock.sqlite")),
    api: new BinanceApi(client),
    rpcUrl: env["BSC_RPC_URL"] ?? "",
    txRpcUrl: env["BSC_TX_RPC_URL"] || env["BSC_RPC_URL"] || "",
    reference: referenceSource(env),
    cfg,
    caps: { maxBuyUsd },
    apiErrors,
  };
}
