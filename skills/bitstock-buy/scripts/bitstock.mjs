#!/usr/bin/env node
/**
 * Bitstock helper for the bitstock-buy skill. Talks only to the Bitstock agent API; it never touches
 * keys, never signs and never sends a transaction. Node 18 or later, no dependencies.
 *
 *   node bitstock.mjs tokens [--q <text>]
 *   node bitstock.mjs market --token <SYMBOL|address>
 *   node bitstock.mjs check --token <SYMBOL|address> --usd <amount> --wallet <address>
 *   node bitstock.mjs wait-open --token <SYMBOL|address> [--after-minutes 15] [--max-hours 72]
 *   node bitstock.mjs attach --decision <id> --tx <hash>
 *
 * Output is one JSON object on stdout. Exit codes: 0 ok (check: GO or LIMIT), 2 WAIT, 3 BLOCK,
 * 4 bad input, 5 Bitstock unreachable.
 */
const AGENT = (process.env.BITSTOCK_AGENT_URL || "https://agent-production-6403.up.railway.app").replace(/\/+$/, "");

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[k] = v;
    } else out._.push(a);
  }
  return out;
}

function print(obj, code = 0) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
  process.exit(code);
}

function fail(message, code = 4) {
  print({ ok: false, error: message }, code);
}

async function call(path, init) {
  let res;
  try {
    res = await fetch(`${AGENT}/v1${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  } catch (e) {
    fail(`Bitstock could not be reached at ${AGENT}: ${e instanceof Error ? e.message : String(e)}`, 5);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fail(body.error || `Bitstock answered HTTP ${res.status}`, res.status >= 500 ? 5 : 4);
  return body;
}

async function findToken(id) {
  if (!id) fail("--token is required (a symbol such as TSLAB or a contract address)");
  const { tokens } = await call("/tokens");
  const k = id.trim().toLowerCase();
  const t = tokens.find((x) => x.address === k || x.symbol.toLowerCase() === k || (x.ticker ?? "").toLowerCase() === k);
  if (!t) fail(`${id} is not in Binance's live bStock list. Run "tokens" to see what is listed.`);
  return t;
}

const isAddress = (s) => typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A verified open session: Binance says open and in its regular session (AGENTS.md section 2, Mode B). */
function regularOpen(session) {
  const v = session?.value;
  return Boolean(v && v.openState === true && typeof v.marketStatus === "string" && v.marketStatus.toLowerCase() === "regular");
}

const a = args(process.argv.slice(2));
const cmd = a._[0];

if (cmd === "tokens") {
  const { tokens, asOf, source } = await call("/tokens");
  const q = (a.q || "").toLowerCase();
  const list = tokens
    .filter((t) => !q || [t.symbol, t.ticker, t.company, t.name].some((v) => (v ?? "").toLowerCase().includes(q)))
    .map((t) => ({ symbol: t.symbol, ticker: t.ticker, company: t.company, address: t.address, priceUsd: t.price, marketOpen: t.session ? t.session.openState : null, status: t.session?.reasonCode ?? null }));
  print({ ok: true, source, asOf, count: list.length, tokens: list });
} else if (cmd === "market") {
  const t = await findToken(a.token);
  const m = await call(`/market?token=${t.address}`);
  print({ ok: true, token: m.token, session: m.session, regularOpen: regularOpen(m.session), tokenPriceUsd: m.tokenPrice, sharesPerToken: m.multiplier, stockPrice: m.reference, gapPercent: m.gapPercent.value });
} else if (cmd === "check") {
  const t = await findToken(a.token);
  if (!a.usd || !/^\d{1,4}(\.\d{1,2})?$/.test(a.usd)) fail("--usd must be a dollar amount such as 1 or 2.50");
  if (!isAddress(a.wallet)) fail("--wallet must be the Agentic Wallet's BSC address (from: baw wallet address --json)");
  const d = await call("/decisions", {
    method: "POST",
    headers: { "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ token: t.address, amountUsd: a.usd, wallet: a.wallet, executor: "agentic-wallet" }),
  });
  const out = {
    ok: true,
    decisionId: d.id,
    outcome: d.outcome,
    reason: d.reason,
    slippagePercent: d.limits?.slippagePercent ?? null,
    recheckAt: d.recheckAt,
    token: { symbol: t.symbol, ticker: t.ticker, company: t.company, address: t.address },
    payToken: { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955" },
    amountUsd: a.usd,
    checks: d.checks.map((c) => ({ name: c.name, result: c.result, reason: c.reason })),
    checkedAt: d.at,
  };
  print(out, d.outcome === "GO" || d.outcome === "LIMIT" ? 0 : d.outcome === "WAIT" ? 2 : 3);
} else if (cmd === "wait-open") {
  const t = await findToken(a.token);
  const afterMin = Number(a["after-minutes"] ?? 15);
  const maxHours = Number(a["max-hours"] ?? 72);
  if (!Number.isFinite(afterMin) || afterMin < 0 || afterMin > 240) fail("--after-minutes must be between 0 and 240");
  if (!Number.isFinite(maxHours) || maxHours <= 0 || maxHours > 168) fail("--max-hours must be between 0 and 168");
  const deadline = Date.now() + maxHours * 3_600_000;
  let openSince = null;
  for (;;) {
    const m = await call(`/market?token=${t.address}`);
    const open = regularOpen(m.session);
    const now = Date.now();
    if (open && openSince === null) openSince = now;
    if (!open) openSince = null;
    if (openSince !== null && now - openSince >= afterMin * 60_000) {
      print({ ok: true, token: t.symbol, regularOpen: true, openSeenAt: new Date(openSince).toISOString(), readyAt: new Date(now).toISOString(), session: m.session.value });
    }
    if (now > deadline) print({ ok: false, token: t.symbol, regularOpen: false, error: `No verified open session within ${maxHours} hours.`, session: m.session.value }, 2);
    const next = m.session.value?.nextOpenTime ? Number(m.session.value.nextOpenTime) : null;
    process.stderr.write(`${new Date(now).toISOString()} ${t.symbol}: ${open ? `open in regular session, waiting ${afterMin} min after the open` : `not in a regular session${next ? `; Binance says it opens ${new Date(next).toISOString()}` : ""}`}\n`);
    // Poll once a minute; Bitstock caches market reads for 30 seconds.
    await sleep(60_000);
  }
} else if (cmd === "attach") {
  if (!/^[0-9a-f-]{36}$/.test(a.decision ?? "")) fail("--decision must be the decisionId from check");
  if (!/^0x[0-9a-fA-F]{64}$/.test(a.tx ?? "")) fail("--tx must be the swap's transaction hash");
  const r = await call(`/decisions/${a.decision}/tx`, { method: "POST", body: JSON.stringify({ txHash: a.tx }) });
  print({ ok: true, ...r });
} else {
  fail('Unknown command. Use one of: tokens, market, check, wait-open, attach.');
}
