import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BinanceApi } from "../src/api.ts";
import { BinanceClient } from "../src/client.ts";
import { BinanceApiError, BinanceUnavailableError } from "../src/errors.ts";
import { sign } from "../src/sign.ts";

const ok = (data: unknown) => new Response(JSON.stringify({ code: 0, msg: "success", data, success: true }), { status: 200 });
const err = (code: number, msg: string, status = 200) => new Response(JSON.stringify({ code, msg, data: null }), { status });

function make(responses: Response[], extra: Partial<ConstructorParameters<typeof BinanceClient>[0]> = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const sleeps: number[] = [];
  let t = Date.parse("2026-10-10T12:00:00.000Z");
  const client = new BinanceClient({
    apiKey: "key-1",
    apiSecret: "secret-1",
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("no response queued");
      return next;
    }) as unknown as typeof fetch,
    now: () => (t += 5),
    sleep: async (ms) => void sleeps.push(ms),
    ...extra,
  });
  return { client, calls, sleeps };
}

describe("BinanceClient", () => {
  it("sends the /build-prefixed signed path with the documented headers", async () => {
    const { client, calls } = make([ok([])]);
    await new BinanceApi(client).rwaTokens("bstock");
    const call = calls[0]!;
    expect(call.url).toBe("https://web3.binance.com/build/api/v1/dex/market/rwa/tokens?binanceChainId=56&platformId=bstock");
    const h = call.init.headers as Record<string, string>;
    expect(h["X-OC-APIKEY"]).toBe("key-1");
    expect(h["X-OC-SIGN"]).toBe(
      sign({ secret: "secret-1", timestamp: h["X-OC-TIMESTAMP"]!, method: "GET", requestPath: "/build/api/v1/dex/market/rwa/tokens?binanceChainId=56&platformId=bstock", body: "" }),
    );
    expect(h["X-OC-TIMESTAMP"]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("signs the exact JSON body it sends for POST", async () => {
    const { client, calls } = make([ok({ status: "SUCCESS" })]);
    await new BinanceApi(client).simulate({ from: "0x1", to: "0x2", value: "0", data: "0x" });
    const call = calls[0]!;
    const h = call.init.headers as Record<string, string>;
    expect(call.init.body).toBe('{"binanceChainId":"56","evmTx":{"from":"0x1","to":"0x2","value":"0","data":"0x"}}');
    expect(h["X-OC-SIGN"]).toBe(
      sign({ secret: "secret-1", timestamp: h["X-OC-TIMESTAMP"]!, method: "POST", requestPath: "/build/api/v1/dex/pre-transaction/simulate", body: call.init.body as string }),
    );
  });

  it("caches GET responses and does not cache POST", async () => {
    const { client, calls } = make([ok({ n: 1 }), ok({ s: 1 }), ok({ s: 2 })]);
    const api = new BinanceApi(client);
    expect(await api.underlyingProfile("0xabc")).toEqual({ n: 1 });
    expect(await api.underlyingProfile("0xabc")).toEqual({ n: 1 });
    expect(calls).toHaveLength(1);
    await api.simulate({ from: "a", to: "b", value: "0", data: "0x" });
    await api.simulate({ from: "a", to: "b", value: "0", data: "0x" });
    expect(calls).toHaveLength(3);
  });

  it("refetches after the cache expires", async () => {
    let t = 0;
    const { client, calls } = make([ok(1), ok(2)], { now: () => t, cacheTtlMs: 30_000 });
    const api = new BinanceApi(client);
    await api.rwaSearch("nvda");
    t = 29_999;
    await api.rwaSearch("nvda");
    expect(calls).toHaveLength(1);
    t = 30_001;
    await api.rwaSearch("nvda");
    expect(calls).toHaveLength(2);
  });

  it("maps a non-zero code to a plain sentence and keeps the code", async () => {
    const { client } = make([err(40369, "closed")]);
    const e = await new BinanceApi(client).rwaTokens("bstock").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(BinanceApiError);
    expect((e as BinanceApiError).code).toBe(40369);
    expect((e as BinanceApiError).message).toContain("stock exchange is closed");
  });

  it("does not cache failed calls", async () => {
    const { client, calls } = make([err(40369, "closed"), ok([])]);
    const api = new BinanceApi(client);
    await expect(api.rwaSearch("x")).rejects.toBeInstanceOf(BinanceApiError);
    await expect(api.rwaSearch("x")).resolves.toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it("backs off exponentially on HTTP 429 then succeeds", async () => {
    const { client, sleeps, calls } = make([err(42900, "slow", 429), err(42900, "slow", 429), ok("fine")]);
    expect(await new BinanceApi(client).rwaSearch("x")).toBe("fine");
    expect(sleeps).toEqual([1000, 2000]);
    expect(calls).toHaveLength(3);
  });

  it("gives up after the retry limit with the rate-limit error", async () => {
    const { client, calls } = make([err(42900, "s", 429), err(42900, "s", 429), err(42900, "s", 429)], { maxRetries: 2 });
    const e = await new BinanceApi(client).rwaSearch("x").catch((x: unknown) => x);
    expect((e as BinanceApiError).code).toBe(42900);
    expect(calls).toHaveLength(3);
  });

  it("reports unavailable when the network fails or the body is not an envelope", async () => {
    const down = new BinanceClient({ apiKey: "k", apiSecret: "s", fetch: (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch });
    await expect(new BinanceApi(down).rwaSearch("x")).rejects.toBeInstanceOf(BinanceUnavailableError);
    const { client } = make([new Response("<html>blocked</html>", { status: 403 })]);
    await expect(new BinanceApi(client).rwaSearch("x")).rejects.toBeInstanceOf(BinanceUnavailableError);
  });

  it("logs method, path, status, code and latency, and never the key, secret or signature", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bs-"));
    const callLogPath = join(dir, "calls.jsonl");
    const { client } = make([ok([]), err(40369, "closed")], { callLogPath });
    const api = new BinanceApi(client);
    await api.rwaSearch("nvda");
    await api.rwaSearch("zzz").catch(() => undefined);
    const text = readFileSync(callLogPath, "utf8");
    const lines = text.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ method: "GET", path: "/api/v1/dex/market/rwa/search", httpStatus: 200, code: 0, cached: false });
    expect(lines[1]).toMatchObject({ httpStatus: 200, code: 40369 });
    expect(typeof lines[0]!["latencyMs"]).toBe("number");
    expect(text).not.toContain("key-1");
    expect(text).not.toContain("secret-1");
    expect(text.toLowerCase()).not.toContain("x-oc-sign");
  });

  it("requires credentials", () => {
    expect(() => new BinanceClient({ apiKey: "", apiSecret: "" })).toThrow();
  });
});
