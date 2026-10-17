/** The shapes stored for every decision (docs/ARCHITECTURE.md section 4). */

export type CheckResult = "pass" | "warn" | "fail" | "unavailable";
export type InputStatus = "ok" | "stale" | "unavailable";
export type Outcome = "GO" | "LIMIT" | "WAIT" | "BLOCK";
export type CheckId = "session" | "multiplier" | "reference" | "execution" | "simulation";

export interface GuardInput {
  name: string;
  /** Raw value as read (string, number, object), or null when it could not be read. */
  value: unknown;
  source: string;
  /** ISO time the value describes (or was read, when the source gives no time). */
  asOf: string | null;
  status: InputStatus;
  error?: string;
}

export interface Check {
  id: CheckId;
  name: string;
  result: CheckResult;
  /** The value the rule looked at, as a plain string for display. */
  rawValue: string | null;
  threshold: string | null;
  source: string;
  asOf: string | null;
  /** One plain sentence a user can read. */
  reason: string;
  /** Set when the safe action is to wait (a known reopen time, or a transient outage). */
  retryAt?: string | null;
}

export interface SlippageLimit {
  slippagePercent: string;
  why: string;
}

export interface GuardRequest {
  token: string;
  side: "buy";
  amountUsd: string;
  wallet: string;
  /**
   * Who will send the buy. "own-wallet" (Mode A, the default): the user signs the transaction
   * Bitstock prepared. "agentic-wallet" (Mode B): the user's Binance Agentic Wallet swaps through
   * its own `baw` command, which handles the USDT approval itself (docs/adr/0007).
   */
  executor?: "own-wallet" | "agentic-wallet";
}

export interface DecisionRecord {
  id: string;
  at: string;
  rulesVersion: string;
  request: GuardRequest;
  inputs: GuardInput[];
  checks: Check[];
  outcome: Outcome;
  /** One sentence: why this outcome. */
  reason: string;
  limits: SlippageLimit | null;
  /** WAIT only: when the full guard runs again. */
  recheckAt: string | null;
  /** WAIT only: the saved request that is checked again at recheckAt. */
  intentId?: string | null;
  /** GO or LIMIT: the final transaction the user is asked to sign, after its own dry run. */
  prepared?: PreparedTx | null;
  txHash: string | null;
  receipt: unknown | null;
}

export interface PreparedTx {
  from: string;
  to: string;
  value: string;
  data: string;
  /** Gas limit: the largest of the swap's own figure and the node's estimate, plus headroom. */
  gas: string;
  gasPrice: string;
  chainId: number;
  slippagePercent: string;
  minReceiveAmount: string | null;
  simulation: { status: string; stockArriving: string | null };
  gasSources: Record<string, string | null>;
  /** Unix ms after which the app must ask the guard again instead of sending this. */
  expiresAt: number;
}
