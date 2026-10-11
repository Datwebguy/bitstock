# Changelog

All notable changes are recorded here. The format follows Keep a Changelog and the project follows semantic versioning.

## [Unreleased]

### Added
- Languages: English, 简体中文, Español, Português, Türkçe and Tiếng Việt, chosen in the header. The agent translates on-screen text through `/v1/translate` (OpenAI, `OPENAI_API_KEY`), caches each sentence, and keeps the English wherever a number, amount, address or name would change. Without the key the site stays in English.

### Fixed
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
