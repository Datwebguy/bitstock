# AGENTS.md: engineering manual for Bitstock

This file is the source of truth for anyone (person or tool) writing code in this repository. If a chat instruction conflicts with it, follow this file and say so. Read in this order: this file, `docs/VERIFIED.md`, `docs/ARCHITECTURE.md`, `docs/adr/`, `docs/RESOURCES.md`.

Bitstock is meant to run for years. Write every change as if someone who has never met you will maintain it, audit it and be paged for it in 2036.

---

## 0. Hard rules (never negotiable)

### 0.1 Authorship
- The repository owner is the **only** author and contributor. Commits use the identity already configured in this repository's **local** git config (`git config --local user.name` / `user.email`). Never change it, never override it with `--author`, and never rely on a global or default identity.
- Local git config is stored in `.git/`, **not in the repository**, so every new clone or container starts without it and may fall back to a default tool identity. At the start of every session: set the owner identity in this clone (`git config --local user.name "<owner name>"` and `git config --local user.email "<owner email>"`, taken from the owner), then run `sh scripts/setup-git.sh`. It enables the hooks in `.githooks/`.
- The hooks refuse to commit without a local identity or with an AI/tool author or committer, refuse messages carrying trailers or AI/tool names, and refuse to push commits that contain any of these. Never bypass them (`--no-verify`, `core.hooksPath` changes, `--author`).
- No AI names or tool names anywhere: no `Co-Authored-By`, `Signed-off-by` for anyone else, "Generated with", or similar trailer in a commit or pull request, and nothing in README, package metadata, comments, docs, the site or the video.
- Do not add other people as contributors, collaborators, code owners or authors in any file.
- After every push, run `git log --format='%an <%ae>%n%b' -n 20` and show that only the owner appears and no trailers exist.

### 0.2 Real data only
- No mock, fake, sample, dummy, placeholder or seed data anywhere a user can see it. No hardcoded prices, rates, balances, dates, holidays or market status.
- Allowed constants: contract addresses and chain IDs listed in `docs/VERIFIED.md`, API paths, ERC-8056 selectors, and user-facing copy written by the owner (explanations, quiz).
- If a value cannot be read live, the UI says "unavailable" and the system takes the safe action. It never fills the gap.
- Tests may use fixtures. Fixtures never ship in the app and never appear in screenshots.

### 0.3 Honesty
- Never claim something works unless it was run. Paste the real output into the report.
- If a live call disagrees with `docs/VERIFIED.md`, the live call wins: fix the file and say so.
- Never describe Bitstock as doing something it does not do. The statements in section 12 are never made.

### 0.4 Secrets and money
- Secrets live in environment variables only. Never commit, log, print or paste them. `.env` is git-ignored.
- The vault and relayer wallets are **dedicated hot wallets with small balances**. Nothing else uses them. Caps are enforced in code and configured, never exceeded: vault at most the campaign amount plus a test pool; relayer BNB at most 0.01; any single outgoing transfer never exceeds the largest box.
- A kill switch (environment flag and an authenticated admin call) stops all signing and sending. It persists across restarts and can only be cleared deliberately.
- Every transaction is dry-run first (Transaction API `simulate`, or `eth_call` for plain transfers).

### 0.5 Eligibility and legal guardrails (not legal advice; the owner decides)
- Recipients never pay anything to receive a first stock. It is a sponsor-funded gift.
- Block restricted jurisdictions on the claim page using the request country: United States, Canada, Netherlands, United Kingdom, Japan, Iran, Cuba, North Korea, Crimea, Donetsk, Luhansk. Show a clear message. The terms say the same.
- Tokens can be paused or blocked by their issuer. The app says so once, plainly, and says it is not investment advice.
- The Binance Web3 API refuses some regions. Host the server in an allowed region and verify with a signed call.

### 0.6 Developer Experience Report
- The report is written **by the owner, by hand**. Nobody else drafts, edits or improves it. The only related work is keeping `docs/DX_EVIDENCE.md` accurate: a timestamped log of real friction with the evidence for each line.

---

## 1. What Bitstock is

**Bitstock is a market-aware autopilot for small-money investing in tokenized stocks on BNB Smart Chain.** It decides whether it is safe to buy right now, buys small amounts within limits the user controls, and explains in plain words what happens to what the user owns.

Three verbs:

| Verb | What it does | Module |
|---|---|---|
| **Check** | Before any buy, reads live market state, corporate-action state, pool quality and a dry run, and shows every check. | `guard` |
| **Buy** | Buys small amounts when the guard allows it: immediately on the user's command, or at a verified market-open session inside the user's limits. | `executor` + wallet skill |
| **Explain** | Tells the user, in plain words, what is happening to their token: scaled-multiplier changes, pauses, splits, dividends. | `explainer` |

The **front door** is a gasless first slice: a person with no BNB opens a link and receives a small amount of a tokenized stock, then lands in the three verbs. It is how people arrive. It is not the product.

Promises users can verify:
- It checks the market before every buy and shows the checks.
- It would rather wait or decline than buy at a bad time, and says why.
- It can only spend what the user allows.
- Every buy is dry-run first, and every transaction is public on BscScan.

It does **not** promise profit, protection from loss, or trading for people who have not set it up.

## 2. Execution modes

| Mode | Trigger | Who signs | Notes |
|---|---|---|---|
| **A. Protected buy** | The user taps "Buy $X" | The user, in their own wallet (the app prepares and dry-runs the transaction) | Works for any wallet. Guard runs first. |
| **B. Scheduled buy at market open** | A verified open session (`openState = true`, `marketStatus = regular`, plus a configurable wait after the open) inside a window and a delegated cap | The user's own Binance Agentic Wallet, through the Bitstock wallet skill | Limits (daily limit, token scope) are set by the user **in the Binance App**. The server never holds a user's keys. |

State plainly wherever Mode B is described: it runs inside the user's own Agentic Wallet limits, and the team demonstrates it with its own wallet.

## 3. Repository layout

```text
.
├── apps/
│   ├── web/              # Next.js, phone-first (guard HUD, buy, holdings, learn, claim)
│   └── agent/            # Node service: decisions, intents, relayer, sentry loop, admin
├── packages/
│   ├── binance/          # signed Web3 API client, typed responses, error mapping
│   ├── guard/            # pure decision logic + thin I/O layer
│   ├── chain/            # BSC reads/sends: ERC-20, ERC-8056, receipts, eth_call
│   └── explainer/        # multiplier math and plain-language rendering
├── skills/
│   └── bitstock-buy/     # Wallet Skill: SKILL.md + helper scripts
├── studio/               # BNB Agent Studio agent
├── docs/                 # see docs/ARCHITECTURE.md
├── AGENTS.md  README.md  SECURITY.md  CHANGELOG.md  LICENSE
└── .env.example
```

TypeScript, Node 22 or later, pnpm workspaces. Lockfile committed. Dependencies pinned and kept few.

## 4. Engineering standards

These apply to every change.

1. **Decisions are written down.** A choice that is expensive to reverse gets an ADR in `docs/adr/` (context, decision, consequences). Change an ADR by adding a new one that supersedes it.
2. **Deterministic where money is involved.** The guard and executor are rules over live data. No language model chooses what to buy, how much, or whether to proceed. A model may only rephrase text, and a checker must reject any number or name not in the source data.
3. **Fail closed.** Missing, stale or contradictory data means "unavailable" and the safe action (wait or decline). Never default to proceed.
4. **Every decision is recorded.** Each guard decision stores: timestamp, rules version, inputs (with source and as-of time), per-check results, outcome, and the reason in plain words. Decisions are reproducible from the stored inputs and the rules version.
5. **Idempotency.** Every send has an idempotency key. A retry after a crash never sends twice. Reconcile pending sends from receipts on start.
6. **Explicit units.** Money is integer smallest-units in code (bigint). Conversions go through one tested module. No floating point for balances or token amounts.
7. **Config as code.** Every threshold lives in validated config with a documented default and a reason. The process refuses to start on invalid config.
8. **Observability.** Structured logs (no secrets), a health endpoint that reports dependency status, and counters for decisions by outcome and API errors by code. Every external call is timed.
9. **Tests.** Unit tests for pure logic including edge cases (zero, stale, huge, tiny). Contract tests that replay real recorded responses saved in `docs/evidence/`. Live smoke tests behind an explicit flag. Nothing merges with failing lint, typecheck, tests or build.
10. **Small, reviewable commits** with imperative messages that say what and why (`guard: refuse RFQ routes because they cannot be dry-run`). One concern per commit. Tags follow semantic versioning; `CHANGELOG.md` records every release.
11. **Dependencies are a liability.** Add one only with a reason. Pin versions. Prefer the platform standard library. Run an audit before each release.
12. **Public interfaces are versioned.** HTTP routes live under `/v1`. Storage goes through a repository interface so SQLite can move to Postgres without touching callers.
13. **Security by default.** Least privilege, input validation at every boundary, rate limits on public routes, no secret in a URL, strict CORS, CSP on the web app.
14. **Accessibility and plain language.** 360 px wide, keyboard use, reduced motion, light and dark themes, four states for every action (idle, working, success, failed with the real reason). No developer words on screen.

## 5. API client (`packages/binance`)

- Signing exactly as `docs/VERIFIED.md` section 2, unit-tested against a signature computed independently, including the `/build` prefix.
- One method per endpoint, typed from the verified fields. The two nested objects whose keys the reference omits (market status, swap transaction) are located **by shape** with unit-tested finders.
- Error codes mapped to plain sentences. Read endpoints cached for 30 seconds. Back off on HTTP 429.
- Every call logged (method, path, HTTP status, code, latency; no secrets) to `docs/evidence/calls.jsonl` during development.

## 6. Guard (`packages/guard`)

Input: token, side (buy), USD amount, wallet. Output: a decision and reasons, from live data only. Checks in order, each pass / warn / fail with raw value, source and as-of time:

1. **Session**: market-status object. Fail on `ASSET_PAUSED`, `MARKET_PAUSED`, `MARKET_MAINTENANCE`. Warn on `ASSET_LIMITED` (for example earnings) and when `openState` is false. Show the plain reason.
2. **Multiplier state**: `uiMultiplier()`, `newUIMultiplier()`, `effectiveAt()`. Warn if a change is scheduled within 24 hours.
3. **Independent reference**: compare the quote-implied price to an independent price (`docs/adr/0003`). Convert through the multiplier. If no independent price exists the check is "unavailable" (a warn, never a pass).
4. **Execution quality**: live quote at the exact size. Require `executionMode = SWAP`. Read price impact and expected output.
5. **Simulation**: build the swap, run Transaction API `simulate`. Pass only if `status = SUCCESS` and `balanceChanges` shows the stock token arriving.

Outcome: **GO** (all pass), **LIMIT** (warns present: proceed only with a tighter slippage limit chosen by a written rule in `docs/METHOD.md`), **WAIT** (persist an intent and re-check at `nextOpenTime` or at the next verified session), **BLOCK** (any fail, one sentence why). The slippage rule's parameters are config, justified in `docs/METHOD.md`, and its real outcomes are logged, never assumed.

## 7. Executor (`apps/agent`, `skills/bitstock-buy`)

- Mode A: the app requests a prepared transaction from the agent, which runs the guard and returns an unsigned, simulated transaction. The user signs.
- Mode B: the wallet skill (a `SKILL.md` with helper scripts, in the style of the official Wallet Skills) requires the official `binance-agentic-wallet` skill and the `baw` CLI. Flow, each step needing the user's yes: preflight `baw wallet status`, read limits with `baw wallet settings`, call the Bitstock guard, show the checks, then `baw market-order quote` and `swap` within the limits, then report the receipt. It never tries to change limits.
- Check what `baw` supports for limit orders on this token before offering a dip trigger. If unsupported, say so.
- Intent queue: WAIT creates a persisted intent with the reason and the time it will be re-checked. The loop re-runs the full guard at execution time; a stale pass is never reused.

## 8. Explainer (`packages/explainer`)

Each raw token represents `uiMultiplier` shares. When a dividend is reinvested the multiplier rises and the share price drops by the dividend on the ex-dividend date, so the token price is roughly continuous. Say: "Your token now represents X% more shares. That is your reinvested dividend (already net of withholding). It offsets the share price drop on the ex-dividend date." Never say holdings "grew while you slept". Never subtract withholding again from the multiplier change. Before the UI says "dividend", compare the implied per-share amount to the issuer's announcement; if it does not match, say "multiplier change" and what is known. History: snapshots from first run plus `UIMultiplierUpdated` logs where a log-capable RPC is available. Details in `docs/VERIFIED.md` section 4.

The story and quiz are for learning: the company note is a template over the RWA profile fields (and any rephrasing is checked against them); the quiz is owner-written static copy about holding a tokenized stock.

## 9. Front door (gift)

- Funding: the operator swaps campaign USDT into NVDAB (Trading API, or the labelled direct-pool fallback in section 10). Box sizes are fractions of the amount actually received (20/15/15/10/10/10/5/5/5/5 percent, sums to 100, unit-tested), rounded down to 8 decimals.
- Draw: commit-reveal. Publish `sha256(assignment || secret)` before opening; reveal after. Use the OS cryptographic random source. Say "committed in advance and revealed after", never "provably random".
- Claim: country block, one claim per wallet and per box, rate limits, no plain-text signature required (Agentic Wallets cannot sign plain text; use no signature or an EIP-712 typed message), `eth_call` simulation of the transfer (the issuer's compliance hook can block an address), relayer transfer, receipt, and the real gas cost recorded.
- Unclaimed boxes return to the operator after expiry.

## 10. Closed-market behaviour: test, then follow the answer

The US market is closed on weekends, so the open-hours path cannot be demonstrated live then. On a signed call, test what the Trading API does for NVDAB while closed, and follow the matching row:

| Result while closed | Behaviour |
|---|---|
| SWAP route available | Use it with the guard's LIMIT rules. |
| `40369` (market closed) | Guard shows WAIT with the next open time. For the funding swap use the **direct PancakeSwap v3 route** as a labelled fallback (official deployment list, `eth_call` simulation, tight `amountOutMinimum`). Record it in `docs/DX_EVIDENCE.md`. |
| Only an RFQ route | Refuse (cannot dry-run). Use the fallback above. |

Never fake a trade. Never present recorded data as live.

## 11. Definition of done

A change is done when: tests and gates pass; behaviour was run against live data where it touches an API or chain (output pasted); `docs/VERIFIED.md` is updated if a fact changed; an ADR exists if a hard-to-reverse choice was made; `CHANGELOG.md` is updated for user-visible change; no secret, no AI attribution, and no banned statement appears anywhere in the diff.

## 12. Statements Bitstock does not make

| Do not say | Why |
|---|---|
| Any number not read from a live source (for example a drop-off rate or a "typical weekend spread") | Real data only |
| `multiplier()`, "BEP-8056", "BEP-677 multiplier REST endpoint" | The call is `uiMultiplier()`; the standard is ERC-8056 |
| `tradingHalt`, `tokenToShareRatio` | Not in the API reference. Use the market-status object |
| "b402 paymaster" | B402 sponsors payment settlement only. Our relayer pays the first claim's gas |
| `feeRate` | The parameter is `feePercent`, and RFQ routes ignore it |
| "Session key with a $X allowance" | Agentic Wallet limits are set in the Binance App |
| "Your holdings grew while you slept" / subtracting 30% again | See section 8 |
| "Provably random" | It is committed in advance and revealed after |
| "Hosted autonomous trading for anyone" | Mode B runs inside the user's own Agentic Wallet |
| "Guaranteed", "risk-free", "protects you from loss" | Not true |

## 13. Order of work

See `docs/ROADMAP.md`. Do the steps in order and stop after each to report. Deadline-driven milestones for the hackathon are in `docs/SUBMISSION.md`.
