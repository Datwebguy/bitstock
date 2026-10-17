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
const RELAYER = "0x" + "22".repeat(20);

let dir: string;
let svc: GiftService;
let db: DatabaseSync;

function stubChain(chain: Chain, confirmedNonce = 0): void {
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    const { method, params } = JSON.parse(init.body) as { method: string; params: string[] };
    const c = chain[params[0] ?? ""] ?? {};
    const result =
      method === "eth_getTransactionReceipt" ? (c.receipt ?? null)
      : method === "eth_getTransactionByHash" ? (c.known ? { hash: params[0] } : null)
      : method === "eth_getTransactionCount" ? "0x" + confirmedNonce.toString(16)
      : null;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { headers: { "content-type": "application/json" } });
  });
}

function addClaim(box: number, wallet: string, status: string, hash: string | null, ageMs: number, nonce: number | null = null): string {
  const id = `claim-${box}`;
  db.prepare("INSERT INTO gift_claims (id, campaign_id, box_index, wallet, amount, status, tx_hash, created_at, nonce) VALUES (?, 'c1', ?, ?, '1000', ?, ?, ?, ?)")
    .run(id, box, wallet, status, hash, new Date(Date.now() - ageMs).toISOString(), nonce === null ? null : String(nonce));
  return id;
}

const history = (id: string) => db.prepare("SELECT status, fee_wei FROM gift_claim_history WHERE id = ?").get(id) as { status: string; fee_wei: string | null } | undefined;

const row = (id: string) => db.prepare("SELECT status, fee_wei FROM gift_claims WHERE id = ?").get(id) as { status: string; fee_wei: string | null } | undefined;
const noLog = () => undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gift-"));
  const ctx = { env: { DATA_DIR: dir }, rpcUrl: "http://rpc.test", txRpcUrl: "http://rpc.test" } as unknown as AgentContext;
  svc = new GiftService(ctx, { ...giftConfigFromEnv({ GIFT_TOKEN: TOKEN }), relayer: RELAYER });
  db = new DatabaseSync(join(dir, "bitstock.sqlite"));
  db.prepare("INSERT INTO gift_campaigns (id, created_at, token, received, boxes, commitment, secret, status, expires_at) VALUES ('c1', ?, ?, '1', '[]', 'x', 's', 'open', ?)")
    .run(new Date().toISOString(), TOKEN, new Date(Date.now() + 86_400_000).toISOString());
});

afterEach(() => {
  vi.unstubAllGlobals();
  db.close();
  svc.dispose();
  rmSync(dir, { recursive: true, force: true });
});

describe("reconciling gift claims from receipts", () => {
  it("settles a sent claim as confirmed and records the real fee", async () => {
    const id = addClaim(0, "0xaa", "sending", HASH(1), 60_000);
    stubChain({ [HASH(1)]: { receipt: { status: "0x1", gasUsed: "0x186a0", effectiveGasPrice: "0x3b9aca00" } } });
    await svc.reconcileClaims(noLog);
    expect(row(id)).toEqual({ status: "confirmed", fee_wei: (100_000n * 1_000_000_000n).toString() });
  });

  it("frees the box and the wallet of a reverted claim, keeping it in the history with its real fee", async () => {
    const B = "0x" + "bb".repeat(20);
    const id = addClaim(1, B, "sending", HASH(2), 60_000, 3);
    stubChain({ [HASH(2)]: { receipt: { status: "0x0", gasUsed: "0x5208", effectiveGasPrice: "0x1" } } });
    await svc.reconcileClaims(noLog);
    expect(row(id)).toBeUndefined();
    expect(history(id)).toEqual({ status: "reverted", fee_wei: "21000" });
    expect(svc.claimOf(B)).toBeNull();
    expect(svc.status()).toMatchObject({ remaining: 0 }); // the test campaign has no boxes; the reverted claim does not take one
  });

  it("frees a claim with no receipt once the relayer's confirmed nonce has moved past it", async () => {
    const id = addClaim(2, "0xcc", "sending", HASH(3), 60_000, 7);
    stubChain({}, 8);
    await svc.reconcileClaims(noLog);
    expect(row(id)).toBeUndefined();
    expect(history(id)?.status).toBe("dropped");
  });

  it("never frees a claim whose nonce is not yet used, or is unknown, however old or unknown to the node", async () => {
    const waiting = addClaim(3, "0xdd", "sending", HASH(4), 5 * 3_600_000, 7);
    const noNonce = addClaim(4, "0xee", "sending", HASH(5), 5 * 3_600_000, null);
    stubChain({}, 7);
    await svc.reconcileClaims(noLog);
    expect(row(waiting)?.status).toBe("sending");
    expect(row(noNonce)?.status).toBe("sending");
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

describe("looking up a wallet's claim", () => {
  const A = "0x" + "ab".repeat(20);
  it("finds the claim whatever the letter case, and nothing for a wallet that has not claimed", () => {
    addClaim(0, A, "confirmed", HASH(7), 10_000);
    expect(svc.claimOf(A.toUpperCase().replace("0X", "0x"))).toMatchObject({ box: 1, status: "confirmed" });
    expect(svc.claimOf("0x" + "cd".repeat(20))).toBeNull();
  });
  it("lets a wallet try again after a claim that never reached the network failed", () => {
    addClaim(1, A, "failed", null, 10_000);
    expect(svc.claimOf(A)).toBeNull();
  });
  it("rejects an address that is not valid", () => {
    expect(() => svc.claimOf("nope")).toThrow();
  });
});
