# METHOD.md: how the guard decides

This file explains, in plain words, the rules the guard applies before any buy, and the numbers it uses. The code is `packages/guard/src/rules.ts`; the numbers live in `packages/guard/src/config.ts` and every one of them can be overridden by configuration. Rules version: **1**.

The guard is deterministic (ADR 0002): the same inputs and the same rules version always give the same decision. Every decision is stored with its inputs, each input's source and time, every check's result and the rules version, so any decision can be replayed later.

## What the guard reads

| Input | Source |
|---|---|
| Market status (`statusInfo`) | Binance Web3 API `rwa/underlying-market` |
| Share multiplier and any scheduled change | The token contract on BSC: `uiMultiplier()`, `newUIMultiplier()`, `effectiveAt()` |
| Underlying ticker | Binance Web3 API `rwa/underlying-profile` |
| Independent stock price | Public market-chart feed, `regularMarketPrice` and `regularMarketTime` (see `docs/VERIFIED.md` section 6 for why and its limits) |
| Live quote at the exact size | Binance Web3 API `aggregator/quote` |
| The wallet's USDT approval | The USDT contract on BSC: `allowance(wallet, spender)` |
| Dry run | Binance Web3 API `aggregator/swap`, then `pre-transaction/simulate` |

The buy amount is taken in USDT: a "$1" buy spends 1 USDT. The quote's own USD price for USDT is used when the buy price is compared with the stock price.

## The five checks

Each check returns pass, warn, fail or unavailable, with the value it looked at, the threshold, the source and the time.

1. **Market session.** Fails if the issuer has paused the token (`ASSET_PAUSED`, with the reason: dividend, split, merger and so on), if the market is paused or under maintenance, or if the token is unsupported. Warns if trading is limited (for example around earnings), if the market is closed (and gives the next opening time when Binance provides it), or if the status code is one it does not recognise. Passes when Binance reports the token as trading. Unavailable if the status cannot be read.
2. **Share multiplier.** Each token stands for `uiMultiplier` shares. Warns if the contract has a change scheduled within the next 24 hours, because a corporate action is about to land. Fails on a multiplier of zero. Unavailable if the contract cannot be read.
3. **Independent price.** Works out the price per share the buyer would pay (quote price per token divided by the multiplier) and compares it with the independent stock price.
   - If the independent price is recent (30 minutes or less old), the stock market is trading: pass within 0.5%, warn up to 2%, fail beyond 2%.
   - If it is older, it is the last close and the stock can move before it trades again: this is **never a pass**; warn up to 10%, fail beyond 10%.
   - If no independent price can be read, the check is unavailable. It still counts as a warning, never a pass (ADR 0003).
4. **Price and route.** Uses the live quote for the exact amount. Only a direct swap route (`executionMode = SWAP`) is used, because only it can be dry-run; a quote-on-request route alone is refused. Warns above 0.3% price impact, fails above 1%, fails if the quote would deliver nothing. If Binance will not quote because the stock's exchange is closed (`40369`), the check is unavailable and the guard waits.
5. **Dry run (shown to people as "Test run").** Builds the swap and runs it through Binance's simulator. Passes only if the simulation succeeds **and** shows the stock arriving in the buyer's wallet. Fails otherwise. The simulator checks the wallet's real USDT approval, so a wallet that has not approved USDT yet fails with a message saying to approve first. One exception (ADR 0007): when the buyer is a Binance Agentic Wallet (Mode B), which approves inside its own swap, a failure caused only by the missing approval is a warning, never a pass, so the buy can go ahead only with the tighter LIMIT slippage.

## The four outcomes

Checked in this order:

| Outcome | When | What happens |
|---|---|---|
| **BLOCK** | Any check fails | Nothing is bought. One sentence says why. |
| **WAIT** | Any check other than the independent price is unavailable | Nothing is bought now. The guard runs again in full at the next known opening time, or after 15 minutes when no time is known. A previous pass is never reused. |
| **LIMIT** | No failures, at least one warning (a missing independent price counts as a warning) | The buy may go ahead, but only with the tighter slippage limit below. |
| **GO** | Every check passes | The buy may go ahead with the normal slippage limit. |

## The slippage rule

Slippage is how far the final price may move against the buyer between the quote and the trade before the trade is cancelled on chain.

- **GO:** 0.5%.
- **LIMIT:** the observed price impact × 2, plus 0.10%, kept between 0.10% and 0.25%.

In words: when something calls for caution, the trade is allowed only a small, fixed margin above what the quote itself says the trade will cost, and never more than half the normal margin. A tight limit means a trade is more likely to be cancelled (and the buyer keeps their USDT) than to fill at a worse price.

This rule does **not** prevent a bad fill, and it does not make a purchase safe. It only bounds how far the price may move between quote and execution. Whether these numbers are well chosen must be measured, not assumed. Each decision record has fields for the transaction and its receipt; once buys are executed, every real outcome (filled or reverted, and the realised price against the quote) is stored there, and the numbers will be revised from that record. No outcome has been recorded yet.

## Parameters

Every default below is a deliberately conservative starting value chosen before any of Bitstock's own trades existed; none is derived from measured outcomes yet. Each will be revised from logged results, with the change, the new rules version and the reason recorded here.

| Parameter | Default | Reason |
|---|---|---|
| `multiplierWindowHours` | 24 | A scheduled change inside a day is the issuer's early warning of a corporate action; buying just before it means buying into a change the buyer may not understand. |
| `priceImpactWarnPercent` | 0.3 | The live $1 and $10 quotes moved the price by about 0.0006% (`docs/VERIFIED.md` section 3a). An impact 500 times larger means the pool is far thinner than usual. |
| `priceImpactMaxPercent` | 1.0 | Bitstock buys small amounts. Moving the price by more than 1% on a small buy means something is wrong with the pool or the route. Configurable as `GUARD_MAX_PRICE_IMPACT_PERCENT`. |
| `referenceWarnPercent` | 0.5 | Inside half a percent of a live stock price the buyer is paying close to what the stock trades at. |
| `referenceMaxPercent` | 2.0 | A gap of more than 2% to a live stock price is a premium the buyer should not pay automatically. |
| `referenceClosedMaxPercent` | 10.0 | Against a last close a gap is expected (the stock moves before it reopens), so this catches only extreme gaps. |
| `referenceLiveMaxAgeMinutes` | 30 | The chosen source is not real-time. Older prices are treated as a last close, which can only warn. |
| `defaultSlippagePercent` | 0.5 | A common default for liquid pools; the same value used when the swap was first built in the live probes. |
| `limitImpactMultiplier` | 2 | Allows the price to move as far again as the quoted impact. |
| `limitBufferPercent` | 0.10 | Covers ordinary movement between quote and inclusion in a block. |
| `limitFloorPercent` | 0.10 | Below this, ordinary movement would cancel almost every trade. |
| `limitCeilingPercent` | 0.25 | Half the normal margin, so LIMIT is always tighter than GO. Config refuses a ceiling above the GO value. |
| `waitRecheckMinutes` | 15 | Re-check soon enough to catch a short outage, without polling the API constantly. |

## History

| Rules version | Date | Change |
|---|---|---|
| 1 | 2026-10-10 | First version. |
| 1 | 2026-10-11 | Wording only: reasons are written for people (test run, shares per token, price impact rounded, with "less than 0.01%" for tiny figures; the exact figure stays in the record). Agentic Wallet exception to check 5 (ADR 0007); no threshold changed. |
