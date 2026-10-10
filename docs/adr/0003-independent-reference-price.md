# 0003. A gap check needs an independent reference price

Status: accepted

## Context
The Binance RWA Data API returns `tokenPrice` and `referencePrice`. Its reference states that `referencePrice` is a per-share price **derived from the on-chain token price**, not an official market quote. Comparing the two cannot reveal a gap to the traditional market; it reads near zero by construction.

## Decision
The "price makes sense" check compares the quote-implied price to an **independent** price source (to be chosen and measured, with its name and timestamp shown). The comparison is made per share, converting through the token's `uiMultiplier()`. If no independent price is available, the check is "unavailable", which is a warn and never a pass.

## Consequences
- A second data source is a dependency with its own limits (rate limits, hours). The source sits behind an interface and can be replaced.
- The UI never shows a gap figure that was not computed from two independent prices.
- The choice of source and its measured behaviour are recorded in `docs/VERIFIED.md`.
