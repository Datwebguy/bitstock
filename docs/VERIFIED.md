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
| Region | IP checks are enforced on **both the Developer Portal and the API server**. Prohibited: US (and Guam, Northern Mariana Islands, Puerto Rico, US Virgin Islands, American Samoa, US Minor Outlying Islands), Canada, Netherlands, Iran, Cuba, North Korea, Crimea, Donetsk, Luhansk, United Kingdom, and Japan unless three conditions hold (Binance login, KYC country not prohibited, server IP in Japan). Create the key from an allowed location and host the server in one. |
| API key permissions | Keys are bound to capability domains (Trading, Market, Wallet, Transaction, DeFi, B402). Select the domains needed when creating or editing a key; a missing domain returns HTTP 403, code `40104`. Bitstock needs Market (includes RWA Data), Trading, Transaction and Wallet. B402 is optional. |
| Rate limits | Documented in the Authentication page: per IP 1,200 requests / 60 s; per API key 1,200 / 60 s; per user 6,000 / 60 s; per endpoint 5 requests/s by default. Exceeding returns HTTP 429, code `42900`, with a `Retry-After` header. Cache reads (30 s is enough for status and prices) and back off on 429. |

---

## 3. Endpoints this build uses (correct paths, parameters, fields)

### RWA Data (all GET, signed)

| Endpoint | Parameters | Returns (verified fields) |
|---|---|---|
| `/api/v1/dex/market/rwa/tokens` | `binanceChainId` (56), `platformId` (`ondo` or `bstock`), `tabId` (sector 1 to 13, e.g. 9 = Magnificent 7, 4 = AI Chips) | per token: `tokenContractAddress`, `platformId`, `assetType` (1 stock, 2 pre-IPO, 3 ETF), `tokenName`, `tokenSymbol`, `tokenLogoUrl`, `decimals`, `underlyingTicker`, `underlyingName`, a **market-status object**, `tokenPrice`, `referencePrice`, `volume24H`, `marketCap`, `peRatioTTM` |
| `/api/v1/dex/market/rwa/price` | `binanceChainId`, `tokenContractAddresses` (comma-separated, max 100, **required**) | `tokenPrice`, `referencePrice`, `tokenPriceUpdatedAt` |
| `/api/v1/dex/market/rwa/search` | `keyword`, optional `platformId` | token matches |
| `/api/v1/dex/market/rwa/underlying-profile` | `binanceChainId`, `tokenContractAddress` | company information. **UNVERIFIED field names.** Probe it and record. |
| `/api/v1/dex/market/rwa/underlying-market` | `binanceChainId`, `tokenContractAddress` | the market-status object plus market data: `referencePrice`, `high52W`, `low52W`, `avgDailyVolume1Y`, `marketCap`, `turnoverRate`, `amplitude`, `peRatioTTM`, `pbRatio`, `dividendYield`, and a latest-dividend field (exact name UNVERIFIED) |

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
- **Market hours error:** for bStocks, `/quote` can return **`40369 BSTOCK_INVALID_TRADING_TIME`** ("underlying stock exchange is currently closed"). For Ondo it is `40367`. **UNVERIFIED whether the NVDAB LiquidMesh SWAP route refuses quotes while the US market is closed.** Prompt 1 tests this on a weekend. The answer decides which path the build takes (see `AGENTS.md` section 8).
- **Docs ambiguity to test:** the integration flow says call `/approve-transaction` before `/quote` (vendor omitted) for regular swaps, while the equity section says `vendor` is required in approve for equity tokens and `vendorName` only exists after a quote. USDT is the sell token here, so the approve is for USDT, not the stock. Test which order works and record it.
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

## 4. NVDAB on-chain facts (read from BSC mainnet, 10 Oct 2026)

| Fact | Value | Source |
|---|---|---|
| Address | `0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436` | Matches a third-party public asset list, and the contract answered below |
| `symbol()` / `name()` | `NVDAB` / `NVIDIA Corp` | `eth_call` |
| `decimals()` | 18 | `eth_call` |
| `uiMultiplier()` (selector `0xa60bf13d`) | `1000778223752807865` = **1.0007782237528078** | `eth_call` |
| `newUIMultiplier()` / `effectiveAt()` | same value / 0 (nothing pending) | `eth_call` |
| `toUIAmount(1e18)` | same as `uiMultiplier()` | `eth_call` |
| `totalSupply()` | about 201,305 tokens | `eth_call` |
| `multiplier()`, `scaledBalanceOf(address)`, `sharesMultiplier()` | **revert**, do not exist | `eth_call` |

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
