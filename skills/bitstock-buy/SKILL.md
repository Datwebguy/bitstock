---
name: bitstock-buy
description: |
  Use when the user wants to buy a tokenized stock (bStock, such as TSLAB, NVDAB, METAB) with their
  Binance Agentic Wallet only after it has been checked: "check then buy", "buy $2 of Tesla safely",
  "buy at the next market open", "is it a good time to buy NVDA", "protected buy", or Bitstock.
  Runs the Bitstock guard (market session, shares per token, real stock price, price impact, test run)
  before every buy, then swaps through the official binance-agentic-wallet skill within the limits
  the user set in the Binance App.
metadata:
  version: '0.1.0'
  requires:
    skills:
      - binance-agentic-wallet
    bins:
      - baw
      - node
---

# Bitstock buy: check, then buy, with your own Agentic Wallet

Bitstock is a market-aware check for small buys of tokenized stocks on BNB Smart Chain. This skill puts that check in front of the user's own Binance Agentic Wallet. It never holds keys, never changes wallet limits, and never buys without the user's yes.

Everything the user's wallet does goes through the official **`binance-agentic-wallet`** skill and its `baw` CLI. Read that skill's `SKILL.md` and the reference file for each `baw` command before running it, and follow its rules (preflight, `--json`, confirmation, error handling, security pre-check). Where this file and the official skill disagree about the wallet, the official skill wins.

The helper `scripts/bitstock.mjs` (Node 18+, no dependencies) talks only to the Bitstock API. Run it from this skill's folder: `node scripts/bitstock.mjs <command> ...`. It prints one JSON object. `BITSTOCK_AGENT_URL` must be set to the Bitstock server address (the user knows it; it is shown on the Bitstock Autopilot page). Without it the helper stops and says so; never guess a server.

## Before anything

- **Region.** Bitstock is not for people who live in or are located in the United States and its territories, Canada, the Netherlands, the United Kingdom, Japan, Iran, Cuba, North Korea, Crimea and Sevastopol, Donetsk or Luhansk. Ask the user to confirm they are not, once, at the start. If they are, stop.
- **Not advice.** Say once: tokenized stocks can lose value and can be paused or blocked by the company that issues them; Bitstock's checks are not investment advice.
- **Pay token.** Bitstock buys with **USDT on BSC** (`0x55d398326f99059fF775485246999027B3197955`). Amounts are US dollars of USDT. Bitstock refuses more than its configured cap per buy (the check says so).

## Flow: a protected buy now

Get a clear "yes" from the user before each numbered step that changes anything, and before step 6 always.

1. **Preflight.** Run the official skill's preflight, then:
   - `baw wallet status --json` must be `CONNECTED`. If not, help the user sign in per the official skill and stop until they have.
   - `baw wallet address --json` to get the wallet's BSC address. Use only this address.
2. **Read the limits (never change them).** `baw wallet settings --json`. Show the user `dailyLimit`, `quotaLeft`, `tradeAllTokens` and `abnormalTxnHandling` in a small table. If `quotaLeft` is below the buy amount, say so and stop. Limits are changed only by the user, in the Binance App; never try to change them and never suggest a workaround.
3. **Pick the stock.** `node scripts/bitstock.mjs tokens --q <name or ticker>`. The list is Binance's live bStock list. Show symbol, company, full contract address and price. Use only an address from this output; never type one from memory.
4. **Run the Bitstock check.** `node scripts/bitstock.mjs check --token <SYMBOL> --usd <amount> --wallet <address>`.
   Show every check as a table: name, result, reason (results are `pass`, `warn`, `fail`, `unavailable`; say them as OK, Caution, Failed, Not read). Then the outcome in one line:
   - **GO**: every check passed. Use `slippagePercent` from the output.
   - **LIMIT**: proceed only with the tighter `slippagePercent` from the output. Say why in the user's words, using the reasons shown.
   - **WAIT** (exit code 2): do not buy. Tell the user the reason and `recheckAt`. Offer the scheduled flow below.
   - **BLOCK** (exit code 3): do not buy. Say the reason in one sentence. Stop.
   Never reuse an old check: if more than 90 seconds pass before step 6, run step 4 again.
5. **Quote through the wallet.** Run the official security pre-check for the target token, then
   `baw market-order quote --fromTokenQty <amount> --fromToken 0x55d398326f99059fF775485246999027B3197955 --toToken <token address> --binanceChainId 56 --slippage <slippagePercent> --json`.
   Show what the user pays and receives. If the quote's received amount looks very different from the check, say so and ask whether to continue.
6. **Swap, after an explicit yes.** Same arguments as the quote, with `market-order swap`. Keep the `orderId`. Then poll `baw market-order list --orderId <orderId> --json` until `FINISHED` or `FAILED`, exactly as the official skill requires. Never report success before `FINISHED`.
7. **Report.** On `FINISHED`: the `txHash`, a BscScan link (`https://bscscan.com/tx/<txHash>`), what was received, and the remaining daily quota from `baw wallet settings --json`. Record it with Bitstock: `node scripts/bitstock.mjs attach --decision <decisionId> --tx <txHash>`. On `FAILED`: say it failed, relay the CLI's message as returned, and do not retry without a new check and a new yes.

## Flow: buy at the next market open

For "buy $X of Y when the market opens". The user still says yes before the swap.

1. Steps 1 to 3 above.
2. Tell the user the plan in one sentence and get a yes: "I will wait until Binance reports a regular trading session for <stock>, wait <N> minutes after the open, run the Bitstock check, and ask you before buying."
3. `node scripts/bitstock.mjs wait-open --token <SYMBOL> --after-minutes 15`. It polls once a minute and prints progress to stderr. It returns when Binance reports `openState: true` with `marketStatus: "regular"` for at least the wait, or gives up after `--max-hours` (default 72) with exit code 2.
4. Then steps 4 to 7 of the protected buy. A check from before the wait is never reused.

If the user will not be there at the open, say plainly that the buy will wait for their yes; this skill does not trade without it.

## Flow: buy when the price drops (a limit order)

Do not assume limit orders work for bStocks. Follow the official skill: try `baw limit-order buy ...` with the user's trigger price and read the CLI's answer.
- If it is refused, relay the CLI's message as returned and offer: (a) wait and check again later, (b) a protected buy now at the current price, stating it, or (c) another stock. **Never fall back to a market order on your own.**
- If it is accepted, first run the Bitstock check once and show it, and tell the user the order will execute later at the trigger without a new Bitstock check. Ask for a yes before placing it.

## What to say and not say

- Say what the checks found, with the numbers from the output. Do not invent numbers or add any not in the output.
- Do not say "guaranteed", "risk-free", "protects you from loss", or that the wallet can trade beyond the limits set in the Binance App.
- This runs inside the user's own Agentic Wallet, within the limits they set in the Binance App. It is not hosted trading for anyone else.
- If Bitstock is unreachable (exit code 5), say so and do not buy: no check, no buy.
