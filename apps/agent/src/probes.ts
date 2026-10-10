import { BinanceApi, BinanceClient, findMarketStatus, findSwapTx, type RawResponse } from "@bitstock/binance";
import { ethCall, rpcCall, selector } from "@bitstock/chain";

/** Contract addresses recorded in docs/VERIFIED.md and docs/RESOURCES.md. */
export const NVDAB = "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436";
export const USDT = "0x55d398326f99059fF775485246999027B3197955";
const ONE_USDT = 10n ** 18n;

export interface ProbeOutput {
  probe: number;
  name: string;
  ranAt: string;
  note?: string;
  calls: RawResponse[];
  result?: unknown;
}

function makeApi(env: NodeJS.ProcessEnv, calls: RawResponse[]): BinanceApi {
  const baseUrl = env["BINANCE_WEB3_BASE_URL"];
  return new BinanceApi(
    new BinanceClient({
      apiKey: env["BINANCE_WEB3_API_KEY"] ?? "",
      apiSecret: env["BINANCE_WEB3_API_SECRET"] ?? "",
      ...(baseUrl ? { baseUrl } : {}),
      cacheTtlMs: 0,
      onRaw: (r) => calls.push(r),
    }),
  );
}

/** Run a step; keep going on failure so the raw refusal (for example a region code) is returned. */
async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const decimalString = (units: bigint, decimals: number): string => {
  const s = units.toString().padStart(decimals + 1, "0");
  return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
};

export const PROBE_NAMES: Record<number, string> = {
  1: "RWA tokens (bstock), NVDAB entry and market-status object",
  2: "RWA underlying-profile and underlying-market for NVDAB",
  3: "RWA price for NVDAB",
  4: "Trading quote USDT to NVDAB for $1 and $10, with and without feePercent",
  5: "Swap build and Transaction API simulate, if a SWAP route exists",
  6: "approve-transaction for USDT, both orders",
  7: "On-chain reads of NVDAB",
};

export async function runProbe(n: number, env: NodeJS.ProcessEnv): Promise<ProbeOutput> {
  const calls: RawResponse[] = [];
  const out: ProbeOutput = { probe: n, name: PROBE_NAMES[n] ?? "unknown", ranAt: new Date().toISOString(), calls };
  const api = makeApi(env, calls);
  const wallet = env["PROBE_WALLET_ADDRESS"] ?? "";

  switch (n) {
    case 1: {
      const r = await attempt(() => api.rwaTokens("bstock"));
      if (r.ok) {
        const list = Array.isArray(r.value) ? r.value : [];
        const nvdab = (list as Array<Record<string, unknown>>).find((t) => String(t["tokenContractAddress"]).toLowerCase() === NVDAB.toLowerCase());
        out.result = { count: list.length, nvdab, marketStatusFoundByShape: findMarketStatus(nvdab) };
      } else out.result = { error: r.error };
      return out;
    }
    case 2: {
      const profile = await attempt(() => api.underlyingProfile(NVDAB));
      const market = await attempt(() => api.underlyingMarket(NVDAB));
      out.result = { profile: profile.ok ? profile.value : { error: profile.error }, market: market.ok ? market.value : { error: market.error } };
      return out;
    }
    case 3: {
      const r = await attempt(() => api.rwaPrice([NVDAB]));
      out.result = r.ok ? r.value : { error: r.error };
      return out;
    }
    case 4: {
      if (!wallet) return { ...out, note: "PROBE_WALLET_ADDRESS is not set; the quote needs a user wallet address." };
      const results: Record<string, unknown> = {};
      for (const usd of [1n, 10n]) {
        for (const fee of [false, true]) {
          const key = `$${usd}${fee ? " with feePercent=0.15 feeSource=FROM_TOKEN" : ""}`;
          const r = await attempt(() =>
            api.quote({
              fromTokenAddress: USDT,
              toTokenAddress: NVDAB,
              amount: (usd * ONE_USDT).toString(),
              userWalletAddress: wallet,
              ...(fee ? { feePercent: "0.15", feeSource: "FROM_TOKEN" } : {}),
            }),
          );
          results[key] = r.ok ? r.value : { error: r.error };
        }
      }
      out.result = results;
      return out;
    }
    case 5: {
      if (!wallet) return { ...out, note: "PROBE_WALLET_ADDRESS is not set; the swap build needs a user wallet address." };
      const amount = (1n * ONE_USDT).toString();
      const q = await attempt(() => api.quote({ fromTokenAddress: USDT, toTokenAddress: NVDAB, amount, userWalletAddress: wallet }));
      if (!q.ok) return { ...out, result: { quoteError: q.error } };
      const routes = findRoutes(q.value);
      const route = routes.find((x) => x["executionMode"] === "SWAP");
      if (!route) return { ...out, note: "No SWAP route in the quote; RFQ routes cannot be dry-run.", result: { routes } };
      const s = await attempt(() =>
        api.swap({ fromTokenAddress: USDT, toTokenAddress: NVDAB, amount, userWalletAddress: wallet, quoteId: String(route["quoteId"]), slippagePercent: "0.5", vendor: String(route["vendorName"]) }),
      );
      if (!s.ok) return { ...out, result: { swapError: s.error } };
      const tx = findSwapTx(s.value);
      if (!tx) return { ...out, note: "Swap response had no object with from/to/data.", result: { swap: s.value } };
      const sim = await attempt(() => api.simulate({ from: tx.from, to: tx.to, value: String(tx.value ?? "0"), data: tx.data }));
      out.result = { simulation: sim.ok ? sim.value : { error: sim.error } };
      return out;
    }
    case 6: {
      const amount = (1n * ONE_USDT).toString();
      const results: Record<string, unknown> = {};
      const noVendor = await attempt(() => api.approveTransaction({ tokenContractAddress: USDT, approveAmount: amount }));
      results["without vendor (before any quote)"] = noVendor.ok ? noVendor.value : { error: noVendor.error };
      const withVendor = await attempt(() => api.approveTransaction({ tokenContractAddress: USDT, approveAmount: amount, vendor: "LiquidMesh" }));
      results["with vendor=LiquidMesh"] = withVendor.ok ? withVendor.value : { error: withVendor.error };
      if (wallet) {
        const q = await attempt(() => api.quote({ fromTokenAddress: USDT, toTokenAddress: NVDAB, amount, userWalletAddress: wallet }));
        results["quote (for the after-quote order)"] = q.ok ? { routes: findRoutes(q.value).map((r) => ({ vendorName: r["vendorName"], executionMode: r["executionMode"] })) } : { error: q.error };
        const after = await attempt(() => api.approveTransaction({ tokenContractAddress: USDT, approveAmount: amount, vendor: "LiquidMesh" }));
        results["with vendor, after the quote"] = after.ok ? after.value : { error: after.error };
      } else out.note = "PROBE_WALLET_ADDRESS is not set, so the after-quote order was not run.";
      out.result = results;
      return out;
    }
    case 7: {
      const url = env["BSC_RPC_URL"] ?? "";
      if (!url) return { ...out, note: "BSC_RPC_URL is not set." };
      const reads: Record<string, unknown> = {};
      for (const sig of ["symbol()", "decimals()", "uiMultiplier()", "newUIMultiplier()", "effectiveAt()"]) {
        const r = await attempt(() => ethCall(url, NVDAB, selector(sig)));
        reads[sig] = r.ok ? r.value.result : { error: r.error };
      }
      const t = await attempt(() => ethCall(url, NVDAB, selector("toUIAmount(uint256)") + ONE_USDT.toString(16).padStart(64, "0")));
      reads["toUIAmount(1e18)"] = t.ok ? t.value.result : { error: t.error };
      const block = await attempt(() => rpcCall<string>(url, "eth_blockNumber", []));
      reads["blockNumber"] = block.ok ? parseInt(block.value.result, 16) : { error: block.error };
      const ui = reads["uiMultiplier()"];
      if (typeof ui === "string") reads["uiMultiplierDecimal"] = decimalString(BigInt(ui), 18);
      out.result = reads;
      return out;
    }
    default:
      return { ...out, note: "Probe number must be 1 to 7." };
  }
}

/** The quote response lists routes; find them by shape (objects carrying a quoteId). */
function findRoutes(data: unknown): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const walk = (node: unknown, depth: number): void => {
    if (depth > 5 || typeof node !== "object" || node === null) return;
    if (Array.isArray(node)) return void node.forEach((x) => walk(x, depth + 1));
    const o = node as Record<string, unknown>;
    if (typeof o["quoteId"] === "string") found.push(o);
    else Object.values(o).forEach((x) => walk(x, depth + 1));
  };
  walk(data, 0);
  return found;
}
