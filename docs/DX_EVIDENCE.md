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
