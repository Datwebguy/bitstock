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
  addressFromPrivateKey, approveCalldata, erc20Allowance, erc20BalanceOf, isAddress, prepareCall, rpcCall, sendRawTransaction, simulateCall, transferFromCalldata, waitForReceipt,
} from "@bitstock/chain";
import { chooseRoute, parseDecimal, type Route } from "@bitstock/guard";
import type { AgentContext } from "./context.ts";
import { BOX_WEIGHTS, assignmentText, boxAmounts, commitment, newSecret, shuffle } from "./gift.ts";
import { killState } from "./killswitch.ts";
import { NVDAB, USDT } from "./probes.ts";

export interface GiftConfig {
  token: string;
  vault: string | null;
  vaultKey: string | null;
  relayer: string | null;
  relayerKey: string | null;
  proxySecret: string | null;
  maxCampaignUsd: string;
  maxRelayerBnbWei: bigint;
  claimDays: number;
}

const KEY_RE = /^(0x)?[0-9a-fA-F]{64}$/;

export function giftConfigFromEnv(env: NodeJS.ProcessEnv): GiftConfig {
  const vaultKey = env["GIFT_VAULT_PRIVATE_KEY"] || null;
  const relayerKey = env["GIFT_RELAYER_PRIVATE_KEY"] || null;
  if (vaultKey && !KEY_RE.test(vaultKey)) throw new Error("GIFT_VAULT_PRIVATE_KEY is not a 32-byte hex key");
  if (relayerKey && !KEY_RE.test(relayerKey)) throw new Error("GIFT_RELAYER_PRIVATE_KEY is not a 32-byte hex key");
  const token = env["GIFT_TOKEN"] || NVDAB;
  if (!isAddress(token)) throw new Error("GIFT_TOKEN must be a token address");
  const maxCampaignUsd = env["GIFT_CAMPAIGN_MAX_USD"] || "1";
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(maxCampaignUsd)) throw new Error("GIFT_CAMPAIGN_MAX_USD must be a dollar amount");
  const maxBnb = env["GIFT_RELAYER_MAX_BNB"] || "0.01";
  if (!/^\d+(\.\d{1,18})?$/.test(maxBnb) || parseDecimal(maxBnb) > parseDecimal("0.01")) throw new Error("GIFT_RELAYER_MAX_BNB must be at most 0.01 (AGENTS.md 0.4)");
  const claimDays = Number(env["GIFT_CLAIM_DAYS"] || "7");
  if (!Number.isInteger(claimDays) || claimDays < 1 || claimDays > 60) throw new Error("GIFT_CLAIM_DAYS must be 1 to 60");
  const k = (v: string) => (v.startsWith("0x") ? v : `0x${v}`);
  return {
    token: token.toLowerCase(),
    vault: vaultKey ? addressFromPrivateKey(k(vaultKey)).toLowerCase() : null,
    vaultKey: vaultKey ? k(vaultKey) : null,
    relayer: relayerKey ? addressFromPrivateKey(k(relayerKey)).toLowerCase() : null,
    relayerKey: relayerKey ? k(relayerKey) : null,
    proxySecret: env["GIFT_PROXY_SECRET"] || null,
    maxCampaignUsd,
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
  gas_used: string | null; fee_wei: string | null; created_at: string; error: string | null;
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
    `);
  }

  /** One send at a time, so nonces and box picks never race. */
  #serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(fn, fn);
    this.#queue = run.catch(() => undefined);
    return run;
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
      const usdtBal = (await erc20BalanceOf(this.ctx.rpcUrl, USDT, vault)).value;
      if (usdtBal < amount) throw new GiftError("The vault does not hold enough USDT.");
      const routes = (await this.ctx.api.quote({ fromTokenAddress: USDT, toTokenAddress: this.cfg.token, amount: amount.toString(), userWalletAddress: vault })) as Route[];
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
      const swap = await this.ctx.api.swap({ fromTokenAddress: USDT, toTokenAddress: this.cfg.token, amount: amount.toString(), userWalletAddress: vault, quoteId: route.quoteId, slippagePercent: "0.5", ...(route.vendorName ? { vendor: route.vendorName } : {}) });
      const tx = findSwapTx(swap);
      if (!tx || tx.to.toLowerCase() !== route.approveTarget.toLowerCase() || tx.from.toLowerCase() !== vault || BigInt(tx.value || "0") !== 0n) throw new GiftError("The swap Binance built does not match its quote, so it was not sent.", 502);
      const sim = (await this.ctx.api.simulate({ from: tx.from, to: tx.to, value: "0", data: tx.data })) as SimulationResult;
      const arriving = sim.balanceChanges?.find((c) => c.contractAddress.toLowerCase() === this.cfg.token && c.owner.toLowerCase() === vault && BigInt(c.change) > 0n);
      record["simulation"] = { status: sim.status, arriving: arriving?.change ?? null };
      if (sim.status !== "SUCCESS" || !arriving) throw new GiftError("The funding swap failed its test run, so it was not sent.", 502);
      const before = (await erc20BalanceOf(this.ctx.rpcUrl, this.cfg.token, vault)).value;
      const s = await this.#send(vaultKey, vault, tx.to, tx.data, tx.gas ? (BigInt(tx.gas) * 125n) / 100n : undefined);
      const after = (await erc20BalanceOf(this.ctx.rpcUrl, this.cfg.token, vault)).value;
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
      const last = this.#db.prepare("SELECT record FROM gift_funding ORDER BY at DESC LIMIT 1").get() as { record: string } | undefined;
      const funded = last ? (JSON.parse(last.record) as { swap?: { received?: string; status?: string; tx?: string } }) : null;
      if (!funded?.swap?.received || funded.swap.status !== "success") throw new GiftError("Fund the vault first; boxes come from what was actually received.", 409);
      const received = BigInt(funded.swap.received);
      const held = (await erc20BalanceOf(this.ctx.rpcUrl, this.cfg.token, vault)).value;
      if (held < received) throw new GiftError("The vault holds less than the funding swap received.", 409);
      const boxes = boxAmounts(received);
      const order = shuffle(boxes);
      const text = assignmentText(order);
      const secret = newSecret();
      const c = commitment(text, secret);
      const total = order.reduce((a, b) => a + b, 0n);
      const data = approveCalldata(relayer, total);
      const sim = await simulateCall(this.ctx.rpcUrl, this.cfg.token, data, vault);
      if (!sim.ok) throw new GiftError(`Approving the relayer would fail: ${sim.reason}`, 502);
      const a = await this.#send(vaultKey, vault, this.cfg.token, data);
      if (a.status !== "success") throw new GiftError(`Approving the relayer reverted: ${a.hash}`, 502);
      const id = randomUUID();
      const expires = new Date(Date.now() + this.cfg.claimDays * 86_400_000).toISOString();
      this.#db.prepare("INSERT INTO gift_campaigns (id, created_at, token, received, boxes, commitment, secret, status, expires_at, fund, approve_tx) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)")
        .run(id, new Date().toISOString(), this.cfg.token, received.toString(), text, c, secret, expires, funded.swap.tx ?? null, a.hash);
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
      if (existing) return { already: true, ...this.#publicClaim(existing) };
      const order = (JSON.parse(cur.boxes) as string[]).map((b) => BigInt(b));
      const taken = new Set((this.#db.prepare("SELECT box_index FROM gift_claims WHERE campaign_id = ?").all(cur.id) as Array<{ box_index: number }>).map((r) => r.box_index));
      const index = order.findIndex((_, i) => !taken.has(i));
      if (index < 0) throw new GiftError("Every box has been claimed.", 409);
      const amount = order[index]!;
      const largest = order.reduce((a, b) => (b > a ? b : a), 0n);
      if (amount > largest) throw new GiftError("The box is larger than the cap.", 500); // the cap: never more than the largest box
      const bnb = BigInt((await rpcCall<string>(this.ctx.rpcUrl, "eth_getBalance", [relayer, "latest"])).result);
      if (bnb > this.cfg.maxRelayerBnbWei) throw new GiftError("The relayer holds more BNB than its cap, so it will not send until that is fixed.", 503);
      const data = transferFromCalldata(vault, w, amount);
      const sim = await simulateCall(this.ctx.rpcUrl, this.cfg.token, data, relayer);
      if (!sim.ok) throw new GiftError(`This transfer would be refused, for example by the token's own rules for this address. ${sim.reason}`, 409);
      const id = randomUUID();
      // The row is written before sending: one per wallet and one per box, so a retry after a crash never sends twice.
      this.#db.prepare("INSERT INTO gift_claims (id, campaign_id, box_index, wallet, amount, status, created_at) VALUES (?, ?, ?, ?, ?, 'sending', ?)").run(id, cur.id, index, w, amount.toString(), new Date().toISOString());
      try {
        const prepared = await prepareCall(this.ctx.rpcUrl, relayerKey, relayer, this.cfg.token, data);
        this.#db.prepare("UPDATE gift_claims SET tx_hash = ? WHERE id = ?").run(prepared.signed.hash, id);
        await sendRawTransaction(this.ctx.txRpcUrl, prepared.signed.raw);
        const r = await waitForReceipt(this.ctx.txRpcUrl, prepared.signed.hash, 120_000);
        this.#db.prepare("UPDATE gift_claims SET status = ?, gas_used = ?, fee_wei = ? WHERE id = ?").run(r.status === "success" ? "confirmed" : "reverted", r.gasUsed.toString(), (r.gasUsed * r.effectiveGasPrice).toString(), id);
      } catch (e) {
        this.#db.prepare("UPDATE gift_claims SET status = 'failed', error = ? WHERE id = ?").run(e instanceof Error ? e.message.slice(0, 300) : String(e), id);
        throw new GiftError("The transfer could not be sent. Try again later.", 502);
      }
      return this.#publicClaim(this.#db.prepare("SELECT * FROM gift_claims WHERE id = ?").get(id) as unknown as Claim);
    });
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
    const claims = (this.#db.prepare("SELECT * FROM gift_claims WHERE campaign_id = ? ORDER BY created_at").all(cur.id) as unknown as Claim[]).map((c) => this.#publicClaim(c));
    const order = JSON.parse(cur.boxes) as string[];
    // Each box is a fixed share of the dollars spent on the funding swap, shown in cents.
    const fundedUsd = this.#fundedUsd();
    const boxesUsd = fundedUsd ? BOX_WEIGHTS.map((w) => ((parseDecimal(fundedUsd) * BigInt(w)) / 100n / 10n ** 14n).toString()) : null;
    const active = claims.filter((c) => c.status !== "failed").length;
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
