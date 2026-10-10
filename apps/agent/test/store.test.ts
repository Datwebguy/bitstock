import { describe, expect, it } from "vitest";
import type { DecisionRecord } from "@bitstock/guard";
import { clearKill, engageKill, killState } from "../src/killswitch.ts";
import { InputError, validateRequest } from "../src/decisions.ts";
import { RateLimiter } from "../src/ratelimit.ts";
import { SqliteRepository } from "../src/store.ts";

// Fixture record for storage tests only.
const record = (id: string, outcome: DecisionRecord["outcome"] = "LIMIT"): DecisionRecord => ({
  id, at: "2026-10-10T22:00:00.000Z", rulesVersion: "1", request: { token: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436", side: "buy", amountUsd: "1", wallet: "0x1111111111111111111111111111111111111111" },
  inputs: [], checks: [], outcome, reason: "r", limits: null, recheckAt: null, txHash: null, receipt: null,
});
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

describe("repository", () => {
  it("stores a decision and finds it by id and by idempotency key", () => {
    const repo = new SqliteRepository(":memory:");
    repo.saveDecision(record(ID1), "key-aaaaaaaa");
    expect(repo.decision(ID1)?.record.outcome).toBe("LIMIT");
    expect(repo.decisionByIdemKey("key-aaaaaaaa")?.record.id).toBe(ID1);
    expect(() => repo.saveDecision(record(ID2), "key-aaaaaaaa")).toThrow();
  });
  it("attaches one transaction per decision, idempotently", () => {
    const repo = new SqliteRepository(":memory:");
    repo.saveDecision(record(ID1), null);
    const h = "0x" + "ab".repeat(32);
    expect(repo.attachTx(ID1, h)).toBe(true);
    expect(repo.attachTx(ID1, h.toUpperCase().replace("0X", "0x"))).toBe(true);
    expect(repo.attachTx(ID1, "0x" + "cd".repeat(32))).toBe(false);
    expect(repo.decision(ID1)?.status).toBe("submitted");
    expect(repo.submittedDecisions()).toHaveLength(1);
    repo.settleTx(ID1, "confirmed", { blockNumber: 5n });
    expect(repo.decision(ID1)?.status).toBe("confirmed");
    expect(repo.submittedDecisions()).toHaveLength(0);
  });
  it("refuses the same transaction on two decisions", () => {
    const repo = new SqliteRepository(":memory:");
    repo.saveDecision(record(ID1), null);
    repo.saveDecision(record(ID2), null);
    const h = "0x" + "ab".repeat(32);
    repo.attachTx(ID1, h);
    expect(() => repo.attachTx(ID2, h)).toThrow();
  });
  it("returns only due waiting intents", () => {
    const repo = new SqliteRepository(":memory:");
    const base = { createdAt: "2026-10-10T22:00:00.000Z", request: record(ID1).request, reason: "closed", status: "waiting" as const, lastDecisionId: ID1, attempts: 0 };
    repo.createIntent({ ...base, id: ID1, recheckAt: "2026-10-12T13:30:00.000Z" });
    repo.createIntent({ ...base, id: ID2, recheckAt: "2026-10-10T22:10:00.000Z" });
    expect(repo.dueIntents("2026-10-10T23:00:00.000Z").map((i) => i.id)).toEqual([ID2]);
    repo.updateIntent(ID2, { status: "ready", recheckAt: "2026-10-10T23:00:00.000Z", reason: "ok", lastDecisionId: ID2 });
    expect(repo.dueIntents("2026-10-11T00:00:00.000Z")).toEqual([]);
    expect(repo.intent(ID2)?.attempts).toBe(1);
  });
  it("counts decisions by outcome", () => {
    const repo = new SqliteRepository(":memory:");
    repo.saveDecision(record(ID1, "BLOCK"), null);
    repo.saveDecision(record(ID2, "LIMIT"), null);
    expect(repo.countsByOutcome()).toEqual({ BLOCK: 1, LIMIT: 1 });
  });
});

describe("kill switch", () => {
  it("persists when engaged and clears only with the exact phrase", () => {
    const repo = new SqliteRepository(":memory:");
    expect(killState({}, repo).on).toBe(false);
    engageKill(repo, "suspicious quotes");
    expect(killState({}, repo)).toEqual({ on: true, source: "admin", reason: "suspicious quotes" });
    expect(clearKill(repo, "yes")).toBe(false);
    expect(killState({}, repo).on).toBe(true);
    expect(clearKill(repo, "clear the kill switch")).toBe(true);
    expect(killState({}, repo).on).toBe(false);
  });
  it("the environment flag wins and cannot be cleared at runtime", () => {
    const repo = new SqliteRepository(":memory:");
    clearKill(repo, "clear the kill switch");
    expect(killState({ KILL_SWITCH: "1" }, repo)).toMatchObject({ on: true, source: "environment" });
  });
});

describe("request validation", () => {
  const ok = { token: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436", amountUsd: "1", wallet: "0x1111111111111111111111111111111111111111" };
  it("accepts a supported token, a valid wallet and an amount under the cap", () => {
    expect(validateRequest(ok, "5")).toEqual(ok);
  });
  it("refuses unsupported tokens, bad wallets, bad amounts and amounts over the cap", () => {
    expect(() => validateRequest({ ...ok, token: "0x55d398326f99059fF775485246999027B3197955" }, "5")).toThrow(InputError);
    expect(() => validateRequest({ ...ok, wallet: "0x12" }, "5")).toThrow(/wallet/);
    for (const a of ["0", "-1", "1e2", "1.234", "abc", ""]) expect(() => validateRequest({ ...ok, amountUsd: a }, "5")).toThrow();
    expect(() => validateRequest({ ...ok, amountUsd: "5.01" }, "5")).toThrow(/most/);
    expect(() => validateRequest(null, "5")).toThrow();
  });
});

describe("rate limiter", () => {
  it("allows the limit per window, then refuses until the window resets", () => {
    const rl = new RateLimiter(2, 60_000);
    expect([rl.allow("a", 0), rl.allow("a", 1), rl.allow("a", 2)]).toEqual([true, true, false]);
    expect(rl.allow("b", 2)).toBe(true);
    expect(rl.allow("a", 60_000)).toBe(true);
  });
});
