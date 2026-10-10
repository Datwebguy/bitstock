# Security policy

## Reporting a vulnerability

Please report security issues privately using GitHub's "Report a vulnerability" option on the Security tab of this repository. Do not open a public issue for a vulnerability. Include what you found, how to reproduce it, and the impact.

## Scope

In scope: the code in this repository and its deployed instances. Out of scope: the Binance Web3 API, BNB Smart Chain, token issuers and third-party wallets (report those to their owners).

## What to expect

Reports are read as soon as possible. Fixes for confirmed issues are released with a note in `CHANGELOG.md`.

## Design notes for reviewers

- No user keys are held. Mode B signs inside the user's own Agentic Wallet within limits set in the Binance App.
- The relayer and vault are dedicated, low-balance wallets with enforced caps and a persistent kill switch.
- Secrets are environment variables only and are never committed.
- See `docs/ARCHITECTURE.md` section 6 for the threat model summary.
