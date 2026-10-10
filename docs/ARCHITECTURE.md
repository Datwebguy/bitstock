# Architecture

Bitstock is a decision system with a thin front end. The decisions are the product; everything else exists to feed them live data and to carry out their result safely.

## 1. Principles

1. **Live truth over stored truth.** Market state, price, multiplier and pool quality are read at decision time with a timestamp and a source.
2. **Rules decide, models never do.** Money-moving decisions are deterministic functions of live inputs and a versioned rule set.
3. **Fail closed.** Unknown means wait or decline, and the UI says "unavailable".
4. **Auditable by construction.** Every decision is stored with its inputs, rules version and outcome.
5. **Small blast radius.** Dedicated low-balance wallets, enforced caps, a persistent kill switch, no custody of other people's funds.
6. **Replaceable edges.** The data source, the swap venue, the store and the chain are behind interfaces.

## 2. Components

```text
                ┌────────────────────────────── apps/web (phone-first) ──────────────────────────────┐
                │  Guard HUD · Buy · Holdings & Explain · Learn · Claim                              │
                └───────────────┬───────────────────────────────────────────────────────────────────┘
                                │ HTTPS, /v1
                ┌───────────────▼────────────────────── apps/agent ──────────────────────────────────┐
                │  decision API · intent queue · relayer · sentry loop · admin (kill switch)         │
                └──────┬───────────────┬──────────────────┬──────────────────┬────────────────────────┘
                       │               │                  │                  │
              packages/guard   packages/explainer   packages/binance    packages/chain
              (pure rules +     (multiplier math,    (signed client,    (BSC reads/sends,
               thin I/O)         plain language)      typed, cached)     ERC-20, ERC-8056)
                                                              │                  │
                                              Binance Web3 API (RWA Data,   BSC JSON-RPC
                                              Trading, Transaction, …)      (public + keyed)

   skills/bitstock-buy  ── runs in the user's own agent, uses their Binance Agentic Wallet, calls the guard
   studio/              ── agent identity (ERC-8004), A2A/x402 endpoints exposing guard_check
```

## 3. Data flow: a protected buy

1. Web asks the agent for a decision: token, USD amount, wallet.
2. Agent calls the guard. The guard reads: RWA market-status object, on-chain multiplier state, an independent reference price, a live quote at the exact size, and a Transaction API dry run.
3. Guard returns GO, LIMIT, WAIT or BLOCK with per-check values, sources and as-of times. The decision record is stored.
4. On GO or LIMIT the agent returns an unsigned, simulated transaction. The user signs in their own wallet.
5. On WAIT the agent stores an intent and re-runs the full guard at the next verified session.
6. After broadcast the agent reconciles from the receipt and stores the result.

## 4. Decision record (stored)

| Field | Meaning |
|---|---|
| `id`, `at` | identifier and UTC time |
| `rulesVersion` | version of the guard rules used |
| `request` | token, side, amount, wallet (hashed in logs) |
| `inputs[]` | each input: name, value, source, as-of time, status (ok, stale, unavailable) |
| `checks[]` | each check: result (pass, warn, fail, unavailable), raw value, threshold, plain-words reason |
| `outcome` | GO, LIMIT, WAIT, BLOCK |
| `limits` | slippage limit applied and why |
| `txHash`, `receipt` | filled after execution |

Because inputs and rules version are stored, any decision can be replayed and explained later.

## 5. Failure modes and responses

| Failure | Response |
|---|---|
| Binance API unreachable, rate-limited or region-blocked | Checks show "unavailable"; outcome WAIT or BLOCK; retry with backoff; surface the plain reason |
| Market-status object missing | Fail closed (the finder returns nothing) |
| No independent reference price | The check is "unavailable" (a warn); LIMIT at most; never a pass |
| Quote route is RFQ only | Refuse (cannot be dry-run); use the labelled fallback only where allowed |
| Simulation fails or shows no token arriving | BLOCK |
| RPC log queries refused (archive) | History starts at first recorded snapshot; say so |
| Crash between broadcast and booking | Reconcile pending sends from receipts on start |
| Issuer blocks the recipient address | `eth_call` revert → friendly message, nothing sent |
| Relayer or vault below floor, cap reached, or kill switch on | Stop signing; report |

## 6. Security model (summary)

- Keys in environment only; dedicated wallets; caps and kill switch in code.
- No server holds any user's keys. Mode B signs inside the user's own Agentic Wallet, within limits set in the Binance App.
- Validate every input at the boundary; strict CORS; CSP; rate limits; admin routes require a bearer token and are never exposed without one.
- Region block on the claim route; terms state eligibility.
- Threats considered: key theft (small balances, caps), replay (idempotency keys), claim abuse (one per wallet/box, rate limits, simulation first), data poisoning (cross-source checks; unavailable beats wrong), issuer action (blocklist/pause handled and explained).

## 7. Storage

SQLite (WAL) behind a repository interface. Tables: `decisions`, `intents`, `boxes`, `claims`, `commitments`, `multiplier_snapshots`, `streaks`, `sends`. All writes atomic. Migration to Postgres is a swap of the repository implementation.

## 8. Testing strategy

- **Unit**: guard rules, unit conversions, box weights, commitment verification, multiplier math, region block.
- **Contract**: recorded real responses from `docs/evidence/` replayed against the typed client.
- **Live smoke** (explicit flag): signed calls, one guard run, one multiplier read.
- **Property tests** for conversions and weights.
- **End to end** against mainnet with small amounts, evidence saved with transaction hashes.

## 9. Extension points

New tokens (any asset that passes the guard's liquidity and status checks), other issuers (Ondo and xStocks need a different quote flow), other chains (the chain package isolates RPC), other data sources (the reference-price source is an interface), other front ends (the decision API is the contract).

## 10. Known constraints

- Issuer dependence: tokens can be paused or blocked. Bitstock explains this and does not work around it.
- Data dependence: the Binance Web3 API is the primary source; its limits and regions apply.
- Mode B requires the user's own agent environment and Agentic Wallet.
