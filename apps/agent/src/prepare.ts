/**
 * Builds the final Mode A transaction from the quote the guard checked, at the slippage the decision
 * allows, and dry-runs it again. Nothing is signed here: the user signs in their own wallet.
 */
import { findSwapTx, type BinanceApi, type SimulationResult } from "@bitstock/binance";
import { rpcCall } from "@bitstock/chain";
import { checkSimulation, type GuardRun, type PreparedTx } from "@bitstock/guard";

const PREPARED_TTL_MS = 90_000;

/** A reason written for the buyer. Any other error while preparing is shown as a generic sentence. */
export class PrepareError extends Error {}
const GAS_HEADROOM_PERCENT = 125n;

export async function prepareTransaction(api: BinanceApi, rpcUrl: string, run: GuardRun, payToken: string): Promise<PreparedTx> {
  const { record, route, amountUnits } = run;
  if (!route?.quoteId || !record.limits) throw new PrepareError("there is no checked trade to prepare");
  const req = record.request;
  const swap = await api.swap({
    fromTokenAddress: payToken,
    toTokenAddress: req.token,
    amount: amountUnits.toString(),
    userWalletAddress: req.wallet,
    quoteId: route.quoteId,
    slippagePercent: record.limits.slippagePercent,
    ...(route.vendorName ? { vendor: route.vendorName } : {}),
  });
  const tx = findSwapTx(swap);
  if (!tx) throw new PrepareError("Binance did not return the trade to sign");
  const sim = (await api.simulate({ from: tx.from, to: tx.to, value: String(tx.value ?? "0"), data: tx.data })) as SimulationResult;
  const check = checkSimulation({ source: "final", asOf: new Date().toISOString(), value: sim }, req.token, req.wallet, { tx: { from: tx.from, to: tx.to, value: String(tx.value ?? "0") }, expectedTo: route.approveTarget }, { spend: { token: payToken, maxUnits: amountUnits } });
  if (check.result !== "pass") throw new PrepareError("the final trade failed its test run, so Bitstock will not send it");

  // Gas: never the swap's own figure alone. It was 250000 where the swap used 939279 (docs/DX_EVIDENCE.md),
  // so without the node's estimate the trade would likely run out of gas and the buyer would pay for nothing.
  const fromSwap = tx.gas ? BigInt(tx.gas) : 0n;
  const estimated = await rpcCall<string>(rpcUrl, "eth_estimateGas", [{ from: tx.from, to: tx.to, data: tx.data, value: "0x0" }])
    .then((r) => BigInt(r.result))
    .catch(() => null);
  if (estimated === null || estimated <= 0n) throw new PrepareError("the network fee for the final trade could not be worked out, so Bitstock will not ask you to sign it");
  const base = estimated > fromSwap ? estimated : fromSwap;
  const gas = (base * GAS_HEADROOM_PERCENT) / 100n;
  const nodePrice = BigInt((await rpcCall<string>(rpcUrl, "eth_gasPrice", [])).result);
  const swapPrice = tx.gasPrice ? BigInt(tx.gasPrice) : 0n;
  const gasPrice = nodePrice > swapPrice ? nodePrice : swapPrice;

  const arriving = sim.balanceChanges?.find((c) => c.contractAddress.toLowerCase() === req.token.toLowerCase() && c.owner.toLowerCase() === req.wallet.toLowerCase());
  return {
    from: tx.from,
    to: tx.to,
    value: String(tx.value ?? "0"),
    data: tx.data,
    gas: gas.toString(),
    gasPrice: gasPrice.toString(),
    chainId: 56,
    slippagePercent: record.limits.slippagePercent,
    minReceiveAmount: typeof tx["minReceiveAmount"] === "string" ? (tx["minReceiveAmount"] as string) : null,
    simulation: { status: sim.status, stockArriving: arriving?.change ?? null },
    gasSources: { swapResponse: tx.gas ?? null, nodeEstimate: estimated.toString(), headroomPercent: "25" },
    expiresAt: Date.now() + PREPARED_TTL_MS,
  };
}
