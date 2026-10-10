import { rpcCall } from "@bitstock/chain";
import type { AgentContext } from "./context.ts";
import { killState } from "./killswitch.ts";
import { NVDAB } from "./probes.ts";

interface DepStatus {
  ok: boolean;
  latencyMs: number | null;
  detail?: string;
}

let cache: { at: number; deps: Record<string, DepStatus> } | null = null;

async function timed(fn: () => Promise<unknown>): Promise<DepStatus> {
  const t = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - t };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t, detail: e instanceof Error ? e.message.slice(0, 160) : String(e) };
  }
}

/** Dependency status, refreshed at most every 30 seconds so health checks do not spend API quota. */
export async function dependencyStatus(ctx: AgentContext): Promise<Record<string, DepStatus>> {
  if (cache && Date.now() - cache.at < 30_000) return cache.deps;
  const [binance, rpc, reference] = await Promise.all([
    timed(() => ctx.api.rwaPrice([NVDAB])),
    timed(() => rpcCall(ctx.rpcUrl, "eth_blockNumber", [])),
    timed(() => ctx.reference.read("NVDA")),
  ]);
  const storage = await timed(async () => ctx.repo.countsByOutcome());
  cache = { at: Date.now(), deps: { binance, rpc, reference, storage } };
  return cache.deps;
}

export async function health(ctx: AgentContext): Promise<Record<string, unknown>> {
  const deps = await dependencyStatus(ctx);
  return {
    dependencies: deps,
    killSwitch: killState(ctx.env, ctx.repo),
    decisionsByOutcome: ctx.repo.countsByOutcome(),
    apiErrorsByCode: Object.fromEntries(ctx.apiErrors),
    caps: { maxBuyUsd: ctx.caps.maxBuyUsd },
    rulesVersion: ctx.cfg.rulesVersion,
  };
}
