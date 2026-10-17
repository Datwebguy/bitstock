# Changelog

All notable changes are recorded here. The format follows Keep a Changelog and the project follows semantic versioning.

## [Unreleased]

### Added
- Buy: a wallet that has not approved USDT yet can approve from the Buy page. The approval is for exactly the buy's amount, never more; the agent (`POST /v1/approvals`) only prepares it when Binance's quote and its approval endpoint name the same contract, and tests it first. Once it is confirmed, the buy is checked again automatically. Before, a first buy stopped at "Approve USDT in your wallet first" with no way to do that in the app.
- Buy: a buy that has to wait now shows what Bitstock's later check found (still waiting, ready to check again, or a reason not to buy). WAIT decisions carry the `intentId` of that saved check.
- Languages: English, 简体中文, Español, Português, Türkçe and Tiếng Việt, chosen in the header. The agent translates on-screen text through `/v1/translate` (OpenAI, `OPENAI_API_KEY`), caches each sentence, and keeps the English wherever a number, amount, address or name would change. Without the key the site stays in English.

### Fixed
- Buy: when the test run fails for lack of USDT, Bitstock says how much USDT the wallet holds on BNB Smart Chain and how much the buy needs, instead of only "not enough". The approval step now refuses, before any network fee, when the wallet does not hold the buy's USDT: an approval cannot help until the USDT is there.
- Guard (rules version 2): the test run must also show USDT leaving the wallet by no more than the chosen amount, for the check and again for the final transaction. The gift's funding swap follows the same rule. See `docs/METHOD.md`.
- Guard: quotes and swaps are no longer served from the 30-second read cache, so a check never rests on a reused quote, and the final trade is not built from an expired one.
- Buy: if the node cannot estimate the network fee, Bitstock does not prepare the trade. Before, it fell back to the swap API's figure, which was about a quarter of what real swaps used, so the trade would likely have run out of gas.
- Gift: a claim whose transfer was refused on chain no longer uses up its box and the wallet's claim; it is kept in a history with its real fee and the wallet can try again. A claim is treated as dropped only once the relayer's confirmed nonce has passed it with no receipt, so a box can never be paid twice. The largest-box cap is now worked out from what the funding swap received, and the vault refuses to fund or open while it holds more USDT than the campaign plus a test pool (`GIFT_TEST_POOL_USD`).
- Languages: a translation that adds a number the English did not have is refused. `/v1/translate` keeps at most `TRANSLATE_MAX_ROWS` sentences and makes at most `TRANSLATE_MAX_CALLS_PER_DAY` model calls a day.
- Rate limits trust `X-Real-IP` only on Railway, whose edge sets it, or when `TRUST_X_REAL_IP=1`. `/v1/intents/{id}` is now rate limited.
- `/healthz` reports the gift cap variables the code reads, instead of two names nothing used.
- Languages: the page no longer asks the translation service for the same sentences over and over. A sentence that comes back unchanged is remembered, so the service stays under its rate limit and translation keeps working. Each batch appears as it arrives, the picker shows when it is translating, and if the service does not answer it says so and tries again later.
- Gift: a wallet that already claimed is recognised when it comes back. The Gift page asks the agent (`GET /v1/gift/claim?wallet=`), shows the wallet's box and transaction, and keeps the claim button off. Before, the button came back after a refresh or reconnect and the previous wallet's result stayed on screen after switching wallets.
- People can disconnect their wallet: a Disconnect wallet button on Buy, Holdings and Gift, and the header wallet pill opens the wallet menu. Buy clears its check when the wallet changes.
- Gift claims: a claim that failed before it was sent can be retried; a sent claim that is slow to confirm is settled from its receipt and never sent twice.
- Guard: a malformed number from Binance makes a check unavailable (or fails it) instead of causing a server error.
- Holdings and Learn no longer show an earlier wallet's or stock's data after switching.
- Buy explains what to do when a confirmation takes longer than usual.
- Screens no longer show fixed numbers (a 15-minute delay, $1 and $2 examples, 90 seconds) or raw status words.

### Removed
- The agent's old `/buy` signing page, which no longer worked; `/buy` on the agent now redirects to the web app.

### Security
- Next.js 16.3.8, fixing six advisories reported by `pnpm audit`.

### Changed
- Web app: wallet connection now uses Reown AppKit (WalletConnect) on BNB Smart Chain only, so phones can connect any WalletConnect wallet instead of needing an in-wallet browser. The wallet context (`account`, `connect`, `send`, `onBsc`, `error`) is unchanged for Buy, Holdings and Claim. The project ID is read from `NEXT_PUBLIC_REOWN_PROJECT_ID`; without it the site says wallet connection is not set up and does not connect.
- Content-Security-Policy: allows the Reown relay, API, verify, RPC, image and font hosts. `style-src` now permits inline styles because AppKit injects un-nonced styles; `script-src` stays nonce-based and strict.

## [0.1.0] - 2026-10-10

### Added
- Signed Binance Web3 API client, BSC chain helpers and live probes, with recorded evidence.
- Chain package: one bigint conversion module with property tests, EIP-155 signing (verified against the specification's vector), ERC-20 transfer with a mandatory dry run, receipts, and multiplier event decoding.
- Explainer: multiplier math, a dividend check that says "dividend" only when the announcement matches, plain-language text and the company note.
- Multiplier sentry: snapshots every run and forward scanning for multiplier events, with gaps recorded.
- Web app: landing page, live check, protected buy, holdings, learn, about and claim notice; phone-first, light and dark, strict CSP; restricted jurisdictions refused at the claim page with HTTP 451.
- Agent (Mode A): `/v1/decisions` returns the guard's decision and, on GO or LIMIT, a transaction rebuilt from the checked quote at the decided slippage, pinned and dry-run again, for the user to sign in their own wallet; a signing page at `/buy`; SQLite storage behind a repository interface; idempotency keys; a persistent kill switch; a buy cap; rate limits; a WAIT intent queue that re-runs the full guard; reconciliation from receipts; dependency health and counters.
- Guard: five checks (session, multiplier, independent price, route, dry run) and four outcomes (GO, LIMIT, WAIT, BLOCK), stored decision records and the written method in `docs/METHOD.md`.
- Project documentation: engineering manual, architecture, decision records, roadmap, resources, verified-facts ledger, developer-experience evidence log, submission pack.
- Repository hygiene: licence, security policy, environment template, ignore rules.
- Git hooks and a setup script that enforce the owner identity and reject trailers and tool attribution before commit and push.
