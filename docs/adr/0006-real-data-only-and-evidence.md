# 0006. Real data only, backed by an evidence ledger

Status: accepted

## Context
Trust is the product. A single invented number or mock value in the interface would undermine every check Bitstock shows.

## Decision
Nothing a user sees is mock, sample or hardcoded market data. Anything unreadable is shown as "unavailable". Every fact the system depends on is recorded in `docs/VERIFIED.md` with its source and date. Raw API responses and transaction hashes are kept in `docs/evidence/`. Statements Bitstock does not make are listed in `AGENTS.md` section 12 and checked before each release.

## Consequences
- Some screens will show "unavailable" more often than a mocked demo would. That is intended.
- Tests may use fixtures built from recorded real responses; fixtures never ship.
- A fact that is not in the ledger is not asserted.
