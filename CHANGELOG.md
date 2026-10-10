# Changelog

All notable changes are recorded here. The format follows Keep a Changelog and the project follows semantic versioning.

## [Unreleased]

### Added
- Signed Binance Web3 API client, BSC chain helpers and live probes, with recorded evidence.
- Chain package: one bigint conversion module with property tests, EIP-155 signing (verified against the specification's vector), ERC-20 transfer with a mandatory dry run, receipts, and multiplier event decoding.
- Explainer: multiplier math, a dividend check that says "dividend" only when the announcement matches, plain-language text and the company note.
- Multiplier sentry: snapshots every run and forward scanning for multiplier events, with gaps recorded.
- Guard: five checks (session, multiplier, independent price, route, dry run) and four outcomes (GO, LIMIT, WAIT, BLOCK), stored decision records and the written method in `docs/METHOD.md`.
- Project documentation: engineering manual, architecture, decision records, roadmap, resources, verified-facts ledger, developer-experience evidence log, submission pack.
- Repository hygiene: licence, security policy, environment template, ignore rules.
- Git hooks and a setup script that enforce the owner identity and reject trailers and tool attribution before commit and push.
