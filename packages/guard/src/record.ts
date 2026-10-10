import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { GuardConfig } from "./config.ts";
import type { Decision } from "./rules.ts";
import type { Check, DecisionRecord, GuardInput, GuardRequest } from "./types.ts";

export function buildRecord(request: GuardRequest, inputs: GuardInput[], checks: Check[], decision: Decision, cfg: GuardConfig, now: Date, id: string = randomUUID()): DecisionRecord {
  return {
    id,
    at: now.toISOString(),
    rulesVersion: cfg.rulesVersion,
    request,
    inputs,
    checks,
    outcome: decision.outcome,
    reason: decision.reason,
    limits: decision.limits,
    recheckAt: decision.recheckAt,
    txHash: null,
    receipt: null,
  };
}

/** Where decision records go. SQLite replaces this behind the same interface (docs/ARCHITECTURE.md section 7). */
export interface DecisionStore {
  save(record: DecisionRecord): Promise<void>;
}

/** Append-only JSON Lines file: one complete record per line, written with a single append. */
export class JsonlDecisionStore implements DecisionStore {
  readonly #path: string;
  constructor(path: string) {
    this.#path = path;
    mkdirSync(dirname(path), { recursive: true });
  }
  async save(record: DecisionRecord): Promise<void> {
    appendFileSync(this.#path, JSON.stringify(record) + "\n");
  }
}
