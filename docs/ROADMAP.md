# Roadmap

Only Phase 0 is in scope for the hackathon. Everything after it is intent, not a promise, and nothing below is claimed as built until it is.

Legend: `[ ]` planned, `[x]` done and verified.

## Phase 0: hackathon build (deadline Sun 11 Oct 2026, 12:00 UTC)

Order matters: the live probes decide how closed-market behaviour is built.

- [ ] Signed Binance Web3 API client with unit-tested signing and shape-based finders
- [ ] Live probes: RWA status, quote and swap while the market is closed, simulate, approve ordering, on-chain multiplier reads
- [ ] Guard: five checks, four outcomes, stored decision records, `docs/METHOD.md`
- [ ] Chain package and multiplier sentry (snapshots, event logs where a log-capable RPC exists)
- [ ] Front door: fund, commit, gasless claim with real proof
- [ ] Web app: Guard HUD, Buy (Mode A), Holdings and Explain, Learn, Claim
- [ ] Wallet skill for Mode B with one real Agentic Wallet swap
- [ ] Studio agent: identity, `guard_check`, `multiplier_status`
- [ ] Deploy, evidence, README, submission pack, owner-written report

## Phase 1: hardening (first 30 days after the hackathon)

- [ ] Independent reference-price source chosen, measured and documented; fallback source
- [ ] Measured slippage rule: compare LIMIT outcomes to actual fills and revise `docs/METHOD.md`
- [ ] Multiplier history indexer with a keyed archive RPC; corporate-action calendar
- [ ] Postgres repository; migrations; backups
- [ ] Alerts (push or Telegram) for scheduled multiplier changes, pauses and executed buys
- [ ] Observability: dashboards for decisions by outcome, API errors by code, latency
- [ ] Security review of the relayer and admin surface; dependency audit; threat model update
- [ ] Mode B scheduled execution measured over real market opens

## Phase 2: breadth (months 2 to 6)

- [ ] Every bStock that passes the liquidity and status gates, selected by rules, not a hardcoded list
- [ ] Other issuers where the quote flow can be dry-run (Ondo and xStocks need different handling; RFQ routes are refused today)
- [ ] Thematic baskets from the RWA sector tabs, executed leg by leg through the same guard
- [ ] Localised plain-language copy and quiz
- [ ] Public decision log (privacy-preserving) so users can see why Bitstock waited or declined

## Phase 3: business and compliance (months 6 to 12)

- [ ] Integrator fee on swap routes using the Trading API fee feature (disclosed in the UI; bounded by the API limit of 5%; applies to swap routes only). Target a small fee, justified by measured value
- [ ] Legal review of the jurisdictions served, terms, and the gift mechanic
- [ ] Independent audit of any contract or key-handling code
- [ ] Decide on a smart-account design for delegated execution, if the Agentic Wallet model does not meet needs

## Not planned

- Perpetuals or leverage
- Custody of other people's funds
- Price prediction, trading signals or promised returns
- Any claim that Bitstock reduces market risk (it reduces avoidable execution risk, and says so)

## Risks and dependencies

| Risk | Mitigation |
|---|---|
| Issuer pauses or blocks tokens | Detect, explain, never work around |
| Binance Web3 API limits, regions, outages | Cache, backoff, "unavailable" states, second data source for the reference price |
| Thin liquidity on most tokens | Guard liquidity gate; start with the deepest pool |
| Regulatory change for tokenized securities | Region block, terms, legal review in Phase 3 |
| Single maintainer | Everything documented here; decisions in ADRs |
