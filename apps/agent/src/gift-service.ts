/**
 * The gift: fund the vault (USDT into the gift token through Binance's Trading API, tested first),
 * open a campaign with committed boxes, and pay claims with the relayer, which pays the network fee
 * so a recipient with no BNB can receive. Every send is tested first with eth_call or the Transaction
 * API, capped, stopped by the kill switch, and recorded with its real gas cost (AGENTS.md 0.4, 9).
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { findSwapTx, type SimulationResult } from "@bitstock/binance";
import {
  addressFromPrivateKey, approveCalldata, erc20Allowance, erc20BalanceOf, getReceipt, isAddress, prepareCall, rpcCall, sendRawTransaction, simulateCall, transferFromCalldata, waitForReceipt,
  type Receipt,
} from "@bitstock/chain";
import { chooseRoute, parseDecimal, type Route } from "@bitstock/guard";
import type { AgentContext } from "./context.ts";
import { BOX_WEIGHTS, assignmentText, boxAmounts, commitment, newSecret, shuffle } from "./gift.ts";
import { killState } from "./killswitch.ts";
import { USDT } from "./probes.ts";

export interface GiftConfig {
  token: string | null;
  vault: string | null;
  vaultKey: string | null;
  relayer: string | null;
  relayerKey: string | null;
  proxySecret: string | null;
  maxCampaignUsd: string;
  /** USDT the vault may hold beyond the campaign, for test sends (AGENTS.md 0.4). */
  testPoolUsd: string;
  maxRelayerBnbWei: bigint;
  claimDays: number;
}

const KEY_RE = /^(0x)?[0-9a-fA-F]{64}$/;

export function giftConfigFromEnv(env: NodeJS.ProcessEnv): GiftConfig {
  const vaultKey = env["GIFT_VAULT_PRIVATE_KEY"] || null;
  const relayerKey = env["GIFT_RELAYER_PRIVATE_KEY"] || null;
  if (vaultKey && !KEY_RE.test(vaultKey)) throw new Error("GIFT_VAULT_PRIVATE_KEY is not a 32-byte hex key");
  if (relayerKey && !KEY_RE.test(relayerKey)) throw new Error("GIFT_RELAYER_PRIVATE_KEY is not a 32-byte hex key");
  // Which stock the gift gives is the operator's choice, never a default in code.
  const token = env["GIFT_TOKEN"] || null;
  if (token && !isAddress(token)) throw new Error("GIFT_TOKEN must be a token address");
  if ((vaultKey || relayerKey) && !token) throw new Error("GIFT_TOKEN must name the stock the gift gives");
  const maxCampaignUsd = env["GIFT_CAMPAIGN_MAX_USD"] || "1";
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(maxCampaignUsd)) throw new Error("GIFT_CAMPAIGN_MAX_USD must be a dollar amount");
  const testPoolUsd = env["GIFT_TEST_POOL_USD"] || "1";
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(testPoolUsd)) throw new Error("GIFT_TEST_POOL_USD must be a dollar amount");
  const maxBnb = env["GIFT_RELAYER_MAX_BNB"] || "0.01";
  if (!/^\d+(\.\d{1,18})?$/.test(maxBnb) || parseDecimal(maxBnb) > parseDecimal("0.01")) throw new Error("GIFT_RELAYER_MAX_BNB must be at most 0.01 (AGENTS.md 0.4)");
  const claimDays = Number(env["GIFT_CLAIM_DAYS"] || "7");
  if (!Number.isInteger(claimDays) || claimDays < 1 || claimDays > 60) throw new Error("GIFT_CLAIM_DAYS must be 1 to 60");
  const k = (v: string) => (v.startsWith("0x") ? v : `0x${v}`);
  return {
    token: token ? token.toLowerCase() : null,
    vault: vaultKey ? addressFromPrivateKey(k(vaultKey)).toLowerCase() : null,
    vaultKey: vaultKey ? k(vaultKey) : null,
    relayer: relayerKey ? addressFromPrivateKey(k(relayerKey)).toLowerCase() : null,
    relayerKey: relayerKey ? k(relayerKey) : null,
    proxySecret: env["GIFT_PROXY_SECRET"] || null,
    maxCampaignUsd,
    testPoolUsd,
    maxRelayerBnbWei: parseDecimal(maxBnb), // 18-decimal fixed point equals wei
    claimDays,
  };
}

export class GiftError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

interface Campaign {
  id: string; created_at: string; token: string; received: string; boxes: string; commitment: string; secret: string;
  status: string; expires_at: string; revealed: number; fund: string | null; approve_tx: string | null;
}
interface Claim {
  id: string; campaign_id: string; box_index: number; wallet: string; amount: string; status: string; tx_hash: string | null;
  gas_used: string | null; fee_wei: string | null; created_at: string; error: string | null; nonce: string | null;
}

/** Restricted places, the same list the web app blocks (AGENTS.md 0.5). */
const BLOCKED = new Set(["US", "GU", "MP", "PR", "VI", "AS", "UM", "CA", "NL", "GB", "JP", "IR", "CU", "KP"]);
const BLOCKED_UA = new Set(["43", "40", "14", "09"]);
export function claimRegionAllowed(country: string | null, region: string | null): boolean {
  const c = (country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return false; // unknown region: no claim
  if (BLOCKED.has(c)) return false;
  if (c === "UA" && BLOCKED_UA.has((region ?? "").trim().toUpperCase().replace(/^UA-/, ""))) return false;
  return true;
}

export class GiftService {
  readonly #db: DatabaseSync;
  #queue: Promise<unknown> = Promise.resolve();

  readonly ctx: AgentContext;
  readonly cfg: GiftConfig;

  constructor(ctx: AgentContext, cfg: GiftConfig) {
    this.ctx = ctx;
    this.cfg = cfg;
    const path = join(ctx.env["DATA_DIR"] || "./data", "bitstock.sqlite");
    mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS gift_campaigns (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, token TEXT NOT NULL, received TEXT NOT NULL, boxes TEXT NOT NULL,
        commitment TEXT NOT NULL, secret TEXT NOT NULL, status TEXT NOT NULL, expires_at TEXT NOT NULL,
        revealed INTEGER NOT NULL DEFAULT 0, fund TEXT, approve_tx TEXT
      );
      CREATE TABLE IF NOT EXISTS gift_claims (
        id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, box_index INTEGER NOT NULL, wallet TEXT NOT NULL, amount TEXT NOT NULL,
        status TEXT NOT NULL, tx_hash TEXT, gas_used TEXT, fee_wei TEXT, created_at TEXT NOT NULL, error TEXT,
        UNIQUE(campaign_id, wallet), UNIQUE(campaign_id, box_index)
      );
      CREATE TABLE IF NOT EXISTS gift_funding (id TEXT PRIMARY KEY, at TEXT NOT NULL, record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS gift_claim_history (
        id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, box_index INTEGER NOT NULL, wallet TEXT NOT NULL, amount TEXT NOT NULL,
        status TEXT NOT NULL, tx_hash TEXT, gas_used TEXT, fee_wei TEXT, created_at TEXT NOT NULL, error TEXT, nonce TEXT, settled_at TEXT NOT NULL
      );
    `);
    // The relayer nonce of each claim, so a claim the network dropped is told apart from one still on its way.
    const cols = (this.#db.prepare("PRAGMA table_info(gift_claims)").all() as Array<{ name: string }>).map((c) => c.name);
    if (!cols.includes("nonce")) this.#db.exec("ALTER TABLE gift_claims ADD COLUMN nonce TEXT");
  }

  /** Close the database handle (tests, shutdown). */
  dispose(): void {
    this.#db.close();
  }

  /** The vault may hold at most the campaign cap plus the test pool in USDT (AGENTS.md 0.4). */
  #vaultCapWei(): bigint {
    return parseDecimal(this.cfg.maxCampaignUsd) + parseDecimal(this.cfg.testPoolUsd); // USDT on BSC has 18 decimals, like the fixed point
  }

  async #checkVaultCap(vault: string): Promise<bigint> {
    const bal = (await erc20BalanceOf(this.ctx.rpcUrl, USDT, vault)).value;
    if (bal > this.#vaultCapWei()) {
      throw new GiftError(`The vault holds more USDT than its cap of $${this.cfg.maxCampaignUsd} plus a $${this.cfg.testPoolUsd} test pool, so it will not send until that is fixed.`, 503);
    }
    return bal;
  }

  /**
   * A claim whose transfer reverted moved nothing. It leaves the live table, so its box and its wallet are free
   * again, and is kept in the history with its real network fee.
   */
  #retire(id: string, status: string, gasUsed: string | null, feeWei: string | null): Claim | undefined {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const c = this.#db.prepare("SELECT * FROM gift_claims WHERE id = ?").get(id) as unknown as Claim | undefined;
      if (c) {
        this.#db.prepare("INSERT INTO gift_claim_history (id, campaign_id, box_index, wallet, amount, status, tx_hash, gas_used, fee_wei, created_at, error, nonce, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(c.id, c.campaign_id, c.box_index, c.wallet, c.amount, status, c.tx_hash, gasUsed, feeWei, c.created_at, c.error, c.nonce ?? null, new Date().toISOString());
        this.#db.prepare("DELETE FROM gift_claims WHERE id = ?").run(id);
      }
      this.#db.exec("COMMIT");
      return c ? { ...c, status, gas_used: gasUsed, fee_wei: feeWei } : undefined;
    } catch (e) {
      this.#db.exec("ROLLBACK");
      throw e;
    }
  }

  /** Record a claim's receipt: confirmed stays; reverted is retired so the box can be claimed again. */
  #settle(id: string, r: Receipt): Claim | undefined {
    const fee = (r.gasUsed * r.effectiveGasPrice).toString();
    if (r.status === "success") {
      this.#db.prepare("UPDATE gift_claims SET status = 'confirmed', gas_used = ?, fee_wei = ? WHERE id = ?").run(r.gasUsed.toString(), fee, id);
      return this.#db.prepare("SELECT * FROM gift_claims WHERE id = ?").get(id) as unknown as Claim | undefined;
    }
    return this.#retire(id, "reverted", r.gasUsed.toString(), fee);
  }

  /** One send at a time, so nonces and box picks never race. */
  #serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(fn, fn);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  #token(): string {
    if (!this.cfg.token) throw new GiftError("The gift stock is not configured (GIFT_TOKEN).", 503);
    return this.cfg.token;
  }

  #requireKeys(): { vault: string; vaultKey: string; relayer: string; relayerKey: string } {
    const { vault, vaultKey, relayer, relayerKey } = this.cfg;
    if (!vault || !vaultKey || !relayer || !relayerKey) throw new GiftError("The gift wallets are not configured.", 503);
    if (vault === relayer) throw new GiftError("The vault and the relayer must be different wallets.", 503);
    return { vault, vaultKey, relayer, relayerKey };
  }

  #notKilled(): void {
    if (killState(this.ctx.env, this.ctx.repo).on) throw new GiftError("Bitstock is paused by its operator, so nothing can be sent right now.", 503);
  }

  current(): Campaign | null {
    return (this.#db.prepare("SELECT * FROM gift_campaigns ORDER BY created_at DESC LIMIT 1").get() as unknown as Campaign | undefined) ?? null;
  }

  async #send(key: string, from: string, to: string, data: string, minGas?: bigint): Promise<{ hash: string; gasUsed: bigint; feeWei: bigint; status: string }> {
    const prepared = await prepareCall(this.ctx.rpcUrl, key, from, to, data, minGas !== undefined ? { minGas } : {});
    const hash = await sendRawTransaction(this.ctx.txRpcUrl, prepared.signed.raw);
    const r = await waitForReceipt(this.ctx.txRpcUrl, hash, 120_000);
    return { hash, gasUsed: r.gasUsed, feeWei: r.gasUsed * r.effectiveGasPrice, status: r.status };
  }

  /** Swap `usd` USDT in the vault into the gift token. Tested with the Transaction API before signing. */
  fund(usd: string): Promise<Record<string, unknown>> {
    return this.#serial(async () => {
      this.#notKilled();
      const { vault, vaultKey } = this.#requireKeys();
      if (!/^\d{1,4}(\.\d{1,2})?$/.test(usd) || parseDecimal(usd) <= 0n) throw new GiftError("usd must be a dollar amount above zero.");
      if (parseDecimal(usd) > parseDecimal(this.cfg.maxCampaignUsd)) throw new GiftError(`The campaign cap is $${this.cfg.maxCampaignUsd}.`);
      const amount = parseDecimal(usd); // USDT on BSC has 18 decimals, like the fixed point
      const usdtBal = await this.#checkVaultCap(vault);
      if (usdtBal < amount) throw new GiftError("The vault does not hold enough USDT.");
      const routes = (await this.ctx.api.quote({ fromTokenAddress: USDT, toTokenAddress: this.#token(), amount: amount.toString(), userWalletAddress: vault })) as Route[];
      const route = Array.isArray(routes) ? chooseRoute(routes) : undefined;
      if (!route?.quoteId || !route.approveTarget) throw new GiftError("Binance offered no testable swap route for the funding swap.", 502);
      const record: Record<string, unknown> = { at: new Date().toISOString(), usd, route: { vendor: route.vendorName, mode: route.executionMode, impact: route.priceImpactPercent, out: route.toTokenAmount, spender: route.approveTarget } };
      const allowance = (await erc20Allowance(this.ctx.rpcUrl, USDT, vault, route.approveTarget)).value;
      if (allowance < amount) {
        const data = approveCalldata(route.approveTarget, amount);
        const sim = await simulateCall(this.ctx.rpcUrl, USDT, data, vault);
        if (!sim.ok) throw new GiftError(`The USDT approval would fail: ${sim.reason}`, 502);
        const a = await this.#send(vaultKey, vault, USDT, data);
        record["approve"] = { tx: a.hash, status: a.status, gasUsed: a.gasUsed.toString(), feeWei: a.feeWei.toString() };
        if (a.status !== "success") throw new GiftError(`The USDT approval reverted: ${a.hash}`, 502);
      }
      const swap = await this.ctx.api.swap({ fromTokenAddress: USDT, toTokenAddress: this.#token(), amount: amount.toString(), userWalletAddress: vault, quoteId: route.quoteId, slippagePercent: this.ctx.cfg.defaultSlippagePercent, ...(route.vendorName ? { vendor: route.vendorName } : {}) });
      const tx = findSwapTx(swap);
      if (!tx || tx.to.toLowerCase() !== route.approveTarget.toLowerCase() || tx.from.toLowerCase() !== vault || BigInt(tx.value || "0") !== 0n) throw new GiftError("The swap Binance built does not match its quote, so it was not sent.", 502);
      const sim = (await this.ctx.api.simulate({ from: tx.from, to: tx.to, value: "0", data: tx.data })) as SimulationResult;
      const arriving = sim.balanceChanges?.find((c) => c.contractAddress.toLowerCase() === this.#token() && c.owner.toLowerCase() === vault && /^\d+$/.test(c.change) && BigInt(c.change) > 0n);
      // The swap must also take no more USDT than the amount asked for: the vault's approval may be larger.
      const usdtLines = (sim.balanceChanges ?? []).filter((c) => c.contractAddress.toLowerCase() === USDT.toLowerCase() && c.owner.toLowerCase() === vault);
      const usdtValid = usdtLines.length > 0 && usdtLines.every((c) => /^-?\d+$/.test(c.change));
      const usdtSpent = usdtValid ? -usdtLines.reduce((sum, c) => sum + BigInt(c.change), 0n) : null;
      record["simulation"] = { status: sim.status, arriving: arriving?.change ?? null, usdtSpent: usdtSpent?.toString() ?? null };
      if (sim.status !== "SUCCESS" || !arriving) throw new GiftError("The funding swap failed its test run, so it was not sent.", 502);
      if (usdtSpent === null || usdtSpent <= 0n || usdtSpent > amount) throw new GiftError("The funding swap's test run would not take exactly the USDT asked for, so it was not sent.", 502);
      const before = (await erc20BalanceOf(this.ctx.rpcUrl, this.#token(), vault)).value;
      const s = await this.#send(vaultKey, vault, tx.to, tx.data, tx.gas ? (BigInt(tx.gas) * 125n) / 100n : undefined);
      const after = (await erc20BalanceOf(this.ctx.rpcUrl, this.#token(), vault)).value;
      record["swap"] = { tx: s.hash, status: s.status, gasUsed: s.gasUsed.toString(), feeWei: s.feeWei.toString(), received: (after - before).toString() };
      this.#db.prepare("INSERT INTO gift_funding (id, at, record) VALUES (?, ?, ?)").run(randomUUID(), String(record["at"]), JSON.stringify(record));
      if (s.status !== "success") throw new GiftError(`The funding swap reverted: ${s.hash}`, 502);
      return record;
    });
  }

  /** Open a campaign over what the last funding swap actually received: commit the boxes, approve the relayer. */
  open(): Promise<Record<string, unknown>> {
    return this.#serial(async () => {
      this.#notKilled();
      const { vault, vaultKey, relayer } = this.#requireKeys();
      const cur = this.current();
      if (cur && cur.status === "open") throw new GiftError("A gift is already open.", 409);
      await this.#checkVaultCap(vault);
      const last = this.#db.prepare("SELECT record FROM gift_funding ORDER BY at DESC LIMIT 1").get() as { record: string } | undefined;
      const funded = last ? (JSON.parse(last.record) as { swap?: { received?: string; status?: string; tx?: string } }) : null;
      if (!funded?.swap?.received || funded.swap.status !== "success") throw new GiftError("Fund the vault first; boxes come from what was actually received.", 409);
      const received = BigInt(funded.swap.received);
      const held = (await erc20BalanceOf(this.ctx.rpcUrl, this.#token(), vault)).value;
      if (held < received) throw new GiftError("The vault holds less than the funding swap received.", 409);
      const boxes = boxAmounts(received);
      const order = shuffle(boxes);
      const text = assignmentText(order);
      const secret = newSecret();
      const c = commitment(text, secret);
      const total = order.reduce((a, b) => a + b, 0n);
      const data = approveCalldata(relayer, total);
      const sim = await simulateCall(this.ctx.rpcUrl, this.#token(), data, vault);
      if (!sim.ok) throw new GiftError(`Approving the relayer would fail: ${sim.reason}`, 502);
      const a = await this.#send(vaultKey, vault, this.#token(), data);
      if (a.status !== "success") throw new GiftError(`Approving the relayer reverted: ${a.hash}`, 502);
      const id = randomUUID();
      const expires = new Date(Date.now() + this.cfg.claimDays * 86_400_000).toISOString();
      this.#db.prepare("INSERT INTO gift_campaigns (id, created_at, token, received, boxes, commitment, secret, status, expires_at, fund, approve_tx) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)")
        .run(id, new Date().toISOString(), this.#token(), received.toString(), text, c, secret, expires, funded.swap.tx ?? null, a.hash);
      return { id, commitment: c, boxes: boxes.map(String), expiresAt: expires, approveTx: a.hash };
    });
  }

  /** Pay one box to `wallet`. The caller has checked the region; this checks it again from the forwarded headers. */
  claim(wallet: string, country: string | null, region: string | null): Promise<Record<string, unknown>> {
    return this.#serial(async () => {
      this.#notKilled();
      const { vault, relayer, relayerKey } = this.#requireKeys();
      if (!isAddress(wallet)) throw new GiftError("The wallet address is not valid.");
      if (!claimRegionAllowed(country, region)) throw new GiftError("Claims are not available in your region.", 451);
      const cur = this.current();
      if (!cur || cur.status !== "open") throw new GiftError("The gift is not open.", 409);
      if (Date.parse(cur.expires_at) < Date.now()) throw new GiftError("The gift has ended.", 409);
      const w = wallet.toLowerCase();
      if (w === vault || w === relayer) throw new GiftError("That wallet cannot claim.");
      const existing = this.#db.prepare("SELECT * FROM gift_claims WHERE campaign_id = ? AND wallet = ?").get(cur.id, w) as unknown as Claim | undefined;
      // A claim that failed before anything was broadcast moved nothing, so that wallet and box are free again.
      if (existing && existing.status === "failed" && !existing.tx_hash) this.#db.prepare("DELETE FROM gift_claims WHERE id = ?").run(existing.id);
      else if (existing) return { already: true, ...this.#publicClaim(existing) };
      const order = (JSON.parse(cur.boxes) as string[]).map((b) => BigInt(b));
      const taken = new Set((this.#db.prepare("SELECT box_index FROM gift_claims WHERE campaign_id = ?").all(cur.id) as Array<{ box_index: number }>).map((r) => r.box_index));
      const index = order.findIndex((_, i) => !taken.has(i));
      if (index < 0) throw new GiftError("Every box has been claimed.", 409);
      const amount = order[index]!;
      // The cap: never more than the largest box. It is worked out again from what the funding swap received,
      // not from the stored order, so a wrong or altered order cannot raise it.
      const largest = boxAmounts(BigInt(cur.received)).reduce((a, b) => (b > a ? b : a), 0n);
      if (amount <= 0n || amount > largest) throw new GiftError("The box is larger than the cap, so nothing was sent.", 500);
      const bnb = BigInt((await rpcCall<string>(this.ctx.rpcUrl, "eth_getBalance", [relayer, "latest"])).result);
      if (bnb > this.cfg.maxRelayerBnbWei) throw new GiftError("The relayer holds more BNB than its cap, so it will not send until that is fixed.", 503);
      const data = transferFromCalldata(vault, w, amount);
      const sim = await simulateCall(this.ctx.rpcUrl, this.#token(), data, relayer);
      if (!sim.ok) throw new GiftError(`This transfer would be refused, for example by the token's own rules for this address. ${sim.reason}`, 409);
      const id = randomUUID();
      // The row is written before sending: one per wallet and one per box, so a retry after a crash never sends twice.
      this.#db.prepare("INSERT INTO gift_claims (id, campaign_id, box_index, wallet, amount, status, created_at) VALUES (?, ?, ?, ?, ?, 'sending', ?)").run(id, cur.id, index, w, amount.toString(), new Date().toISOString());
      let broadcast = false;
      try {
        const prepared = await prepareCall(this.ctx.rpcUrl, relayerKey, relayer, this.#token(), data);
        this.#db.prepare("UPDATE gift_claims SET tx_hash = ?, nonce = ? WHERE id = ?").run(prepared.signed.hash, prepared.nonce.toString(), id);
        await sendRawTransaction(this.ctx.txRpcUrl, prepared.signed.raw);
        broadcast = true;
        const r = await waitForReceipt(this.ctx.txRpcUrl, prepared.signed.hash, 120_000);
        const settled = this.#settle(id, r);
        if (settled && settled.status === "reverted") return { retry: true, ...this.#publicClaim(settled) };
      } catch (e) {
        const why = e instanceof Error ? e.message.slice(0, 300) : String(e);
        if (!broadcast) {
          // Nothing reached the network, so nothing was sent: free the box and the wallet so a retry works.
          this.#db.prepare("DELETE FROM gift_claims WHERE id = ?").run(id);
          throw new GiftError("The transfer could not be sent. Nothing was sent; try again in a moment.", 502);
        }
        // It was broadcast but not confirmed in time. It may still land, so the row stays and is settled from its receipt.
        this.#db.prepare("UPDATE gift_claims SET error = ? WHERE id = ?").run(why, id);
        throw new GiftError("Your claim was sent and is waiting for the network to confirm it. It will show up here when it does.", 202);
      }
      return this.#publicClaim(this.#db.prepare("SELECT * FROM gift_claims WHERE id = ?").get(id) as unknown as Claim);
    });
  }

  /** The claim this wallet already made in the open gift, if any. Claims are public, so this reveals nothing new. */
  claimOf(wallet: string): Record<string, unknown> | null {
    if (!isAddress(wallet)) throw new GiftError("The wallet address is not valid.");
    const cur = this.current();
    if (!cur) return null;
    const row = this.#db.prepare("SELECT * FROM gift_claims WHERE campaign_id = ? AND wallet = ?").get(cur.id, wallet.toLowerCase()) as unknown as Claim | undefined;
    // A claim that failed before anything was broadcast moved nothing, so that wallet may try again.
    if (!row || (row.status === "failed" && !row.tx_hash)) return null;
    return this.#publicClaim(row);
  }

  /**
   * Settle every claim still marked sending from its receipt (run at start and on a timer). A claim is freed as
   * dropped only when the relayer's confirmed nonce has moved past it and it still has no receipt: then another
   * transaction used that nonce and this one can never land, so its box cannot be paid twice. A node that merely
   * has not heard of a transaction proves nothing.
   */
  async reconcileClaims(log: (o: Record<string, unknown>) => void): Promise<void> {
    const rows = this.#db.prepare("SELECT * FROM gift_claims WHERE status = 'sending' AND tx_hash IS NOT NULL").all() as unknown as Claim[];
    if (rows.length === 0) return;
    // Read the confirmed nonce before any receipt: a transaction that lands in between then shows its receipt.
    let confirmedNonce: bigint | null = null;
    if (this.cfg.relayer) {
      try {
        confirmedNonce = BigInt((await rpcCall<string>(this.ctx.txRpcUrl, "eth_getTransactionCount", [this.cfg.relayer, "latest"])).result);
      } catch (e) {
        log({ level: "warn", msg: "relayer nonce unavailable; no claim is freed this round", error: e instanceof Error ? e.message : String(e) });
      }
    }
    for (const c of rows) {
      try {
        const r = await getReceipt(this.ctx.txRpcUrl, c.tx_hash as string);
        if (r) {
          this.#settle(c.id, r);
          log({ level: "info", msg: "gift claim settled", box: c.box_index + 1, status: r.status });
          continue;
        }
        if (confirmedNonce !== null && c.nonce !== null && /^\d+$/.test(c.nonce) && confirmedNonce > BigInt(c.nonce)) {
          this.#retire(c.id, "dropped", null, null);
          log({ level: "warn", msg: "gift claim dropped by the network; box freed", box: c.box_index + 1 });
        }
      } catch (e) {
        log({ level: "warn", msg: "gift claim reconcile failed", box: c.box_index + 1, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  #fundedUsd(): string | null {
    const last = this.#db.prepare("SELECT record FROM gift_funding ORDER BY at DESC LIMIT 1").get() as { record: string } | undefined;
    const usd = last ? (JSON.parse(last.record) as { usd?: unknown }).usd : null;
    return typeof usd === "string" ? usd : null;
  }

  #publicClaim(c: Claim): Record<string, unknown> {
    return { box: c.box_index + 1, amount: c.amount, status: c.status, txHash: c.tx_hash, gasUsed: c.gas_used, feeWei: c.fee_wei, at: c.created_at, wallet: `${c.wallet.slice(0, 6)}…${c.wallet.slice(-4)}` };
  }

  /** Close the campaign: no more claims; the relayer's approval is set to zero, so unclaimed boxes stay with the operator. */
  close(): Promise<Record<string, unknown>> {
    return this.#serial(async () => {
      const { vault, vaultKey, relayer } = this.#requireKeys();
      const cur = this.current();
      if (!cur || cur.status !== "open") throw new GiftError("No gift is open.", 409);
      const a = await this.#send(vaultKey, vault, cur.token, approveCalldata(relayer, 0n));
      this.#db.prepare("UPDATE gift_campaigns SET status = 'closed' WHERE id = ?").run(cur.id);
      return { closed: cur.id, revokeTx: a.hash };
    });
  }

  reveal(): Record<string, unknown> {
    const cur = this.current();
    if (!cur) throw new GiftError("There is no gift.", 404);
    if (cur.status === "open" && Date.parse(cur.expires_at) > Date.now()) throw new GiftError("The draw is revealed only after the gift closes.", 409);
    this.#db.prepare("UPDATE gift_campaigns SET revealed = 1 WHERE id = ?").run(cur.id);
    return this.status();
  }

  status(): Record<string, unknown> {
    const cur = this.current();
    const configured = Boolean(this.cfg.vault && this.cfg.relayer);
    if (!cur) return { open: false, configured, token: this.cfg.token };
    const live = (this.#db.prepare("SELECT * FROM gift_claims WHERE campaign_id = ? ORDER BY created_at").all(cur.id) as unknown as Claim[]).map((c) => this.#publicClaim(c));
    const retired = (this.#db.prepare("SELECT * FROM gift_claim_history WHERE campaign_id = ? ORDER BY created_at").all(cur.id) as unknown as Claim[]).map((c) => this.#publicClaim(c));
    const claims = [...live, ...retired].sort((a, b) => String(a["at"]).localeCompare(String(b["at"])));
    const order = JSON.parse(cur.boxes) as string[];
    // Each box is a fixed share of the dollars spent on the funding swap, shown in cents.
    const fundedUsd = this.#fundedUsd();
    const boxesUsd = fundedUsd ? BOX_WEIGHTS.map((w) => ((parseDecimal(fundedUsd) * BigInt(w)) / 100n / 10n ** 14n).toString()) : null;
    const active = live.filter((c) => c["status"] !== "failed").length;
    return {
      open: cur.status === "open" && Date.parse(cur.expires_at) > Date.now(),
      configured,
      id: cur.id,
      token: cur.token,
      received: cur.received,
      boxes: [...order].sort((a, b) => (BigInt(b) > BigInt(a) ? 1 : -1)),
      remaining: order.length - active,
      fundedUsd,
      boxesUsd: boxesUsd ? boxesUsd.map((v) => `${v.slice(0, -4) || "0"}.${v.slice(-4).padStart(4, "0").slice(0, 2)}`) : null,
      commitment: cur.commitment,
      expiresAt: cur.expires_at,
      fundTx: cur.fund,
      approveTx: cur.approve_tx,
      vault: this.cfg.vault,
      relayer: this.cfg.relayer,
      claims,
      ...(cur.revealed ? { reveal: { assignment: cur.boxes, secret: cur.secret, check: "sha256(assignment || secret) equals the commitment" } } : {}),
    };
  }

  /** The web app forwards claims with a shared secret, since only it can see the visitor's country. */
  trustedProxy(header: string | undefined): boolean {
    const s = this.cfg.proxySecret;
    if (!s || typeof header !== "string") return false;
    const a = Buffer.from(s);
    const b = Buffer.from(header);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
