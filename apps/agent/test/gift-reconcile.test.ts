import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext } from "../src/context.ts";
import { GiftService, giftConfigFromEnv } from "../src/gift-service.ts";

// Fixtures: fake hashes and addresses, only ever used inside this test.
const TOKEN = "0x" + "11".repeat(20);
const HASH = (n: number) => "0x" + String(n).repeat(64);
type Chain = Record<string, { receipt?: { status: string; gasUsed: string; effectiveGasPrice: string } | null; known?: boolean }>;

let dir: string;
let svc: GiftService;
let db: DatabaseSync;

function stubChain(chain: Chain): void {
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    const { method, params } = JSON.parse(init.body) as { method: string; params: string[] };
    const c = chain[params[0] ?? ""] ?? {};
    const result = method === "eth_getTransactionReceipt" ? (c.receipt ?? null) : method === "eth_getTransactionByHash" ? (c.known ? { hash: params[0] } : null) : null;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { headers: { "content-type": "application/json" } });
  });
}

function addClaim(box: number, wallet: string, status: string, hash: string | null, ageMs: number): string {
  const id = `claim-${box}`;
  db.prepare("INSERT INTO gift_claims (id, campaign_id, box_index, wallet, amount, status, tx_hash, created_at) VALUES (?, 'c1', ?, ?, '1000', ?, ?, ?)")
    .run(id, box, wallet, status, hash, new Date(Date.now() - ageMs).toISOString());
  return id;
}

const row = (id: string) => db.prepare("SELECT status, fee_wei FROM gift_claims WHERE id = ?").get(id) as { status: string; fee_wei: string | null } | undefined;
const noLog = () => undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gift-"));
  const ctx = { env: { DATA_DIR: dir }, rpcUrl: "http://rpc.test", txRpcUrl: "http://rpc.test" } as unknown as AgentContext;
  svc = new GiftService(ctx, giftConfigFromEnv({ GIFT_TOKEN: TOKEN }));
  db = new DatabaseSync(join(dir, "bitstock.sqlite"));
  db.prepare("INSERT INTO gift_campaigns (id, created_at, token, received, boxes, commitment, secret, status, expires_at) VALUES ('c1', ?, ?, '1', '[]', 'x', 's', 'open', ?)")
    .run(new Date().toISOString(), TOKEN, new Date(Date.now() + 86_400_000).toISOString());
});

afterEach(() => {
  vi.unstubAllGlobals();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("reconciling gift claims from receipts", () => {
  it("settles a sent claim as confirmed and records the real fee", async () => {
    const id = addClaim(0, "0xaa", "sending", HASH(1), 60_000);
    stubChain({ [HASH(1)]: { receipt: { status: "0x1", gasUsed: "0x186a0", effectiveGasPrice: "0x3b9aca00" } } });
    await svc.reconcileClaims(noLog);
    expect(row(id)).toEqual({ status: "confirmed", fee_wei: (100_000n * 1_000_000_000n).toString() });
  });

  it("settles a reverted claim as reverted", async () => {
    const id = addClaim(1, "0xbb", "sending", HASH(2), 60_000);
    stubChain({ [HASH(2)]: { receipt: { status: "0x0", gasUsed: "0x5208", effectiveGasPrice: "0x1" } } });
    await svc.reconcileClaims(noLog);
    expect(row(id)?.status).toBe("reverted");
  });

  it("frees the box and the wallet when the network never knew the transaction, an hour on", async () => {
    const id = addClaim(2, "0xcc", "sending", HASH(3), 2 * 3_600_000);
    stubChain({});
    await svc.reconcileClaims(noLog);
    expect(row(id)).toBeUndefined();
  });

  it("leaves a recent claim alone while it is still unknown, and a pending one the node does know", async () => {
    const young = addClaim(3, "0xdd", "sending", HASH(4), 60_000);
    const pending = addClaim(4, "0xee", "sending", HASH(5), 2 * 3_600_000);
    stubChain({ [HASH(5)]: { known: true } });
    await svc.reconcileClaims(noLog);
    expect(row(young)?.status).toBe("sending");
    expect(row(pending)?.status).toBe("sending");
  });

  it("does not touch claims that are already settled or never reached the network", async () => {
    const done = addClaim(5, "0xf1", "confirmed", HASH(6), 10_000);
    const unsent = addClaim(6, "0xf2", "sending", null, 10_000);
    stubChain({});
    await svc.reconcileClaims(noLog);
    expect(row(done)?.status).toBe("confirmed");
    expect(row(unsent)?.status).toBe("sending");
  });
});
