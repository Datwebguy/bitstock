/**
 * Kill switch (AGENTS.md section 0.4): an environment flag, or an authenticated admin call that is
 * persisted in the database. Either one stops all preparing, signing and sending. The stored switch
 * survives restarts and is cleared only by an explicit, authenticated request; the environment flag
 * cannot be cleared at runtime.
 */
import type { Repository } from "./store.ts";

const KEY = "kill_switch";

export interface KillState {
  on: boolean;
  source: "environment" | "admin" | null;
  reason: string | null;
}

export function killState(env: NodeJS.ProcessEnv, repo: Repository): KillState {
  if (env["KILL_SWITCH"] === "1") return { on: true, source: "environment", reason: "KILL_SWITCH=1 in the environment" };
  const stored = repo.getSetting(KEY);
  if (stored) return { on: true, source: "admin", reason: stored };
  return { on: false, source: null, reason: null };
}

export function engageKill(repo: Repository, reason: string): void {
  repo.setSetting(KEY, reason.slice(0, 200) || "engaged by admin");
}

/** Clears only the stored switch, and only when asked with the exact confirmation phrase. */
export function clearKill(repo: Repository, confirmation: unknown): boolean {
  if (confirmation !== "clear the kill switch") return false;
  repo.setSetting(KEY, null);
  return true;
}
