# 0002. The guard is deterministic and versioned

Status: accepted

## Context
The guard decides whether money moves. Language models are not reproducible and can be induced to approve things.

## Decision
The guard is a pure function of live inputs and a versioned rule set, returning GO, LIMIT, WAIT or BLOCK with per-check reasons. No model decides whether, what or how much to buy. A model may only rephrase text, and a checker rejects any number or name not present in the source data. Every decision is stored with its inputs and rules version.

## Consequences
- Decisions can be replayed and explained long after they happen.
- Rule changes bump `rulesVersion` and are recorded in `docs/METHOD.md` with the reason.
- Unknown inputs cannot produce a pass (see ADR 0003).
