import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isAdmin } from "./auth.ts";
import { variableStatus } from "./config.ts";
import { buildContext } from "./context.ts";
import { InputError, makeDecision, processDueIntents, validateRequest } from "./decisions.ts";
import { egressCountry } from "./egress.ts";
import { runLiveGuard } from "./guard.ts";
import { health } from "./health.ts";
import { holdingsView, marketView } from "./market.ts";
import { clearKill, engageKill, killState } from "./killswitch.ts";
import { PROBE_NAMES, runProbe } from "./probes.ts";
import { RateLimiter } from "./ratelimit.ts";
import { attachUserTx, reconcileSubmitted } from "./reconcile.ts";
import { sentryStatus, startSentry } from "./sentry.ts";
import { featuredToken, findToken, listedTokens } from "./tokens.ts";
import { GiftError, GiftService, giftConfigFromEnv } from "./gift-service.ts";

const SERVICE = "bitstock-agent";
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), ...o }));
const ctx = buildContext(process.env);
const decisionLimiter = new RateLimiter(Number(process.env["RATE_LIMIT_PER_MINUTE"] ?? "10"), 60_000);
const readLimiter = new RateLimiter(120, 60_000);
const claimLimiter = new RateLimiter(3, 60_000);
const gift = new GiftService(ctx, giftConfigFromEnv(process.env));
/** Browser origins allowed to call the API (comma-separated): the web app's hosts, nothing else. */
const allowedOrigins = new Set((process.env["PUBLIC_WEB_ORIGIN"] ?? "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean));

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2);

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(json(body));
}

/**
 * The client address for rate limiting. The first X-Forwarded-For entry is whatever the client sent,
 * so it is never trusted; the platform proxy's own header, or the last hop it appended, is used.
 */
function clientKey(req: IncomingMessage): string {
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real) return real;
  const fwd = req.headers["x-forwarded-for"];
  const hops = typeof fwd === "string" ? fwd.split(",").map((h) => h.trim()).filter(Boolean) : [];
  return hops[hops.length - 1] || req.socket.remoteAddress || "unknown";
}

async function readJson(req: IncomingMessage, maxBytes = 8192): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > maxBytes) throw new InputError("The request is too large.");
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new InputError("The request body is not valid JSON.");
  }
}

const admin = (req: IncomingMessage) => isAdmin(req.headers.authorization, process.env["ADMIN_TOKEN"]);

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = req.method ?? "GET";

  // Strict CORS: only the configured web origin may call the API from a browser.
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin");
    res.setHeader("access-control-allow-headers", "content-type, idempotency-key");
    res.setHeader("access-control-allow-methods", "GET, POST");
  }
  if (method === "OPTIONS") return void res.writeHead(204).end();

  // The buy screen lives in the web app. The old signing page that was served here is gone; send visitors to the web app.
  if (path === "/buy" && method === "GET") {
    const web = [...allowedOrigins][0];
    if (web) return void res.writeHead(302, { location: `${web}/buy`, "cache-control": "no-store" }).end();
  }

  if (path === "/healthz" && method === "GET") {
    return send(res, 200, {
      service: SERVICE,
      commit: process.env["RAILWAY_GIT_COMMIT_SHA"] ?? null,
      host: { platform: process.env["RAILWAY_PUBLIC_DOMAIN"] ? "railway" : null, region: process.env["RAILWAY_REPLICA_REGION"] ?? null },
      egress: await egressCountry(),
      variables: variableStatus(process.env),
      ...(await health(ctx)),
      at: new Date().toISOString(),
    });
  }

  if (path === "/v1/config" && method === "GET") {
    const f = await featuredToken(ctx).catch(() => null);
    return send(res, 200, { featured: f ? { address: f.address, symbol: f.symbol } : null, maxBuyUsd: ctx.caps.maxBuyUsd, chainId: 56, killSwitch: killState(ctx.env, ctx.repo).on });
  }

  if (path === "/v1/tokens" && method === "GET") {
    if (!readLimiter.allow(clientKey(req))) return send(res, 429, { error: "Too many requests." });
    const list = await listedTokens(ctx);
    return send(res, 200, { ...list, featured: (await featuredToken(ctx)).symbol });
  }

  if (path === "/v1/market" && method === "GET") {
    if (!readLimiter.allow(clientKey(req))) return send(res, 429, { error: "Too many requests." });
    const want = url.searchParams.get("token");
    const token = want ? await findToken(ctx, want) : await featuredToken(ctx);
    if (!token) return send(res, 404, { error: "That stock is not listed right now." });
    return send(res, 200, await marketView(ctx, token));
  }

  if (path === "/v1/holdings" && method === "GET") {
    if (!readLimiter.allow(clientKey(req))) return send(res, 429, { error: "Too many requests." });
    const wallet = url.searchParams.get("wallet") ?? "";
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return send(res, 400, { error: "The wallet address is not valid." });
    return send(res, 200, await holdingsView(ctx, wallet));
  }

  if (path === "/v1/decisions" && method === "POST") {
    if (!decisionLimiter.allow(clientKey(req))) return send(res, 429, { error: "Too many checks from this address. Wait a minute and try again." });
    const body = await readJson(req);
    const request = validateRequest(body, ctx.caps.maxBuyUsd);
    if (!(await findToken(ctx, request.token))) return send(res, 400, { error: "That stock is not listed right now." });
    const idem = req.headers["idempotency-key"];
    const key = typeof idem === "string" && /^[A-Za-z0-9-]{8,64}$/.test(idem) ? idem : null;
    const record = await makeDecision(ctx, request, key);
    log({ level: "info", msg: "decision", id: record.id, outcome: record.outcome, rulesVersion: record.rulesVersion });
    return send(res, 200, record);
  }

  const m = /^\/v1\/decisions\/([0-9a-f-]{36})(\/tx)?$/.exec(path);
  if (m) {
    if (!readLimiter.allow(clientKey(req))) return send(res, 429, { error: "Too many requests." });
    const id = m[1]!;
    if (!m[2] && method === "GET") {
      const d = ctx.repo.decision(id);
      return d ? send(res, 200, { ...d.record, status: d.status }) : send(res, 404, { error: "No such decision." });
    }
    if (m[2] && method === "POST") {
      const body = (await readJson(req)) as { txHash?: unknown };
      const r = await attachUserTx(ctx, id, body.txHash);
      if (r.ok) log({ level: "info", msg: "user transaction recorded", decision: id });
      return send(res, r.status, r.ok ? { ok: true, status: ctx.repo.decision(id)?.status } : { error: r.message });
    }
  }

  if (path === "/v1/gift" && method === "GET") {
    if (!readLimiter.allow(clientKey(req))) return send(res, 429, { error: "Too many requests." });
    return send(res, 200, gift.status());
  }
  if (path === "/v1/gift/claim" && method === "POST") {
    const h = (n: string) => (typeof req.headers[n] === "string" ? (req.headers[n] as string) : null);
    if (!gift.trustedProxy(h("x-gift-proxy-secret") ?? undefined)) return send(res, 403, { error: "Claims are accepted only through the Bitstock web app." });
    if (!claimLimiter.allow(h("x-claim-ip") ?? clientKey(req))) return send(res, 429, { error: "Too many claims from this address. Wait a minute and try again." });
    const body = (await readJson(req)) as { wallet?: unknown };
    return send(res, 200, await gift.claim(typeof body.wallet === "string" ? body.wallet : "", h("x-claim-country"), h("x-claim-region")));
  }

  const im = /^\/v1\/intents\/([0-9a-f-]{36})$/.exec(path);
  if (im && method === "GET") {
    const i = ctx.repo.intent(im[1]!);
    return i ? send(res, 200, i) : send(res, 404, { error: "No such intent." });
  }

  // ---- admin (bearer token) ----
  if (path.startsWith("/v1/admin/") && !admin(req)) return send(res, 401, { error: "unauthorized" });

  if (path === "/v1/admin/kill" && method === "POST") {
    const body = (await readJson(req)) as { reason?: unknown };
    engageKill(ctx.repo, typeof body.reason === "string" ? body.reason : "engaged by admin");
    log({ level: "warn", msg: "kill switch engaged" });
    return send(res, 200, killState(ctx.env, ctx.repo));
  }
  if (path === "/v1/admin/kill/clear" && method === "POST") {
    const body = (await readJson(req)) as { confirm?: unknown };
    if (!clearKill(ctx.repo, body.confirm)) return send(res, 400, { error: 'Send {"confirm":"clear the kill switch"} to clear it.' });
    log({ level: "warn", msg: "kill switch cleared" });
    return send(res, 200, killState(ctx.env, ctx.repo));
  }
  if (path === "/v1/admin/probe" && method === "GET") {
    const n = Number(url.searchParams.get("n"));
    if (!Number.isInteger(n) || n < 1 || n > 8) return send(res, 400, { error: "n must be an integer from 1 to 8", probes: PROBE_NAMES });
    return send(res, 200, await runProbe(n, process.env));
  }
  if (path === "/v1/admin/guard" && method === "GET") {
    const usd = url.searchParams.get("usd") ?? "";
    const wallet = process.env["PROBE_WALLET_ADDRESS"] ?? "";
    const gtoken = await findToken(ctx, url.searchParams.get("token") ?? "");
    if (!gtoken) return send(res, 400, { error: "token must be a listed symbol or address" });
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(usd)) return send(res, 400, { error: "usd must be a dollar amount like 1 or 2.50" });
    if (!wallet) return send(res, 503, { error: "PROBE_WALLET_ADDRESS is not set" });
    return send(res, 200, await runLiveGuard(process.env, gtoken.address, usd, wallet));
  }
  if (path === "/v1/admin/gift/fund" && method === "POST") return send(res, 200, await gift.fund(url.searchParams.get("usd") ?? ""));
  if (path === "/v1/admin/gift/open" && method === "POST") return send(res, 200, await gift.open());
  if (path === "/v1/admin/gift/close" && method === "POST") return send(res, 200, await gift.close());
  if (path === "/v1/admin/gift/reveal" && method === "POST") return send(res, 200, gift.reveal());
  if (path === "/v1/admin/sentry" && method === "GET") return send(res, 200, sentryStatus(process.env));
  if (path === "/v1/admin/decisions" && method === "GET") {
    const limit = Number(url.searchParams.get("limit") ?? "10");
    return send(res, 200, ctx.repo.recentDecisions(Number.isFinite(limit) ? limit : 10).map((d) => ({ ...d.record, status: d.status })));
  }
  if (/^\/v1\/admin\/decisions\/[0-9a-f-]{36}\/tx$/.test(path) && method === "POST") {
    const body = (await readJson(req)) as { txHash?: unknown };
    const r = await attachUserTx(ctx, path.split("/")[4]!, body.txHash);
    return send(res, r.status, r.ok ? { ok: true, status: ctx.repo.decision(path.split("/")[4]!)?.status } : { error: r.message });
  }

  send(res, 404, { error: "not found" });
}

const port = Number(process.env["PORT"] ?? 3000);
createServer((req, res) => {
  handle(req, res).catch((e: unknown) => {
    if (e instanceof InputError) return send(res, 400, { error: e.message });
    if (e instanceof GiftError) return send(res, e.status, { error: e.message });
    log({ level: "error", msg: e instanceof Error ? e.message : String(e) });
    send(res, 500, { error: "Something went wrong on the server. Nothing was prepared or sent." });
  });
}).listen(port, () => {
  log({ level: "info", msg: "listening", service: SERVICE, port });
  startSentry(process.env, async () => (await listedTokens(ctx)).tokens.map((t) => t.address), log);
  const tick = () => {
    void reconcileSubmitted(ctx, log);
    void gift.reconcileClaims(log);
    void processDueIntents(ctx, log);
  };
  tick();
  setInterval(tick, 30_000).unref();
});
