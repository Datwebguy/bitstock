/**
 * Storage behind a repository interface (AGENTS.md section 4, item 12). SQLite in WAL mode via Node's
 * built-in node:sqlite; every multi-step write runs in one transaction. Postgres can replace this
 * class without touching callers.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DecisionRecord } from "@bitstock/guard";

export type DecisionStatus = "decided" | "submitted" | "confirmed" | "reverted";
export type IntentStatus = "waiting" | "ready" | "blocked" | "cancelled";

export interface StoredDecision {
  record: DecisionRecord;
  status: DecisionStatus;
}

export interface Intent {
  id: string;
  createdAt: string;
  request: DecisionRecord["request"];
  reason: string;
  recheckAt: string;
  status: IntentStatus;
  lastDecisionId: string;
  attempts: number;
}

export interface Repository {
  saveDecision(record: DecisionRecord, idemKey: string | null): void;
  decisionByIdemKey(key: string): StoredDecision | null;
  decision(id: string): StoredDecision | null;
  /** Attach the user's transaction once. Returns false if a different hash is already attached. */
  attachTx(id: string, txHash: string): boolean;
  submittedDecisions(): StoredDecision[];
  settleTx(id: string, status: "confirmed" | "reverted", receipt: unknown): void;
  countsByOutcome(): Record<string, number>;
  recentDecisions(limit: number): StoredDecision[];
  createIntent(intent: Intent): void;
  dueIntents(nowIso: string): Intent[];
  updateIntent(id: string, patch: Pick<Intent, "status" | "recheckAt" | "reason" | "lastDecisionId">): void;
  intent(id: string): Intent | null;
  getSetting(key: string): string | null;
  setSetting(key: string, value: string | null): void;
}

export class SqliteRepository implements Repository {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY, at TEXT NOT NULL, outcome TEXT NOT NULL, idem_key TEXT UNIQUE,
        wallet TEXT NOT NULL, record TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'decided',
        tx_hash TEXT UNIQUE, receipt TEXT
      );
      CREATE INDEX IF NOT EXISTS decisions_status ON decisions(status);
      CREATE TABLE IF NOT EXISTS intents (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, request TEXT NOT NULL, reason TEXT NOT NULL,
        recheck_at TEXT NOT NULL, status TEXT NOT NULL, last_decision_id TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS intents_due ON intents(status, recheck_at);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sends (
        id TEXT PRIMARY KEY, idem_key TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL,
        tx_hash TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
  }

  #tx<T>(fn: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.#db.exec("COMMIT");
      return out;
    } catch (e) {
      this.#db.exec("ROLLBACK");
      throw e;
    }
  }

  #row(r: Record<string, unknown> | undefined): StoredDecision | null {
    if (!r) return null;
    const record = JSON.parse(String(r["record"])) as DecisionRecord;
    record.txHash = (r["tx_hash"] as string | null) ?? null;
    record.receipt = r["receipt"] ? (JSON.parse(String(r["receipt"])) as unknown) : null;
    return { record, status: r["status"] as DecisionStatus };
  }

  saveDecision(record: DecisionRecord, idemKey: string | null): void {
    this.#db
      .prepare("INSERT INTO decisions (id, at, outcome, idem_key, wallet, record) VALUES (?, ?, ?, ?, ?, ?)")
      .run(record.id, record.at, record.outcome, idemKey, record.request.wallet.toLowerCase(), JSON.stringify(record));
  }

  decisionByIdemKey(key: string): StoredDecision | null {
    return this.#row(this.#db.prepare("SELECT * FROM decisions WHERE idem_key = ?").get(key) as Record<string, unknown> | undefined);
  }

  decision(id: string): StoredDecision | null {
    return this.#row(this.#db.prepare("SELECT * FROM decisions WHERE id = ?").get(id) as Record<string, unknown> | undefined);
  }

  attachTx(id: string, txHash: string): boolean {
    return this.#tx(() => {
      const r = this.#db.prepare("SELECT tx_hash FROM decisions WHERE id = ?").get(id) as { tx_hash: string | null } | undefined;
      if (!r) throw new Error("unknown decision");
      if (r.tx_hash) return r.tx_hash.toLowerCase() === txHash.toLowerCase();
      this.#db.prepare("UPDATE decisions SET tx_hash = ?, status = 'submitted' WHERE id = ?").run(txHash.toLowerCase(), id);
      return true;
    });
  }

  submittedDecisions(): StoredDecision[] {
    return (this.#db.prepare("SELECT * FROM decisions WHERE status = 'submitted'").all() as Array<Record<string, unknown>>).map((r) => this.#row(r)!);
  }

  settleTx(id: string, status: "confirmed" | "reverted", receipt: unknown): void {
    this.#db.prepare("UPDATE decisions SET status = ?, receipt = ? WHERE id = ? AND status = 'submitted'").run(status, JSON.stringify(receipt, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), id);
  }

  countsByOutcome(): Record<string, number> {
    const rows = this.#db.prepare("SELECT outcome, COUNT(*) AS n FROM decisions GROUP BY outcome").all() as Array<{ outcome: string; n: number }>;
    return Object.fromEntries(rows.map((r) => [r.outcome, Number(r.n)]));
  }

  recentDecisions(limit: number): StoredDecision[] {
    return (this.#db.prepare("SELECT * FROM decisions ORDER BY at DESC LIMIT ?").all(Math.min(Math.max(limit, 1), 50)) as Array<Record<string, unknown>>).map((r) => this.#row(r)!);
  }

  createIntent(i: Intent): void {
    this.#db
      .prepare("INSERT INTO intents (id, created_at, request, reason, recheck_at, status, last_decision_id, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(i.id, i.createdAt, JSON.stringify(i.request), i.reason, i.recheckAt, i.status, i.lastDecisionId, i.attempts);
  }

  #intent(r: Record<string, unknown>): Intent {
    return {
      id: String(r["id"]), createdAt: String(r["created_at"]), request: JSON.parse(String(r["request"])) as Intent["request"], reason: String(r["reason"]),
      recheckAt: String(r["recheck_at"]), status: r["status"] as IntentStatus, lastDecisionId: String(r["last_decision_id"]), attempts: Number(r["attempts"]),
    };
  }

  dueIntents(nowIso: string): Intent[] {
    return (this.#db.prepare("SELECT * FROM intents WHERE status = 'waiting' AND recheck_at <= ? ORDER BY recheck_at LIMIT 20").all(nowIso) as Array<Record<string, unknown>>).map((r) => this.#intent(r));
  }

  updateIntent(id: string, p: Pick<Intent, "status" | "recheckAt" | "reason" | "lastDecisionId">): void {
    this.#db.prepare("UPDATE intents SET status = ?, recheck_at = ?, reason = ?, last_decision_id = ?, attempts = attempts + 1 WHERE id = ?").run(p.status, p.recheckAt, p.reason, p.lastDecisionId, id);
  }

  intent(id: string): Intent | null {
    const r = this.#db.prepare("SELECT * FROM intents WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? this.#intent(r) : null;
  }

  getSetting(key: string): string | null {
    const r = this.#db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string | null } | undefined;
    return r?.value ?? null;
  }

  setSetting(key: string, value: string | null): void {
    this.#db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(key, value, new Date().toISOString());
  }
}
