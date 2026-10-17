/**
 * Mode A's first step for a new wallet: allow the swap contract to spend exactly the buy amount of USDT.
 * The test run fails until this approval is on chain (docs/VERIFIED.md section 3a), so without it a
 * first buy can never pass the guard. Nothing is signed here: the user signs in their own wallet.
 */
import type { BinanceApi } from "@bitstock/binance";
import { approveCalldata, erc20Allowance, isAddress, rpcCall, simulateCall } from "@bitstock/chain";
import { chooseRoute, parseDecimal, type Route } from "@bitstock/guard";

const APPROVAL_TTL_MS = 90_000;
const GAS_HEADROOM_PERCENT = 125n;

/** A reason written for the buyer. */
export class ApprovalError extends Error {}

export interface PreparedApproval {
  /** False when the wallet already allows at least this amount: nothing to sign. */
  needed: boolean;
  spender: string;
  /** USDT smallest units the approval covers: the buy amount, never more. */
  amount: string;
  /** What the wallet allows the spender today. */
  current: string;
  tx: { from: string; to: string; value: string; data: string; gas: string; gasPrice: string; chainId: number } | null;
  expiresAt: number | null;
}

/** The spender named by /approve-transaction (an array with one item in the live response, docs/VERIFIED.md 3a). */
export function findApproveSpender(resp: unknown): string | undefined {
  const items = Array.isArray(resp) ? resp : [resp];
  for (const it of items) {
    const s = typeof it === "object" && it !== null ? (it as { dexContractAddress?: unknown }).dexContractAddress : undefined;
    if (typeof s === "string" && isAddress(s)) return s;
  }
  return undefined;
}

export async function prepareApproval(api: BinanceApi, rpcUrl: string, payToken: string, payDecimals: number, req: { token: string; amountUsd: string; wallet: string }): Promise<PreparedApproval> {
  const amount = (parseDecimal(req.amountUsd) * 10n ** BigInt(payDecimals)) / 10n ** 18n;
  if (amount <= 0n) throw new ApprovalError("the amount must be above zero");

  // Two answers from Binance must agree on the spender before the user is asked to trust it: the route the
  // guard will use, and Binance's own approval endpoint.
  const [routes, approveResp] = await Promise.all([
    api.quote({ fromTokenAddress: payToken, toTokenAddress: req.token, amount: amount.toString(), userWalletAddress: req.wallet }),
    api.approveTransaction({ tokenContractAddress: payToken, approveAmount: amount.toString() }),
  ]);
  const route = Array.isArray(routes) ? chooseRoute(routes as Route[]) : undefined;
  const fromQuote = route?.approveTarget;
  const fromApprove = findApproveSpender(approveResp);
  if (!fromQuote || !isAddress(fromQuote)) throw new ApprovalError("Binance offered no trade that can be tested first, so there is nothing to approve yet");
  if (!fromApprove || fromApprove.toLowerCase() !== fromQuote.toLowerCase()) throw new ApprovalError("Binance named two different contracts to approve, so Bitstock will not ask you to approve either");
  const spender = fromQuote;

  const current = (await erc20Allowance(rpcUrl, payToken, req.wallet, spender)).value;
  if (current >= amount) return { needed: false, spender, amount: amount.toString(), current: current.toString(), tx: null, expiresAt: null };

  // Exactly the buy amount: a larger approval would let a later, wrong trade take more.
  const data = approveCalldata(spender, amount);
  const sim = await simulateCall(rpcUrl, payToken, data, req.wallet);
  if (!sim.ok) throw new ApprovalError("the approval failed its test run, so Bitstock will not ask you to sign it");
  const estimated = await rpcCall<string>(rpcUrl, "eth_estimateGas", [{ from: req.wallet, to: payToken, data, value: "0x0" }])
    .then((r) => BigInt(r.result))
    .catch(() => null);
  if (estimated === null || estimated <= 0n) throw new ApprovalError("the network fee for the approval could not be worked out");
  const gasPrice = BigInt((await rpcCall<string>(rpcUrl, "eth_gasPrice", [])).result);
  return {
    needed: true,
    spender,
    amount: amount.toString(),
    current: current.toString(),
    tx: { from: req.wallet, to: payToken, value: "0", data, gas: ((estimated * GAS_HEADROOM_PERCENT) / 100n).toString(), gasPrice: gasPrice.toString(), chainId: 56 },
    expiresAt: Date.now() + APPROVAL_TTL_MS,
  };
}
