/**
 * The Mode A decision service: validate, run the guard on live data, prepare a signed-by-user
 * transaction on GO or LIMIT, queue an intent on WAIT, store everything.
 */
import { randomUUID } from "node:crypto";
import { isAddress } from "@bitstock/chain";
import { buildRecord, runGuardWithContext, type DecisionRecord } from "@bitstock/guard";
import type { AgentContext } from "./context.ts";
import { killState } from "./killswitch.ts";
import { PrepareError, prepareTransaction } from "./prepare.ts";
import { USDT } from "./probes.ts";

export class InputError extends Error {}

export interface DecisionRequest {
  token: string;
  amountUsd: string;
  wallet: string;
}

export function validateRequest(body: unknown, maxBuyUsd: string): DecisionRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  const token = typeof b["token"] === "string" ? b["token"] : "";
  const amountUsd = typeof b["amountUsd"] === "string" ? b["amountUsd"] : "";
  const wallet = typeof b["wallet"] === "string" ? b["wallet"] : "";
  if (!isAddress(token)) throw new InputError("Choose a stock to buy.");
  if (!isAddress(wallet)) throw new InputError("The wallet address is not valid.");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(amountUsd) || Number(amountUsd) <= 0) throw new InputError("The amount must be a dollar amount such as 1 or 2.50.");
  if (Number(amountUsd) > Number(maxBuyUsd)) throw new InputError(`The most Bitstock will buy at once is $${maxBuyUsd}.`);
  return { token, amountUsd, wallet };
}

export async function makeDecision(ctx: AgentContext, req: DecisionRequest, idemKey: string | null): Promise<DecisionRecord> {
  if (idemKey) {
    const existing = ctx.repo.decisionByIdemKey(idemKey);
    if (existing) return existing.record;
  }
  const guardReq = { token: req.token, side: "buy" as const, amountUsd: req.amountUsd, wallet: req.wallet };
  const kill = killState(ctx.env, ctx.repo);
  let record: DecisionRecord;
  if (kill.on) {
    const now = new Date();
    record = buildRecord(guardReq, [{ name: "kill switch", value: kill.reason, source: kill.source ?? "", asOf: now.toISOString(), status: "ok" }], [], { outcome: "BLOCK", reason: "Bitstock is paused by its operator, so nothing can be prepared right now.", limits: null, recheckAt: null }, ctx.cfg, now);
  } else {
    const run = await runGuardWithContext({ api: ctx.api, rpcUrl: ctx.rpcUrl, reference: ctx.reference, payToken: USDT, payDecimals: 18 }, guardReq, ctx.cfg);
    record = run.record;
    if (record.outcome === "GO" || record.outcome === "LIMIT") {
      try {
        record.prepared = await prepareTransaction(ctx.api, ctx.rpcUrl, run, USDT);
      } catch (e) {
        record.prepared = null;
        record.outcome = "BLOCK";
        record.reason = e instanceof PrepareError ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : "The final trade could not be prepared. Check again in a moment.";
        record.inputs.push({ name: "prepare error", value: e instanceof Error ? e.message.slice(0, 300) : String(e), source: "agent", asOf: new Date().toISOString(), status: "unavailable" });
      }
    }
  }
  ctx.repo.saveDecision(record, idemKey);
  if (record.outcome === "WAIT") {
    ctx.repo.createIntent({ id: randomUUID(), createdAt: record.at, request: record.request, reason: record.reason, recheckAt: record.recheckAt ?? new Date(Date.now() + ctx.cfg.waitRecheckMinutes * 60_000).toISOString(), status: "waiting", lastDecisionId: record.id, attempts: 0 });
  }
  return record;
}

/** Re-run the full guard for every due intent. A pass is never reused: each run reads everything again. */
export async function processDueIntents(ctx: AgentContext, log: (o: Record<string, unknown>) => void): Promise<void> {
  if (killState(ctx.env, ctx.repo).on) return;
  for (const intent of ctx.repo.dueIntents(new Date().toISOString())) {
    try {
      const run = await runGuardWithContext({ api: ctx.api, rpcUrl: ctx.rpcUrl, reference: ctx.reference, payToken: USDT, payDecimals: 18 }, intent.request, ctx.cfg);
      ctx.repo.saveDecision(run.record, null);
      const r = run.record;
      const status = r.outcome === "WAIT" ? "waiting" : r.outcome === "BLOCK" ? "blocked" : "ready";
      const next = r.recheckAt ?? new Date(Date.now() + ctx.cfg.waitRecheckMinutes * 60_000).toISOString();
      ctx.repo.updateIntent(intent.id, { status, recheckAt: next, reason: r.reason, lastDecisionId: r.id });
      log({ level: "info", msg: "intent re-checked", intent: intent.id, outcome: r.outcome });
    } catch (e) {
      log({ level: "warn", msg: "intent re-check failed", intent: intent.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

