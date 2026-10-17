import { afterEach, describe, expect, it, vi } from "vitest";
import type { BinanceApi } from "@bitstock/binance";
import { ApprovalError, findApproveSpender, prepareApproval } from "../src/approve.ts";

// Fixtures: fake addresses, only ever used inside this test.
const USDT = "0x" + "55".repeat(20);
const TOKEN = "0x" + "02".repeat(20);
const WALLET = "0x" + "11".repeat(20);
const ROUTER = "0x" + "b4".repeat(20);
const ONE = 10n ** 18n;
const word = (n: bigint) => "0x" + n.toString(16).padStart(64, "0");

function fakeApi(spenderFromQuote: string | undefined, spenderFromApprove: string | undefined): BinanceApi {
  return {
    quote: async () => [{ executionMode: "SWAP", isBest: true, quoteId: "q", toTokenAmount: "5", ...(spenderFromQuote ? { approveTarget: spenderFromQuote } : {}) }],
    approveTransaction: async () => [{ data: "0x", ...(spenderFromApprove ? { dexContractAddress: spenderFromApprove } : {}), gasLimit: "70000", gasPrice: "1" }],
  } as unknown as BinanceApi;
}

function stubRpc(opts: { allowance: bigint; approveOk?: boolean; estimate?: string | null }): Array<{ method: string; params: unknown[] }> {
  const seen: Array<{ method: string; params: unknown[] }> = [];
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    const { method, params } = JSON.parse(init.body) as { method: string; params: Array<{ data?: string }> };
    seen.push({ method, params });
    const reply = (body: object) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }), { headers: { "content-type": "application/json" } });
    if (method === "eth_call") {
      const data = params[0]?.data ?? "";
      if (data.startsWith("0xdd62ed3e")) return reply({ result: word(opts.allowance) });
      if (data.startsWith("0x095ea7b3")) return opts.approveOk === false ? reply({ error: { code: 3, message: "execution reverted" } }) : reply({ result: word(1n) });
    }
    if (method === "eth_estimateGas") return opts.estimate === null ? reply({ error: { code: -32000, message: "cannot estimate" } }) : reply({ result: opts.estimate ?? "0xb5b0" });
    if (method === "eth_gasPrice") return reply({ result: "0x3b9aca00" });
    return reply({ result: null });
  });
  return seen;
}

const req = { token: TOKEN, amountUsd: "1", wallet: WALLET };
afterEach(() => vi.unstubAllGlobals());

describe("preparing a USDT approval", () => {
  it("approves exactly the buy amount to the spender both Binance answers agree on", async () => {
    stubRpc({ allowance: 0n });
    const a = await prepareApproval(fakeApi(ROUTER, ROUTER.toUpperCase().replace("0X", "0x")), "http://rpc.test", USDT, 18, req);
    expect(a.needed).toBe(true);
    expect(a.amount).toBe(ONE.toString());
    expect(a.tx?.to).toBe(USDT);
    // approve(spender, amount): the selector, the spender, then exactly 1 USDT, never an unlimited amount.
    expect(a.tx?.data).toBe("0x095ea7b3" + ROUTER.slice(2).padStart(64, "0") + ONE.toString(16).padStart(64, "0"));
    expect(a.tx?.gas).toBe(((0xb5b0n * 125n) / 100n).toString());
  });
  it("asks for nothing when the wallet already allows enough", async () => {
    const seen = stubRpc({ allowance: ONE });
    const a = await prepareApproval(fakeApi(ROUTER, ROUTER), "http://rpc.test", USDT, 18, req);
    expect(a).toMatchObject({ needed: false, tx: null });
    expect(seen.some((s) => s.method === "eth_estimateGas")).toBe(false);
  });
  it("refuses when the two Binance answers name different spenders, or none", async () => {
    stubRpc({ allowance: 0n });
    await expect(prepareApproval(fakeApi(ROUTER, "0x" + "99".repeat(20)), "http://rpc.test", USDT, 18, req)).rejects.toThrow(ApprovalError);
    await expect(prepareApproval(fakeApi(ROUTER, undefined), "http://rpc.test", USDT, 18, req)).rejects.toThrow(/two different contracts/);
    await expect(prepareApproval(fakeApi(undefined, ROUTER), "http://rpc.test", USDT, 18, req)).rejects.toThrow(/no trade/);
  });
  it("refuses when the approval's test run or its gas estimate fails", async () => {
    stubRpc({ allowance: 0n, approveOk: false });
    await expect(prepareApproval(fakeApi(ROUTER, ROUTER), "http://rpc.test", USDT, 18, req)).rejects.toThrow(/test run/);
    stubRpc({ allowance: 0n, estimate: null });
    await expect(prepareApproval(fakeApi(ROUTER, ROUTER), "http://rpc.test", USDT, 18, req)).rejects.toThrow(/network fee/);
  });
  it("finds the spender in the live approve-transaction shape", () => {
    expect(findApproveSpender([{ data: "0x", dexContractAddress: ROUTER }])).toBe(ROUTER);
    expect(findApproveSpender({ dexContractAddress: "not an address" })).toBeUndefined();
  });
});
