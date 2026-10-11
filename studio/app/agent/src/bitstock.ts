/**
 * Bitstock's work for this Studio agent: fixed rules over the Bitstock API, no model. The prompt is a
 * JSON object naming a skill, or the same in words ("guard_check TSLAB 1 0x..."). If Bitstock cannot be
 * read, the call fails and nothing is invented (AGENTS.md 0.2, 4.3).
 */
// The Bitstock server this agent reads from. Required: there is no default server in code.
const API = (process.env.BITSTOCK_AGENT_URL ?? "").replace(/\/+$/, "");

export class BitstockUnavailable extends Error {}

interface Req { skill: string; token?: string; usd?: string; wallet?: string }

export function parsePrompt(prompt: string): Req {
  const text = prompt.trim();
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (j && typeof j === "object" && typeof j.skill === "string") {
      return { skill: j.skill, token: str(j.token), usd: str(j.usd), wallet: str(j.wallet) };
    }
  } catch {
    // words, not JSON
  }
  const [skill = "", token, usd, wallet] = text.split(/\s+/);
  return { skill, token, usd, wallet };
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API) throw new BitstockUnavailable("BITSTOCK_AGENT_URL is not set, so Bitstock cannot be read");
  let res: Response;
  try {
    res = await fetch(`${API}/v1${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  } catch (e) {
    throw new BitstockUnavailable(`Bitstock could not be reached: ${e instanceof Error ? e.message : String(e)}`);
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    if (res.status >= 500) throw new BitstockUnavailable(body.error ?? `Bitstock answered HTTP ${res.status}`);
    throw new Error(body.error ?? `Bitstock answered HTTP ${res.status}`);
  }
  return body;
}

interface Token { address: string; symbol: string; ticker: string | null; company: string | null }

async function token(id: string | undefined): Promise<Token> {
  if (!id) throw new Error('Name a token, for example {"token": "TSLAB"}.');
  const { tokens } = await call<{ tokens: Token[] }>("/tokens");
  const k = id.toLowerCase();
  const t = tokens.find((x) => x.address === k || x.symbol.toLowerCase() === k || (x.ticker ?? "").toLowerCase() === k);
  if (!t) throw new Error(`${id} is not in Binance's live bStock list.`);
  return t;
}

export async function runBitstock(prompt: string): Promise<string> {
  const r = parsePrompt(prompt);
  if (r.skill === "multiplier_status") {
    const t = await token(r.token);
    const m = await call<Record<string, unknown>>(`/market?token=${t.address}`);
    return JSON.stringify({ skill: "multiplier_status", token: m.token, sharesPerToken: m.multiplier, session: m.session, stockPrice: m.reference, gapPercent: (m.gapPercent as { value: unknown }).value, tokenPrice: m.tokenPrice });
  }
  if (r.skill === "guard_check") {
    const t = await token(r.token);
    if (!r.usd || !/^\d{1,4}(\.\d{1,2})?$/.test(r.usd)) throw new Error('usd must be a dollar amount such as "1".');
    if (!r.wallet || !/^0x[0-9a-fA-F]{40}$/.test(r.wallet)) throw new Error("wallet must be a BSC address.");
    const d = await call<Record<string, unknown> & { checks: Array<Record<string, unknown>>; limits: { slippagePercent: string } | null }>("/decisions", {
      method: "POST",
      body: JSON.stringify({ token: t.address, amountUsd: r.usd, wallet: r.wallet, executor: "agentic-wallet" }),
    });
    return JSON.stringify({
      skill: "guard_check",
      token: t,
      outcome: d.outcome,
      reason: d.reason,
      slippagePercent: d.limits?.slippagePercent ?? null,
      recheckAt: d.recheckAt,
      checks: d.checks.map((c) => ({ name: c.name, result: c.result, reason: c.reason, source: c.source, asOf: c.asOf })),
      decisionId: d.id,
      checkedAt: d.at,
      note: "A check only. Nothing was bought.",
    });
  }
  throw new Error('Unknown skill. Use {"skill": "guard_check", ...} or {"skill": "multiplier_status", ...}.');
}
