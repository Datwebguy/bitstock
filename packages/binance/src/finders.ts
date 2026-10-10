/**
 * The reference pages print two nested objects as "object" without naming the key.
 * These finders locate them by shape (docs/VERIFIED.md section 3). They return undefined
 * when nothing matches, and callers must fail closed on that.
 */

export interface MarketStatus {
  openState: boolean;
  marketStatus: string;
  reasonCode: string;
  reasonMsg: string | null;
  nextOpenTime: number | string | null;
  nextCloseTime: number | string | null;
}

export interface SwapTx {
  from: string;
  to: string;
  data: string;
  value?: string;
  gas?: string;
  gasPrice?: string;
  maxPriorityFeePerGas?: string;
  [key: string]: unknown;
}

const MAX_DEPTH = 6;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Depth-first, shallowest-first search for an object that satisfies `match`. */
function findByShape<T>(root: unknown, match: (o: Record<string, unknown>) => boolean): T | undefined {
  const queue: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }];
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const { node, depth } = item;
    if (isRecord(node)) {
      if (match(node)) return node as T;
      if (depth < MAX_DEPTH) for (const v of Object.values(node)) queue.push({ node: v, depth: depth + 1 });
    } else if (Array.isArray(node) && depth < MAX_DEPTH) {
      for (const v of node) queue.push({ node: v, depth: depth + 1 });
    }
  }
  return undefined;
}

/** The object that carries a boolean `openState`. */
export function findMarketStatus(root: unknown): MarketStatus | undefined {
  return findByShape<MarketStatus>(root, (o) => typeof o["openState"] === "boolean");
}

/** The object that carries string `from`, `to` and `data`. */
export function findSwapTx(root: unknown): SwapTx | undefined {
  return findByShape<SwapTx>(
    root,
    (o) => typeof o["from"] === "string" && typeof o["to"] === "string" && typeof o["data"] === "string",
  );
}
