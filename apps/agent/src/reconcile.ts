import { getReceipt, rpcCall } from "@bitstock/chain";
import type { AgentContext } from "./context.ts";

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Attach the user's transaction hash to a decision, only if the chain shows that exact prepared
 * transaction sent from the decision's wallet (for an Agentic Wallet, which builds its own swap,
 * a transaction sent from that wallet after a GO or LIMIT). Idempotent for the same hash.
 */
export async function attachUserTx(ctx: AgentContext, decisionId: string, txHash: unknown): Promise<{ ok: boolean; status: number; message: string }> {
  if (typeof txHash !== "string" || !HASH_RE.test(txHash)) return { ok: false, status: 400, message: "The transaction hash is not valid." };
  const stored = ctx.repo.decision(decisionId);
  if (!stored) return { ok: false, status: 404, message: "No such decision." };
  const p = stored.record.prepared;
  const agentic = stored.record.request.executor === "agentic-wallet";
  if (!p && !agentic) return { ok: false, status: 409, message: "This decision has no prepared transaction." };
  if (agentic && stored.record.outcome !== "GO" && stored.record.outcome !== "LIMIT") return { ok: false, status: 409, message: "This decision did not allow a buy." };
  let tx: { from?: string; to?: string; input?: string } | null = null;
  // A just-broadcast transaction can take a moment to appear on the node.
  for (let i = 0; i < 10 && !tx; i++) {
    tx = (await rpcCall<{ from?: string; to?: string; input?: string } | null>(ctx.txRpcUrl, "eth_getTransactionByHash", [txHash])).result;
    if (!tx) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!tx) return { ok: false, status: 404, message: "That transaction is not on the chain yet. Try again in a moment." };
  if (p) {
    const same = tx.from?.toLowerCase() === p.from.toLowerCase() && tx.to?.toLowerCase() === p.to.toLowerCase() && tx.input?.toLowerCase() === p.data.toLowerCase();
    if (!same) return { ok: false, status: 409, message: "That transaction is not the one Bitstock prepared for this decision." };
  } else if (tx.from?.toLowerCase() !== stored.record.request.wallet.toLowerCase()) {
    // An Agentic Wallet builds its own swap, so only the sender can be matched to the decision.
    return { ok: false, status: 409, message: "That transaction was not sent from the wallet this decision was checked for." };
  }
  if (!ctx.repo.attachTx(decisionId, txHash)) return { ok: false, status: 409, message: "A different transaction is already recorded for this decision." };
  await reconcileOne(ctx, decisionId, txHash);
  return { ok: true, status: 200, message: "Recorded." };
}

async function reconcileOne(ctx: AgentContext, id: string, hash: string): Promise<void> {
  const r = await getReceipt(ctx.txRpcUrl, hash);
  if (r) ctx.repo.settleTx(id, r.status === "success" ? "confirmed" : "reverted", r);
}

/** Settle every submitted transaction from its receipt (run at start and on a timer). */
export async function reconcileSubmitted(ctx: AgentContext, log: (o: Record<string, unknown>) => void): Promise<void> {
  for (const d of ctx.repo.submittedDecisions()) {
    try {
      if (d.record.txHash) await reconcileOne(ctx, d.record.id, d.record.txHash);
    } catch (e) {
      log({ level: "warn", msg: "reconcile failed", decision: d.record.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
}
