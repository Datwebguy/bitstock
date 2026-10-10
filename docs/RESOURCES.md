# Resources

Every link, contract and reference this project relies on, in one place. "Checked" means it was loaded or read on Sat 10 Oct 2026. Pages on `web3.binance.com` and `developers.binance.com` answer scripts with an empty HTTP 202 (a browser challenge) and load normally in a browser; their text was read through a browser. Block explorers and some sites refuse scripted requests; they load in a browser.

## 1. Hackathon

| What | URL | Status |
|---|---|---|
| Hackathon page (BNB Hack: Tokenized Stocks Edition) | https://www.bnbchain.org/en/hackathons/tokenized-stocks | Checked (loads) |
| Announcement blog | https://www.bnbchain.org/en/blog/bnb-hack-tokenized-stocks-edition-with-binance-web3-wallet | Checked (loads) |
| Project submission form | https://forms.gle/yToDUzaDMwWnq6R6A | Checked (loads) |
| Developer Experience Report form | https://forms.gle/EUQ39xf54GHjC2ys5 | Checked (loads) |
| Builder Telegram group | https://t.me/+MhiOLT0YUnlmNWFk | From the hackathon page; not opened |
| BNB Chain Discord | https://discord.gg/bnbchain | From the hackathon page; not opened |

Key facts: submissions lock **Sun 11 Oct 2026 12:00 UTC**; judging 12 to 23 Oct; winners the week of 26 Oct; BSC mainnet only; spot only; at least one of bStocks, Ondo or xStocks central; excluded jurisdictions listed in `AGENTS.md` section 0.5. Scoring: technical implementation 30%, creativity and originality 25%, Developer Experience Report 25% (written by the team by hand), product quality and UX 20%. Prizes: $6,000 / $4,000 / $3,000 / $2,000 / $1,000, plus two $2,000 specials (Agentic Wallet / Wallet Skills; BNB Agent Studio).

## 2. Binance Web3 API

| What | URL | Status |
|---|---|---|
| Documentation home | https://web3.binance.com/en/dev-docs | Read in a browser |
| Authentication (HMAC signing) | https://web3.binance.com/en/dev-docs/authentication | Read in a browser |
| Service-restricted regions | https://web3.binance.com/en/dev-docs/web3-api-prohibited-regions | Link present; read in a browser before hosting |
| Developer portal (API key) | https://web3.binance.com/en/dev-portal/project | Link from the docs |
| Full reference as plain text (for tools) | https://web3.binance.com/en/dev-docs/llms-full.txt | Read in a browser (451 KB) |
| Index as plain text | https://web3.binance.com/en/dev-docs/llms.txt | Read in a browser |
| RWA Data reference | https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data | Read in a browser |
| Agentic Wallet introduction | https://web3.binance.com/en/dev-docs/products/agentic-wallet/introduction | Read in a browser |
| Agentic Payments (B402 / x402) | https://developers.binance.com/en/docs/products/onchainpay-x402/introduction | Found by search; not read in full |
| Base URL for API calls | `https://web3.binance.com/build` | Verified (unauthenticated call returned HTTP 401 `40101`) |

## 3. Agentic Wallet and skills

| What | Where |
|---|---|
| Install the official skill | `npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet` |
| Skills repository | https://github.com/binance/binance-skills-hub (not reachable from the build sandbox; open it in a browser) |
| CLI | `baw` (installs on first use of the skill; needs Node 18+) |
| Where limits are set | In the Binance App (daily limit, token scope, high-risk handling). The agent can read them and cannot change them |

## 4. Standards

| What | URL | Status |
|---|---|---|
| ERC-8056 Scaled UI Amount | https://eips.ethereum.org/EIPS/eip-8056 | Checked (loads) |
| BNB Chain developer kit: Scaled UI Amount | https://docs.bnbchain.org/developer-kit/scaled-ui-amount/ | Checked (loads) |

Interface (from the EIP): `uiMultiplier()` (18 decimals, 1e18 = 1.0); `newUIMultiplier()` and `effectiveAt()` for a scheduled change; optional `toUIAmount`, `fromUIAmount`, `balanceOfUI`, `totalSupplyUI`; event `UIMultiplierUpdated(uint256 oldMultiplier, uint256 newMultiplier, uint256 effectiveAtTimestamp)` with topic 0 `0x2205df4534432b2f60654a3fdb48737ffdaf3e9edb1a498bd985bc026b15b055` (computed from the signature; not yet confirmed against a real NVDAB log). ERC-165 IDs: `0xa60bf13d`, `0x4bd27648`, `0x57854fc3`, `0xd890fd71`.

## 5. Contracts (BNB Smart Chain, chain ID 56)

| What | Address | How it was verified |
|---|---|---|
| NVDAB (NVIDIA Corp, bStock) | `0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436` | `symbol()` returned NVDAB, `name()` NVIDIA Corp, `decimals()` 18, `uiMultiplier()` read on 10 Oct 2026 |
| USDT (BSC-USD) | `0x55d398326f99059fF775485246999027B3197955` | Appears as the USDT example in the Binance swap reference |
| ERC-8004 identity registry (BSC) | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | Quoted in a third-party public README; **verify on BscScan before use** |

Explorer links (open in a browser):
- NVDAB: https://bscscan.com/address/0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436
- USDT: https://bscscan.com/address/0x55d398326f99059fF775485246999027B3197955

PancakeSwap v3 router and quoter addresses: take them only from PancakeSwap's official deployment list; they are not recorded here because the documentation URL tried returned 404.

## 6. Market and pool context

| What | URL |
|---|---|
| NVDAB pools on DexScreener | https://dexscreener.com/bsc/0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436 (also searchable at https://api.dexscreener.com/latest/dex/search?q=NVDAB) |
| Public BSC RPC (no archive access) | https://bsc-rpc.publicnode.com |
| Official BSC seed RPC | https://bsc-dataseed.binance.org (log queries limited) |

For historical event logs use a keyed archive RPC or BscScan's event log view.

## 7. BNB Agent Studio

| What | Note |
|---|---|
| Prize criteria | "Deepest use of Agent Studio: agent identity, autonomous runtime, self-funding via x402" (hackathon page) |
| CLI package | `@bnbagent/studio-cli` (per public notes; verify the name and version before use) |
| Commands seen in public notes | `bag init`, `bag erc8004 register`, `bag dev` (unverified for this project) |
| Paid x402 | May need B402 merchant credentials; if unavailable, ship the endpoint free and say so |

## 8. Internal documents

| File | Purpose |
|---|---|
| `AGENTS.md` | Engineering manual and hard rules |
| `docs/ARCHITECTURE.md` | System design |
| `docs/adr/` | Architecture decisions |
| `docs/ROADMAP.md` | Plan |
| `docs/VERIFIED.md` | Facts ledger |
| `docs/DX_EVIDENCE.md` | Developer-experience evidence log |
| `docs/SUBMISSION.md` | Submission pack |
