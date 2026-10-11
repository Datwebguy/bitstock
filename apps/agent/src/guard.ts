import { join } from "node:path";
import { BinanceApi, BinanceClient } from "@bitstock/binance";
import { FallbackReferenceSource, guardConfigFromEnv, JsonlDecisionStore, PythProSource, runGuard, YahooChartSource, type DecisionRecord, type ReferencePriceSource } from "@bitstock/guard";
import { USDT } from "./probes.ts";

/** Pyth Pro first when its key is configured, then Yahoo as a labelled fallback. */
export function referenceSource(env: NodeJS.ProcessEnv): ReferencePriceSource {
  const key = env["PYTH_API_KEY"];
  return key ? new FallbackReferenceSource([new PythProSource({ apiKey: key }), new YahooChartSource()]) : new YahooChartSource();
}

/** Runs the guard once against live data and stores the decision record. */
export async function runLiveGuard(env: NodeJS.ProcessEnv, token: string, amountUsd: string, wallet: string): Promise<DecisionRecord> {
  const cfg = guardConfigFromEnv(env);
  const baseUrl = env["BINANCE_WEB3_BASE_URL"];
  const api = new BinanceApi(new BinanceClient({ apiKey: env["BINANCE_WEB3_API_KEY"] ?? "", apiSecret: env["BINANCE_WEB3_API_SECRET"] ?? "", ...(baseUrl ? { baseUrl } : {}) }));
  const record = await runGuard(
    { api, rpcUrl: env["BSC_RPC_URL"] ?? "", reference: referenceSource(env), payToken: USDT, payDecimals: 18 },
    { token, side: "buy", amountUsd, wallet },
    cfg,
  );
  await new JsonlDecisionStore(join(env["DATA_DIR"] || "./data", "decisions.jsonl")).save(record);
  return record;
}
