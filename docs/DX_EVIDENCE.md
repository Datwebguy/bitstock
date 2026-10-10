# DX_EVIDENCE.md: raw friction log (the report itself is yours to write)

The hackathon rejects generated or perfunctory reports. This file is not the report. It is the evidence you will write the report from, in your own words: what you actually hit, when, and proof.

Format, one line per event:

`YYYY-MM-DD HH:MM UTC | area | what happened | evidence (file, URL, status code, error body)`

Only log what you personally ran or saw. If a line below came from someone else, do not copy it into your report unless you reproduced it.

## The seven questions the form asks (so you log toward them)

| Form topic | What to note while building |
|---|---|
| Onboarding | Time from opening the docs to the first successful signed call. Where you got stuck. |
| Documentation issues | The exact page and place of any error. "Vague feedback does not count." |
| API pitfalls | Error messages that made no sense, edge cases, latency (log the numbers). |
| AI stack | Did you use Wallet Skills, Agentic Wallet or the CLI? What worked, what did not, what is missing. |
| Tokenized-stock specifics | Liquidity depth, slippage, behaviour while the US market is closed, the gap between on-chain and reference price, how bStocks, Ondo and xStocks differ. |
| Redesign suggestions | How you would rebuild the developer platform so someone can make a call the moment they land. |
| Requested capabilities | Endpoints, SDK support or tooling you wish existed. |

## Things to test on purpose (each could become a specific, honest line)

These came from reading the documentation. They are questions, not findings. Each becomes a finding only after you run it.

1. **Nested object names.** The reference prints the market-status object in the RWA token list and the transaction object in the swap response as "object" with no key name. Did you have to locate them by shape? How long did that take?
2. **Reference price independence.** The reference says `referencePrice` is derived from the on-chain token price, not an official quote. Does comparing `tokenPrice` to `referencePrice` ever show a gap? What did you use instead?
3. **Approve ordering.** The integration flow says to call approve before quote and omit vendor; the equity section says vendor is required for equity tokens and only exists after a quote. USDT is the sell token here. Which order worked? What did the wrong order return?
4. **Closed-market quotes.** What did `/quote` return for NVDAB on a weekend: a SWAP route, or `40369`? Does the error text say how to proceed?
5. **Simulation versus reality.** Did `simulate` ever return `SUCCESS` for a trade that the market state should have blocked? Does the response include gas used (the reference says it does not)?
6. **Fee parameter.** Does `feePercent` appear in the response (`feeAmount`, `feeToken`, `actualSwapAmount`)? Is there a clear receipt for the integrator fee? What happens on an RFQ route?
7. **Rate limits.** At what call volume did you see HTTP 429 or code `42900`? Are the limits documented anywhere you could find?
8. **Multiplier access.** Is there any REST endpoint for the scaled multiplier or its history, or did you need direct RPC reads? How did historical logs work on public RPCs (many refuse archive queries)?
9. **Region and network.** Did your network reach `web3.binance.com`? What did a blocked region look like?
10. **Docs for agents.** Was `llms.txt` / `llms-full.txt` reachable by a plain HTTP client? (One fetch from a plain client returned HTTP 202 with an empty body while a browser rendered it.) Reproduce before reporting.
11. **Agentic Wallet.** What could and could not be done: plain-text signing is documented as unsupported; limits are set only in the App; how did a limit order on this token behave?
12. **Agent Studio.** Scaffold-to-registered-identity time, runtime duration and network for the managed trial, any step that needed credentials you did not have.

## Log

<!-- Add lines below as you build. Newest at the bottom. -->

- 2026-10-10 19:35 UTC. First signed call, `GET /build/api/v1/dex/market/rwa/tokens?binanceChainId=56&platformId=bstock`, from the build container (egress country reported by ipinfo.io: US). HTTP 200, envelope `code 40304`, `msg "Service not available due to compliance restriction"`. The signature was accepted (no 40101/40102), so this is the region block, returned as HTTP 200 and not as a 4xx. `40304` is not in the error codes I had from the reference. Evidence: `docs/evidence/01-rwa-tokens-bstock.json`, `docs/evidence/calls.jsonl`.
- 2026-10-10 19:53 UTC. Hosting the Binance calls outside the blocked region: created Railway project `bitstock` (personal workspace), service `agent` from the GitHub repo, region `asia-southeast1-eqsg3a` (Singapore), volume at `/data`, public domain. `GET /healthz` from the public URL reports egress country `SG` and commit `306657c`, against `US` from the build container. Friction: the Railway MCP `set-variables` tool takes literal values, so a secret held only in a local `.env` cannot be passed by reference; the three Binance variables were therefore left unset and the probe has not been run from the new host. Evidence: Railway deployment `15fbd26e-c3cf-469e-a4b1-9ec072700ff9` (SUCCESS), the `/healthz` output.
- 2026-10-10 20:10 UTC. First successful signed call, from the Railway service in `asia-southeast1-eqsg3a` (egress SG): `rwa/tokens` HTTP 200, code 0, 46 tokens. Same call from a US egress had returned `40304` as HTTP 200. Differences from the reference: the market-status object's key is `statusInfo`; `marketStatus` is `null` while `openState` is `true` on a Saturday; the response carries `tokenToShareRatio`, which my notes had as absent; `tokenContractAddress` is lower case; `/rwa/price` and the token list give different numbers under the name `tokenPrice` (see `docs/VERIFIED.md` section 3a). Evidence: `docs/evidence/b1-rwa-tokens-bstock.railway-sg.json`, `b2-...`, `b3-...`.
- 2026-10-10 20:10 UTC. Setting up the host: the first call with the admin token returned 401 and the same token worked about two minutes later with no change on my side (the redeploy was probably still applying the new variable). Separately, the `BSC_RPC_URL` value on the host was saved with the text `BSC_RPC_URL=` in front of the URL, so the RPC probe failed with "Failed to parse URL"; the Railway dashboard accepts a pasted `NAME=value` line as the value without warning.
- 2026-10-10 21:05 UTC. Closed-market test, Saturday: the quote for USDT to NVDAB returned a LiquidMesh SWAP route (no `40369`, no RFQ route) at $1 and $10, price impact about 0.0006 percent. The Transaction API `simulate` of the built swap returned `status FAILED`, `failReason "execution reverted: BEP20: transfer amount exceeds allowance"`, empty `balanceChanges`. The reference does not say the simulator needs the allowance in place, so a swap cannot be dry-run until the approval is on chain. `/approve-transaction` returned the same result before and after the quote, which settles the ordering question in the reference. After saving a variable on the host, `/healthz` showed it about 25 seconds later (a redeploy), which looks like a failure if you call too early. Evidence: `docs/evidence/b4-...`, `b5-...`, `b6-...`.
- 2026-10-10 21:09 UTC. Independent price source: Pyth Hermes lists `Equity.US.NVDA/USD` in `/v2/price_feeds`, but `/v2/updates/price/latest` returned HTTP 401 "unauthorized" for every feed tried (equity and crypto), so a source the docs ecosystem points to needs credentials. Nasdaq's quote API gave the right price with a wrong date. Chose Yahoo's chart API (see `docs/VERIFIED.md` section 6a).
- 2026-10-10 21:19 UTC. First full guard run, $1 of NVDAB from the Singapore host: session pass (Saturday, `TRADING`), multiplier pass, independent price warn (+0.46% against Friday's close), route pass (LiquidMesh SWAP, `priceImpactPercent` "0.0000000000"), dry run fail (allowance 0). Outcome BLOCK, with the reason "approve first". The quote reported a price impact of exactly zero at that moment. Evidence: `docs/evidence/guard-nvdab-1usd.railway-sg.json`.
- 2026-10-10 21:28 UTC. Pyth Pro with the owner's API key: `latest_price` for NVDA (feed 1314) returned HTTP 403 "Not entitled: feed 1314 (no grant accepts this feed (asset type 'equity', instrument type 'spot', exchange 1))". The key works but the plan does not include US equity feeds; nothing in the getting-started pages says which plans include which asset classes. The Pro REST page also shows no example response for `latest_price`. The guard fell back to Yahoo and named the fallback in its decision record. Evidence: `docs/evidence/pyth-pro-latest-nvda.railway-sg.json`.
- 2026-10-10 about 21:38 UTC. Verifying that NVDAB emits `UIMultiplierUpdated`: no free BSC endpoint served historical logs or historical state (PublicNode: archive needs a personal token beyond about 50,000 blocks; bsc-dataseed: `eth_getLogs` "limit exceeded" for any range; blockrazor: 25-block ranges, no historical state; drpc 429; 1rpc usage limit; ankr key required; BscScan 403 to scripts). Could only confirm the event topic is present in the beacon implementation's bytecode. Evidence: `docs/evidence/nvdab-event-search.json`.
- 2026-10-10 21:40 UTC. Dividend sanity check: the Binance RWA API gives `latestDividend` "0.250000" without a date or a withholding rate, so the comparison needed a second source (Yahoo events give the ex-date). The bStocks issuer's withholding rate was not found in the API. Evidence: `docs/evidence/dividend-check-nvdab.json`.
- 2026-10-10 22:10 UTC. Gas from the swap API: for the same 1 USDT to NVDAB LiquidMesh swap, `/aggregator/swap` returned `tx.gas` 250000 while `eth_estimateGas` for that exact transaction from the buyer's wallet returned 613398 (about 2.45 times more). Sending with the API's figure would most likely have run out of gas. The prepared transaction uses the larger figure plus 25 percent (766747). The Transaction API `simulate` response gives no gas figure, so this needed a separate node call. Evidence: `docs/evidence/decision-mode-a-1usd.railway-sg.json` (`prepared.gasSources`).
- 2026-10-10 22:12 UTC. First real buy (1 USDT to 0.004333697515150079 NVDAB, tx 0x526643d7…e8c1, block 126905587). The swap API again suggested `tx.gas` 250000; the node estimated 1122985 for this route (613398 for a route three minutes earlier); the swap used 939279. A wallet using the API's figure would have run out of gas. Separately, PublicNode refused `eth_getTransactionReceipt` for this just-confirmed transaction as an "archive request", so receipt lookups were moved to the official `bsc-dataseed.bnbchain.org`, which answered. The owner's wallet sent the transaction as type 2 (EIP-1559) although the app passed a legacy gas price. Evidence: `docs/evidence/mode-a-buy-1usd.json`.

## Measurements to keep (real numbers for the report and the submission)

| Measure | Value | When | Evidence |
|---|---|---|---|
| Time from docs to first successful signed call | | | |
| NVDAB main pool liquidity and 24 h volume at test time | | | |
| Price impact for $1 and $10 buys | | | |
| Gas used and BNB cost of one gasless claim transfer | | | |
| Latency of RWA, quote, swap, simulate calls (median, worst) | | | `docs/evidence/calls.jsonl` |
| Closed-market quote result | | | |
| Multiplier at test time and any scheduled change | | | |
