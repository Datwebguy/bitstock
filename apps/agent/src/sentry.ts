/**
 * Multiplier sentry (AGENTS.md section 8): stores a snapshot of every listed token's ERC-8056 state every N
 * minutes, and scans forward for UIMultiplierUpdated logs. History starts at the first run; the
 * public RPC refuses old log ranges, so a gap between runs larger than one scan is recorded, not hidden.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getMultiplierUpdates, readMultiplierState, rpcCall } from "@bitstock/chain";

export const MAX_SCAN_BLOCKS = 4000n;

export interface ScanPlan {
  from: bigint;
  to: bigint;
  /** Blocks skipped because the gap was larger than one scan may cover. */
  skipped: { from: bigint; to: bigint } | null;
}

/** Which blocks to scan now. First run starts at the head; a gap wider than maxSpan is skipped and reported. */
export function planScan(cursor: bigint | null, head: bigint, maxSpan: bigint = MAX_SCAN_BLOCKS): ScanPlan | null {
  if (cursor === null) return { from: head, to: head, skipped: null };
  const from = cursor + 1n;
  if (from > head) return null;
  if (head - from + 1n <= maxSpan) return { from, to: head, skipped: null };
  return { from: head - maxSpan + 1n, to: head, skipped: { from, to: head - maxSpan } };
}

interface Paths {
  snapshots: string;
  updates: string;
  gaps: string;
  cursor: string;
}

function paths(dataDir: string): Paths {
  mkdirSync(dataDir, { recursive: true });
  return {
    snapshots: join(dataDir, "multiplier_snapshots.jsonl"),
    updates: join(dataDir, "multiplier_updates.jsonl"),
    gaps: join(dataDir, "multiplier_log_gaps.jsonl"),
    cursor: join(dataDir, "multiplier_log_cursor.json"),
  };
}

const line = (file: string, v: unknown) => appendFileSync(file, JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)) + "\n");

/** `tokens` is the live list of token addresses to watch; nothing is hardcoded. */
export async function runSentryOnce(env: NodeJS.ProcessEnv, tokens: string[]): Promise<{ snapshot: unknown; scanned: ScanPlan | null; updates: number; error?: string }> {
  const rpc = env["BSC_RPC_URL"] ?? "";
  const logRpc = env["BSC_LOG_RPC_URL"] || rpc;
  const p = paths(env["DATA_DIR"] || "./data");
  const head = BigInt((await rpcCall<string>(rpc, "eth_blockNumber", [])).result);
  if (tokens.length === 0) throw new Error("there are no listed tokens to watch");
  const at = new Date().toISOString();
  const source = `eth_call via ${new URL(rpc).host}`;
  let snapshot: unknown = null;
  // A few at a time, so a long list does not flood the node. A token that cannot be read is skipped and the next run retries.
  for (let i = 0; i < tokens.length; i += 6) {
    await Promise.all(
      tokens.slice(i, i + 6).map(async (token) => {
        try {
          const state = await readMultiplierState(rpc, token);
          const snap = { at, block: head, token, ...state, source };
          line(p.snapshots, snap);
          snapshot ??= snap;
        } catch {
          /* unreadable now; recorded by absence */
        }
      }),
    );
  }

  const cursor = existsSync(p.cursor) ? BigInt((JSON.parse(readFileSync(p.cursor, "utf8")) as { block: string }).block) : null;
  const plan = planScan(cursor, head);
  if (!plan) return { snapshot, scanned: null, updates: 0 };
  try {
    const found = await getMultiplierUpdates(logRpc, tokens, plan.from, plan.to, 2000n);
    for (const u of found) line(p.updates, { ...u, seenAt: new Date().toISOString() });
    if (plan.skipped) line(p.gaps, { ...plan.skipped, recordedAt: new Date().toISOString(), why: "gap between runs was wider than one scan" });
    writeFileSync(p.cursor, JSON.stringify({ block: plan.to.toString() }));
    return { snapshot, scanned: plan, updates: found.length };
  } catch (e) {
    // Leave the cursor where it was so the next run retries the same blocks.
    return { snapshot, scanned: plan, updates: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export function sentryStatus(env: NodeJS.ProcessEnv): Record<string, unknown> {
  const p = paths(env["DATA_DIR"] || "./data");
  const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as unknown) : []);
  const snaps = read(p.snapshots);
  return {
    snapshots: snaps.length,
    firstSnapshot: snaps[0] ?? null,
    lastSnapshot: snaps[snaps.length - 1] ?? null,
    updates: read(p.updates),
    gaps: read(p.gaps),
    cursor: existsSync(p.cursor) ? JSON.parse(readFileSync(p.cursor, "utf8")) : null,
    note: "History starts at the first snapshot. Older multiplier changes are not shown because the configured RPC refuses historical log queries.",
  };
}

export function startSentry(env: NodeJS.ProcessEnv, tokens: () => Promise<string[]>, log: (o: Record<string, unknown>) => void): void {
  const minutes = Number(env["SENTRY_INTERVAL_MINUTES"] ?? "10");
  if (!Number.isFinite(minutes) || minutes < 1) throw new Error("SENTRY_INTERVAL_MINUTES must be at least 1");
  if (!env["BSC_RPC_URL"]) {
    log({ level: "warn", msg: "sentry not started: BSC_RPC_URL is not set" });
    return;
  }
  const tick = () =>
    tokens()
      .then((list) => runSentryOnce(env, list))
      .then((r) => log({ level: r.error ? "warn" : "info", msg: "sentry run", updates: r.updates, scannedTo: r.scanned?.to.toString() ?? null, ...(r.error ? { error: r.error } : {}) }))
      .catch((e: unknown) => log({ level: "error", msg: "sentry run failed", error: e instanceof Error ? e.message : String(e) }));
  void tick();
  setInterval(tick, minutes * 60_000).unref();
}
