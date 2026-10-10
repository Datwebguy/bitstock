# VERIFIED.md: facts ledger

Checked on Sat 10 Oct 2026 against the Binance Web3 API reference, the hackathon page data, ERC-8056, and live BSC reads. Every row says where it came from. **Rows marked UNVERIFIED must be tested and the result written back here.** Raw evidence goes in `docs/evidence/`.

Rule for this file: when a live call disagrees with a row, the live call wins. Paste the raw response into `docs/evidence/` and fix the row.

---

## 1. Hackathon facts (official page data)

| Fact | Value |
|---|---|
| Submissions lock | Sun 11 Oct 2026, 12:00 UTC |
| Judging | Page data says 12 to 23 Oct. A second source says screening 12 to 14 Oct, judging 15 to 23 Oct. Either way the deadline is the same. |
| Winners | Week of 26 Oct |
| Prizes | 1st $6,000, 2nd $4,000, 3rd $3,000, 4th $2,000, 5th $1,000. Special: Best Use of Agentic Wallet / Wallet Skills $2,000. Best Use of BNB Agent Studio $2,000. A team can win a placement and a special. |
| Track rules | bStocks, Ondo or xStocks central. Spot only (no perps). BSC mainnet only. Teams fund their own wallets ("a few dollars is enough"). |
| Submit | Public repo, demo video of 4 minutes or less (strongly recommended), deployed link or instructions a judge can follow, plus the Developer Experience Report. |
| Scoring | Technical implementation 30%, Creativity and originality 25%, Developer Experience Report 25%, Product quality and UX 20%. |
| DX report rule | "Perfunctory or AI-generated reports are not accepted." It must be written by the team in their own words. AI-assisted code is fine. |
| Excluded | US, Canada, Netherlands, UK, Japan, Iran, Cuba, North Korea, Crimea, Donetsk, Luhansk. |
| Submission form | https://forms.gle/yToDUzaDMwWnq6R6A |
| DX report form | https://forms.gle/EUQ39xf54GHjC2ys5 |

Hackathon page: the page slug is `tokenized-stocks` on bnbchain.org.

---

## 2. Binance Web3 API: authentication (reference: "Authentication")

| Item | Verified value |
|---|---|
| Base URL | `https://web3.binance.com/build` |
| Signed path | Must include the `/build` prefix. Omitting it is documented as the #1 cause of `40102 Signature error`. |
| Headers | `X-OC-APIKEY`, `X-OC-TIMESTAMP` (ISO 8601 with ms, e.g. `2026-05-11T10:08:57.715Z`), `X-OC-SIGN`, optional `X-OC-RECV-WINDOW` (default 5000, max 60000), optional `X-OC-NONCE` |
| Signature | `Base64(HMAC-SHA256(secret, timestamp + METHOD + requestPath + body))`. `requestPath` includes the raw URL-encoded query string, in the order sent. `body` is the raw JSON string for POST, empty for GET. |
| Envelope | `{ "code": 0, "msg": "success", "data": ..., "timestamp": ..., "success": true }`. `code` 0 is success. |
| Unauthenticated probe | `GET /build/api/v1/dex/market/rwa/tokens` with no key returns HTTP 401 `{"code":40101,"msg":"API Key is required"}` (observed from the build sandbox, 10 Oct). |
| Region | The API refuses requests from restricted regions. Host the server somewhere allowed and test with a signed call before building on it. |
| Rate limit | Not documented in the pages read. A third-party public log recorded `HTTP 429` with code `42900` on the RWA endpoints. UNVERIFIED for this build: cache responses (30 s is enough for status and prices) and back off on 429. |

---

## 3. Endpoints this build uses (correct paths, parameters, fields)

### RWA Data (all GET, signed)

| Endpoint | Parameters | Returns (verified fields) |
|---|---|---|
| `/api/v1/dex/market/rwa/tokens` | `binanceChainId` (56), `platformId` (`ondo` or `bstock`), `tabId` (sector 1 to 13, e.g. 9 = Magnificent 7, 4 = AI Chips) | per token: `tokenContractAddress`, `platformId`, `assetType` (1 stock, 2 pre-IPO, 3 ETF), `tokenName`, `tokenSymbol`, `tokenLogoUrl`, `decimals`, `underlyingTicker`, `underlyingName`, a **market-status object**, `tokenPrice`, `referencePrice`, `volume24H`, `marketCap`, `peRatioTTM` |
| `/api/v1/dex/market/rwa/price` | `binanceChainId`, `tokenContractAddresses` (comma-separated, max 100, **required**) | `tokenPrice`, `referencePrice`, `tokenPriceUpdatedAt` |
| `/api/v1/dex/market/rwa/search` | `keyword`, optional `platformId` | token matches |
| `/api/v1/dex/market/rwa/underlying-profile` | `binanceChainId`, `tokenContractAddress` | company information. Field names verified live 2026-10-10, see section 3a. |
| `/api/v1/dex/market/rwa/underlying-market` | `binanceChainId`, `tokenContractAddress` | the market-status object plus market data: `referencePrice`, `high52W`, `low52W`, `avgDailyVolume1Y`, `marketCap`, `turnoverRate`, `amplitude`, `peRatioTTM`, `pbRatio`, `dividendYield`, and `latestDividend` (field name verified live 2026-10-10, see section 3a) |

**Market-status object (verified fields):**

| Field | Values |
|---|---|
| `openState` | boolean: is the underlying market tradable now |
| `marketStatus` | `premarket`, `regular`, `postmarket`, `overnight`, `closed`, `pause` (lower case) |
| `reasonCode` | `TRADING`, `MARKET_CLOSED`, `MARKET_PAUSED`, `MARKET_MAINTENANCE`, `ASSET_PAUSED`, `ASSET_LIMITED`, `UNSUPPORTED` |
| `reasonMsg` | e.g. "Weekend or Holiday". For `ASSET_PAUSED`: `cash_dividend`, `stock_dividend`, `stock_split`, `merger`, `acquisition`, `spinoff`, `maintenance`, `corporate action`. For `ASSET_LIMITED`: `earnings`. |
| `nextOpenTime`, `nextCloseTime` | Unix ms or null |

The reference pages **do not name the key** of this nested object (they print it as "object"). Locate it by shape: the object that contains `openState`. The same applies to the transaction object in the swap response (find the object with `from`, `to`, `data`).

**Important:** `referencePrice` is documented as "a per-share converted price derived from the on-chain token price, not an official quote from the traditional stock market." It is **not independent**. Do not use `tokenPrice` versus `referencePrice` to measure a weekend gap. It will read about zero by construction. See section 6.

### 3a. Live results from a host in an allowed region (2026-10-10, Saturday, about 20:10 UTC)

Run by `GET /v1/admin/probe?n=1|2|3` on the Railway service in `asia-southeast1-eqsg3a` (egress country SG). The same signed call from the build container (egress US) returned `40304` (`docs/evidence/01-rwa-tokens-bstock.json`). Raw responses: `docs/evidence/b1-rwa-tokens-bstock.railway-sg.json`, `b2-rwa-underlying-nvdab.railway-sg.json`, `b3-rwa-price-nvdab.railway-sg.json`.

| Fact | Live result |
|---|---|
| Region refusal | `40304 "Service not available due to compliance restriction"` arrives as HTTP 200 with an envelope code (not a 4xx). From Singapore the same signed call returned HTTP 200, code 0. The key, secret and signing are correct. |
| `/rwa/tokens?binanceChainId=56&platformId=bstock` | A top-level **array** of 46 tokens. `tokenContractAddress` is returned **lower case**. |
| Market-status object | Its key is **`statusInfo`** (found by shape as designed). Fields: `openState`, `marketStatus`, `reasonCode`, `reasonMsg`, `nextOpenTime`, `nextCloseTime`. |
| NVDAB status on a Saturday | `openState: true`, `reasonCode: "TRADING"`, `marketStatus: null`, `reasonMsg: null`, `nextOpenTime: null`, `nextCloseTime: null`. So the API did **not** report the market as closed on a weekend, and `marketStatus` is `null` here although the reference lists lower-case values. The guard must treat a null `marketStatus` as "not known" and must not assume weekends read as closed. Whether this holds for quotes is not tested yet (probe 4). |
| Token fields in the list | `binanceChainId`, `tokenContractAddress`, `platformId`, `assetType` (1), `tokenName` ("NVIDIA (bStocks)"), `tokenSymbol`, `tokenLogoUrl`, `decimals` (string "18"), `underlyingTicker`, `underlyingName`, `underlyingNameZh`, **`tokenToShareRatio`**, `tags` (["alpha"]), `statusInfo`, `tokenPrice`, `referencePrice`, `volume24H`, `marketCap`, `peRatioTTM`. |
| `tokenToShareRatio` | **Present in the live response** (list and profile) and equal to the on-chain `uiMultiplier()` read earlier: `1.000778223752807865`. AGENTS.md section 12 says this name is not in the API reference; the live response disagrees, so that row needs the owner's review. Bitstock still reads the multiplier from the chain, and treats this field as a cross-check only. |
| Price fields disagree in meaning between endpoints | List: `tokenPrice` 230.70940392173479711845, `referencePrice` 230.53 (`tokenPrice` / ratio = 230.53 exactly). `/rwa/price`: `tokenPrice` "230.53000000", `referencePrice` "230.350736", `tokenPriceUpdatedAt` 1791663004630 (2026-10-10T20:10:04.630Z); here `referencePrice` = `tokenPrice` / ratio. So `/rwa/price` `tokenPrice` equals the list's `referencePrice`. Which one is the on-chain token price is **not settled**. Do not use either as a token price until it is compared with a live pool price. |
| `/rwa/underlying-profile` | `binanceChainId`, `tokenContractAddress`, `platformId`, `underlyingTicker`, `underlyingFullName` ("NVIDIA (bStocks)", which is the token's name), `assetType`, `tokenToShareRatio`, `protections.collateralReport {supported, description, url}`, `companyInfo {ceo, website, industry, conceptsEn, conceptsCn, description, descriptionZh}`. |
| `/rwa/underlying-market` | `statusInfo` plus `marketData {referencePrice (null), high52W, low52W, volumeShares24H, avgDailyVolume1Y (null), totalShares (null), marketCap, turnoverRate (null), amplitude (null), dividendYield, latestDividend, peRatioTTM, pbRatio}`. Several fields are null, so the app must show "unavailable" for them. |
| Dividend fields | `latestDividend` = "0.250000" and `dividendYield` = "0.00120000" (units and date not stated by the API). Not yet compared with the multiplier change; that check belongs to the explainer step. |

#### Trading probes (probes 4 to 6), Saturday 2026-10-10, about 21:05 UTC

Raw: `docs/evidence/b4-trading-quote-usdt-nvdab.railway-sg.json`, `b5-swap-build-and-simulate.railway-sg.json`, `b6-approve-transaction-usdt.railway-sg.json`. USDT is `0x55d398326f99059fF775485246999027B3197955` (18 decimals), NVDAB `0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436`.

| Fact | Live result |
|---|---|
| Quote while the US market is closed (Saturday) | **HTTP 200, code 0. One route, `vendorName` LiquidMesh, `executionMode` SWAP, `isBest` true.** No `40369`, and no PcsXRfq/RFQ route was offered. So `AGENTS.md` section 10, first row applies: a SWAP route is available. |
| $1 quote | `toTokenAmount` 4334315581714481 (0.004334 NVDAB), `priceImpactPercent` 0.0006252806, `estimateGasFee` 250000, `tradeFee` 0.00975883. Implied price 230.717 USDT per token. Path: USDT to ETH to BTCB to USDC to NVDAB over several pools. |
| $10 quote | `toTokenAmount` 43340475858576217, `priceImpactPercent` 0.0005158263, implied 230.731 USDT per token. Path: one PancakeSwap V3 hop. |
| Price agreement | The implied $1 price (230.717) is within 0.01% of the token list's `tokenPrice` (230.709). That suggests the list's `tokenPrice` is the per-token price and the `/rwa/price` `tokenPrice` (230.53) is per share. Supported by this one reading only; not settled. |
| Quote fields | `quoteId`, `vendorName`, `executionMode`, `binanceChainId`, `fromTokenAmount`, `toTokenAmount`, `tradeFee`, `estimateGasFee`, `priceImpactPercent`, `router`, `fromToken`/`toToken` (`tokenContractAddress`, `tokenSymbol`, `tokenUnitPrice`, `decimal`, `isHoneyPot`, `taxRate`), `dexRouterList`, `approveTarget`, `isBest`, `feeAmount`, `feeToken`, `actualSwapAmount`. The last three are `null` without a fee. |
| Fee parameters | With `feePercent=0.15` and `feeSource=FROM_TOKEN`: $1 gives `feeAmount` 1500000000000000 (0.0015 USDT), `feeToken` USDT, `actualSwapAmount` 998500000000000000; $10 gives 15000000000000000 and 9985000000000000000. Output drops by 0.15% to match. |
| Approve spender | `approveTarget` in the quote is `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5` and it is the same address returned by `/approve-transaction` as `dexContractAddress`. |
| `/approve-transaction` | Returns an array with one item: `data` (ERC-20 `approve(spender, amount)`, selector `0x095ea7b3`), `dexContractAddress`, `gasLimit` "70000", `gasPrice`. The result was identical in all three orders tried: without vendor and before any quote; with `vendor=LiquidMesh`; with `vendor=LiquidMesh` after a quote. Use the simplest. |
| `/swap` response | Keys `executionMode`, `routerResult`, `tx`, `rfq`. The transaction object sits under `tx` and is also found by shape (`from`, `to`, `data`). `routerResult` repeats the route and has its own `toTokenAmount` (4334179567267663, slightly different from the quote a moment earlier, so the price moves between calls). |
| Transaction API `simulate` (no USDT allowance yet) | HTTP 200, code 0, but `status` **FAILED**, `failReason` "execution reverted: BEP20: transfer amount exceeds allowance", `balanceChanges` [] and `allowanceChanges` []. The simulator is stateful and honest: without an approval it does not pretend. So the guard must check the USDT allowance first, require the approve step, and only then expect a SUCCESS simulation. A failed simulation for a missing allowance is not the same as a market problem and must say so. A SUCCESS result with `balanceChanges` showing NVDAB arriving has **not** been seen yet. |

Still not verified: a `SUCCESS` simulation with the stock token arriving (needs an approved allowance and a funded wallet), the gas figure from the `gas-limit` endpoint, and `40369` for NVDAB.

### Trading (GET, signed)

| Endpoint | Key parameters | Notes |
|---|---|---|
| `/api/v1/dex/aggregator/quote` | `binanceChainId`, `fromTokenAddress`, `toTokenAddress`, `amount` (smallest unit), `userWalletAddress`, optional `vendor`, optional `feePercent` + `feeSource` | Route fields used: `quoteId`, `vendorName`, `toTokenAmount`, `priceImpactPercent`, `executionMode` (`SWAP` or `RFQ`), `approveTarget`, `isBest`, `estimateGasFee`. Quote ID expires in about 30 s. |
| `/api/v1/dex/aggregator/swap` | same plus `quoteId`, `slippagePercent` **or** `autoSlippage=true`, `userWalletAddress` (required), optional `feePercent` + exactly one of `fromTokenReferrerWalletAddress` / `toTokenReferrerWalletAddress` | Returns an unsigned tx object: `from`, `to`, `data`, `value`, `gas`, `gasPrice`, `maxPriorityFeePerGas`, `minReceiveAmount`, `slippagePercent`, plus `executionMode` |
| `/api/v1/dex/aggregator/quote-and-swap` | quote parameters, `vendor=LiquidMesh` (the only value supported) | One call instead of two |
| `/api/v1/dex/aggregator/approve-transaction` | `binanceChainId`, `tokenContractAddress`, `approveAmount`, `vendor` | Returns approve calldata and `dexContractAddress` (the spender) |

- **Routing for bStocks (type 3):** LiquidMesh (SWAP) plus PcsXRfq (RFQ), possibly both returned together. Ondo tokens are always RFQ. xStocks are normal AMM swaps. A given token belongs to one type only.
- **Only SWAP routes can be dry-run.** Refuse RFQ routes in this build.
- **Custom fee:** parameter is `feePercent`, a decimal string in `(0, 5]` with at most 2 decimals (e.g. `"0.15"`). There is **no** `feeRate` parameter. RFQ routes ignore fee parameters. Quote and swap must agree on direction and percent or you get `SWAP_QUOTE_MISMATCH (40462)`. The response echoes `feeAmount`, `feeToken`, `actualSwapAmount` when a fee is on.
- **Market hours error:** for bStocks, `/quote` can return **`40369 BSTOCK_INVALID_TRADING_TIME`** ("underlying stock exchange is currently closed"); for Ondo it is `40367`. **Tested live on Saturday 2026-10-10: NVDAB quoted normally with a LiquidMesh SWAP route and no `40369`** (section 3a). The `40369` behaviour is still unobserved for NVDAB; keep handling it.
- **Approve order (tested live, section 3a):** `/approve-transaction` works both before and after the quote, with or without `vendor=LiquidMesh`, and returns the same calldata and spender in each order.
- Quote expiry error: `QUOTE_EXPIRED (40401)`.

### Transaction (signed)

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/v1/dex/pre-transaction/simulate` | `{ "binanceChainId": "56", "evmTx": { "from", "to", "value", "data" } }` | `status` (`SUCCESS` or `FAILED`), `failReason`, `balanceChanges[]` (`contractAddress`, `tokenType`, `change` signed integer string, `owner`), `allowanceChanges[]` |
| `POST /api/v1/dex/pre-transaction/broadcast-transaction` | `{ "binanceChainId", "signedTransaction", "address", "enableMevProtection"? }` | tx hash and order id |
| `POST /api/v1/dex/pre-transaction/gas-limit` | per docs | gas figure for a simulated tx |
| `GET /api/v1/dex/post-transaction/transaction-detail-by-txhash` | `binanceChainId`, `txHash` | final status |

`/api/v1/transaction/simulate` does not exist; the simulate path is the one above. The simulate response has **no gas-used field**; use `gas-limit` for that.

### Paths that look plausible but do not exist

`https://api.binance.com/api/v1/rwa/stock/detail`, `https://web3.binance.com/api/v1/market/depth`, and the `X-MBX-APIKEY` header. These are not part of the Web3 API.

---

## 4. NVDAB on-chain facts (read from BSC mainnet via `https://bsc-rpc.publicnode.com`, block 126884940, 2026-10-10 19:37 UTC)

Raw results: `docs/evidence/07-onchain-nvdab.json` (reproduce with `node packages/chain/scripts/probe-onchain.ts`). Selectors were computed with the repository's own keccak256, which is tested against published vectors.

| Fact | Value | Source |
|---|---|---|
| Address | `0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436` | Matches a third-party public asset list, and the contract answered below |
| `symbol()` / `name()` | `NVDAB` / `NVIDIA Corp` | `eth_call`, verified live |
| `decimals()` | 18 | `eth_call`, verified live |
| `uiMultiplier()` (selector `0xa60bf13d`) | `1000778223752807865` = **1.000778223752807865** | `eth_call`, verified live |
| `newUIMultiplier()` (selector `0xdc767007`) / `effectiveAt()` (selector `0x97a4064f`) | same value as `uiMultiplier()` / 0 (nothing pending) | `eth_call`, verified live |
| `toUIAmount(uint256)` (selector `0x3248d4ff`) with 1e18 | `1000778223752807865`, same as `uiMultiplier()` | `eth_call`, verified live |
| `totalSupply()` | `201316210011080000000000` raw = about 201,316.21 tokens at this block (the earlier ledger said about 201,305; supply changes, so never hardcode it) | `eth_call`, verified live |
| `multiplier()` (selector `0x1b3ed722`) | **reverts** ("execution reverted"), does not exist | `eth_call`, verified live |
| `scaledBalanceOf(address)`, `sharesMultiplier()` | revert, do not exist | Earlier `eth_call`; not re-run in this probe |
| RPC | `eth_chainId` returns 56; public node latency 45 to 81 ms per call | Same run |

**The function is `uiMultiplier()`, not `multiplier()`.** The standard is **ERC-8056 "Scaled UI Amount"**. "BEP-8056" is not a name that exists. The BNB docs and third-party notes also call the family "BEP-677". Say "ERC-8056 scaled UI amount (BEP-677 in BNB docs)" or just "scaled UI amount".

ERC-8056 interface (from the EIP):

- `event UIMultiplierUpdated(uint256 oldMultiplier, uint256 newMultiplier, uint256 effectiveAtTimestamp)`. Topic 0 computed from this signature: `0x2205df4534432b2f60654a3fdb48737ffdaf3e9edb1a498bd985bc026b15b055`. **UNVERIFIED that this contract emits it. Check against a real log.**
- `function uiMultiplier() view returns (uint256)`, 18 decimals (1e18 = 1.0). It returns the pending value once `block.timestamp >= effectiveAt`.
- `newUIMultiplier()` and `effectiveAt()` (pending value and its start time).
- Optional: `toUIAmount(raw)`, `fromUIAmount(ui)`, `balanceOfUI`, `totalSupplyUI`.
- Interface IDs: `0xa60bf13d` (`IScaledUIAmount`), `0x4bd27648` (new multiplier), `0x57854fc3` (conversion), `0xd890fd71` (balances).
- `balanceOf` and `totalSupply` stay **raw**. Wallets and protocols should transfer and account in raw amounts and convert only for display. The multiplier change can be scheduled in advance (`effectiveAt`), which is also the early-warning signal for a corporate action.

**UNVERIFIED:** the history claim "1.000000 to 1.000778 on 10 Sept 2026". Public RPCs refuse historical log queries (archive access needed). Verify with a keyed RPC or BscScan's event log tab before the app or video states it.

### How to explain the multiplier correctly

Each raw token represents `uiMultiplier` shares (BNB wallet-skill docs: "each token represents `multiplier` shares, not 1 share"; per-share price = token price divided by the multiplier). When a dividend is reinvested, the multiplier rises and the share price drops by the dividend on the ex-dividend date, so the **token price is roughly continuous**. The holder's dollar value does not "grow while you slept"; it **does not fall by the dividend**. Say:

> "Your token now represents 0.0778% more shares. That is your reinvested dividend (already net of withholding). It offsets the share price drop on the ex-dividend date."

Do **not** subtract 30% again from the multiplier change: the multiplier already reflects the net amount. If the UI shows a gross figure, compute `gross = net / 0.70` and label it as an estimate **only after** the issuer's rate is confirmed.

**Sanity check required before calling it a dividend:** 0.0778% of a share price near $237 is about $0.18 per share. Compare to the dividend per share announced for that date (and the issuer's withholding rate). If it does not match, label it "multiplier change" and say what is known. Do not label what you cannot match.

---

## 5. Liquidity and price context (third-party measurements, with dates)

These are context, not our data. Re-measure before quoting any of them.

| Claim | Source |
|---|---|
| bStocks have the real DEX depth on BSC. Third parties measured NVDAB/USDT on PancakeSwap v3 near $4.2M and TSLAB near $2M on 4 Oct; Ondo pools under $10k; the xStocks pool about $23. | Third-party public log, 4 Oct 2026 |
| On 10 Oct (our pull from DexScreener): main NVDAB/USDT v3 pool liquidity $6.46M, 24 h volume about $248k. A $0.15 to $2 order has no meaningful impact. | DexScreener, 10 Oct 2026 |
| Weekend pool price versus the 24/7 perp stayed within about 36 bps at the extreme (typical 4 to 12 bps), over 117 hours of recording. | Third-party public recording, 6 Oct 2026 |
| About 0.6% weekend premium on NVDAB versus last close, near-zero price impact for 10 to 1,000 USDT. | Third-party public log, 4 Oct 2026 |

**So claims such as "weekend spreads blow out to 2 to 5%" or any beginner drop-off rate are not supported** by anything checked and must not appear in the app, video or report unless measured first-hand. The honest problem statement is: *the gap and halt risk is real but small for small orders; the harm for a beginner is the missing BNB, the missing explanation, and silent corporate actions.*

---

## 6. Reference price: what to use instead

The RWA `referencePrice` is derived from the token's own price, so it cannot show a gap to Wall Street. For a real divergence check you need an **independent** source, such as the last close and live quote from a market-data API, or a different venue. Whatever source is chosen (see `docs/adr/0003`):

1. Verify it live and note its limits (some free sources rate-limit). 
2. Show its name and timestamp in the Guard HUD.
3. If it is unavailable, show "reference unavailable" and fall back to conservative limits. Never show a divergence number that was not computed from two independent prices.

### 6a. Chosen source (checked live 2026-10-10, about 21:10 UTC)

**Chosen: Yahoo Finance chart API**, `GET https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=1d&range=1d`, fields `meta.regularMarketPrice`, `meta.regularMarketTime`, `meta.currency`, `meta.symbol`, `meta.instrumentType`. Raw response: `docs/evidence/reference-yahoo-nvda-chart.json`. Code: `packages/guard/src/reference.ts`, behind an interface so it can be replaced.

| Fact | Live result |
|---|---|
| NVDA last price | 229.28 USD, `regularMarketTime` 1791576000 = 2026-10-09T20:00:00Z (Friday 16:00 New York, the close). HTTP 200, `cache-control: public, max-age=10`. |
| Why it is independent | It is a stock-market price feed, not derived from the BSC token or the Binance pool. |
| Limits | Unofficial and undocumented endpoint: no SLA, no stated rate limit, terms of use not reviewed for this use (**the owner should decide whether that is acceptable**). Not real-time (treated as a last close when older than 30 minutes). It may refuse some server IPs; when it does, the check is "unavailable", which is a warning and never a pass. |
| Candidates rejected | **Pyth Hermes** (`hermes.pyth.network`): the feed list works and has `Equity.US.NVDA/USD`, but every price endpoint returned HTTP 401 "unauthorized" for equity and crypto feeds alike, so it needs credentials we do not have. **Nasdaq quote API** (`api.nasdaq.com/api/quote/NVDA/info`): returned the same price, 229.28, but only a date, and the date was "Oct 8, 2026" while the close it reports was on 9 Oct; a price without a reliable time cannot be shown as the guard requires. **Stooq**: the connection was reset from the build container. |
| Pyth Pro (checked 2026-10-10 21:28 UTC) | Feed `Equity.US.NVDA/USD` is `pyth_lazer_id` 1314 (exponent -5, `min_channel` `fixed_rate@50ms`, state stable), from the public symbols API `https://pyth.dourolabs.app/v1/symbols?query=NVDA` (`docs/evidence/pyth-pro-symbols-nvda.json`). `POST https://pyth-lazer.dourolabs.app/v1/latest_price` with the owner's key returned **HTTP 403 "Not entitled: feed 1314 (no grant accepts this feed (asset type 'equity', instrument type 'spot', exchange 1))"** (`docs/evidence/pyth-pro-latest-nvda.railway-sg.json`). The key is accepted but its plan does not include US equities. Until it does, the guard falls back to Yahoo and its record says so. The Pyth response shape for a successful read is therefore still unverified. |
| Weekend gap at test time | Binance quote for $1: 230.717 USDT per token, 230.50 USD per token after the quote's USDT price (0.99904), so 230.32 USD per share after the multiplier, against the 229.28 close: about +0.45%. Computed from two independent prices at one moment; it is not a typical or expected figure. |

---

## 7. Agentic Wallet: what it is and is not (reference: "Binance Agentic Wallet")

| Fact | Detail |
|---|---|
| Wallet | An MPC keyless wallet created in the Binance App on top of an existing MPC Wallet. Skills install with `npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet`; the `baw` CLI installs on first use. Needs Node 18+. |
| Sign-in | The user signs in from their own agent via a QR / pairing code in the Binance App. Sign-out revokes the agent. |
| Rules | **Daily limit, tradable token scope and high-risk handling are set in the Binance App.** The agent can read them but cannot change them. |
| Capabilities | Swap, transfer, limit orders (a trigger such as "buy X when price drops to Y"), prediction markets, tokenized securities, DeFi. Chains: BSC, Ethereum, Base, Solana. |
| Not supported | **Arbitrary transactions, arbitrary session keys, and plain-text signing (`personal_sign` / EIP-191).** Only EIP-712 typed data is signed. Developer Mode is the one exception, enabled only in the Binance App, time-boxed, with its own spend limit and per-action confirmation. |
| Consequence for gifts | Claim pages that require signing a plain sentence **cannot be completed with an Agentic Wallet**. A claim flow must not require `personal_sign`. Use no signature, or EIP-712 typed data. |
| Commands seen in third-party public notes (not official docs) | `baw wallet status --json`, `baw wallet settings --json`, `baw market-order quote ...`, `baw market-order swap ...`, `baw x402-payment preview/sign` |

**Consequence for delegated buying (Mode B):** there is no "session key with a $5 allowance" that a hosted server can hold for many users. The real model is: **the user's own Agentic Wallet, signed into the user's own agent, within limits the user sets in the Binance App.** Bitstock therefore ships a **Wallet Skill** (a `SKILL.md` plus helper scripts) that any Agentic Wallet user can install. The skill calls our Guard first, then uses `baw market-order` (or a limit order for the dip trigger) inside the user's own limits. The team demonstrates it with its own Agentic Wallet. Never claim hosted autonomous trading for strangers' wallets.

---

## 8. BNB Agent Studio and gas sponsorship

| Fact | Detail | Source |
|---|---|---|
| Prize criteria | "Deepest use of Agent Studio: agent identity, autonomous runtime, self-funding via x402." | Hackathon page |
| Commands seen in public notes | `bag init <name> --protocols A2A,X402 --network bsc-mainnet ...`, `bag erc8004 register` (registration gas sponsored by MegaFuel), `bag dev --logs --host 127.0.0.1 --port 9000`. Package `@bnbagent/studio-cli`. | Third-party public notes, 10 Oct. UNVERIFIED for this build. |
| Managed runtime | A 48 h testnet trial that starts at first deploy. A third party judged it would expire before judging (12 to 23 Oct) and self-hosted on mainnet. | Their public notes. UNVERIFIED. |
| Paid x402 | Needs B402 merchant credentials. A third party reported the application was closed and shipped a free x402 endpoint. | Their public notes. UNVERIFIED. |
| B402 gas | B402 is Binance's x402 on BNB Smart Chain. The buyer signs an EIP-712 authorization and the facilitator sponsors gas for the **payment settlement**. The buyer needs no BNB for that payment. | Binance developer docs (search result) |

B402 is **not** a general paymaster. It sponsors gas for x402 payment settlement only. It does not sponsor ERC-20 transfers or swaps. The honest gasless claim is: **our relayer wallet pays the BNB for the transfer.** (Another sponsor mechanism, MegaFuel, exists for BNB Chain; whether it can sponsor arbitrary contract calls for this app is UNVERIFIED. Do not claim it.)

---


## 9. Statements Bitstock does not make (also in AGENTS.md section 12)

| Claim | Why |
|---|---|
| Any beginner drop-off percentage | No source |
| "Weekend spreads widen to 2 to 5%" / "3 to 5%" / "2 to 4%" | Contradicted by measured data (section 5) |
| "marketStatus lacks PRE_MARKET / AFTER_HOURS" | False: the enum has `premarket`, `postmarket`, `overnight` |
| `tradingHalt`, `tokenToShareRatio` fields | Not in the reference. Use `openState`, `reasonCode`, `reasonMsg`. |
| `multiplier()` | Does not exist. Use `uiMultiplier()` |
| "BEP-8056" | Not a real name. ERC-8056 |
| "b402 paymaster" | B402 sponsors payment settlement only |
| `feeRate: 15` | Parameter is `feePercent` |
| "session key with a $5 allowance" | Not how Agentic Wallet works |
| "Your holdings grew by $X while you slept" | The token price is continuous across a reinvested dividend (section 4) |
| "subtract 30% tax from the multiplier" | The multiplier is already net |
| Any number not read from a live source | Real data only |
