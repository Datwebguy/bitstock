# Submission pack: BNB Hack, Tokenized Stocks Edition

Deadline: **Sun 11 Oct 2026, 12:00 UTC.** Target: everything submitted by 10:00 UTC, which leaves two hours of buffer. Fill every `[ ]` from real results only. Anything not built stays marked "not built". The Developer Experience Report is written separately, by hand, by the owner.

## 1. Milestones (UTC)

| By | Milestone |
|---|---|
| Sat evening | Signed client; live probes (closed-market quote, simulate, approve order, multiplier reads); closed-market behaviour confirmed |
| Sat night | Guard with stored decisions; chain package and multiplier sentry |
| Sun 02:00 | Front door: fund, commit, one gasless claim with proof |
| Sun 06:00 | **Feature freeze.** Web app complete; wallet skill with one real swap if time allows |
| Sun 08:30 | Video recorded and uploaded |
| Sun 10:00 | Repo public and clean, deployed link verified, both forms submitted |
| Sun 12:00 | Forms lock |

Cut order if time runs short, from the bottom: Studio agent, Mode B skill, Learn, Mode A, guard. The guard and its evidence are the last thing to cut.

## 2. Checklist

| Item | Done |
|---|---|
| Public repo, accessible through judging (12 to 23 Oct) | [ ] The work is on the working branch; merge it into `main` and confirm the repository is public |
| Deployed link that loads without a login | [x] https://bitstock-lilac.vercel.app (also https://bitstock-algo-dao-30577dec.vercel.app and https://web-production-37d6.up.railway.app), every page HTTP 200 without login (checked 10 Oct 23:20 UTC) |
| Demo video, 4 minutes or less, link works | [ ] |
| Project submission form: https://forms.gle/yToDUzaDMwWnq6R6A | [ ] |
| Developer Experience Report form (own words): https://forms.gle/EUQ39xf54GHjC2ys5 | [ ] |
| The same contact email on registration, project submission and the Developer Experience Report | [ ] |
| Every team member confirmed not in an excluded jurisdiction | [ ] |
| README status table matches reality | [x] |
| Repo search: no keys, no banned statements, only the owner in `git log` | [x] see the final scan in the session report |

## 3. Project description

**One line:** Bitstock is a market-aware assistant for small-money investing in tokenized stocks on BNB Smart Chain: before every buy it reads the market, the token, an independent stock price and a dry run of the exact trade, shows you every result, and only then lets you sign a small buy in your own wallet.

**The problem**
- A tokenized stock keeps trading on chain when its exchange is shut. On Saturday 10 Oct 2026 Binance's RWA Data API reported NVDAB as `TRADING` and its Trading API quoted it normally, while NVIDIA's last close was Friday's. A buyer sees a price, not the fact that the stock behind it is not trading.
- A tokenized stock changes while you hold it: a reinvested dividend changes how many shares each token stands for through the ERC-8056 multiplier. NVDAB's `uiMultiplier()` read 1.000778223752807865 on 10 Oct 2026, and wallets do not say what that means.
- The quote and swap APIs give you a transaction, but its suggested gas was 250,000 while the real swap used 939,279; a newcomer who trusted it would have failed.

**What it does**
1. *Check.* Five checks before a buy: market session, multiplier state, an independent price comparison (per share, through the multiplier), a live quote at the exact size on a route that can be dry-run, and a Transaction API dry run that must show the stock arriving in the buyer's wallet. Each is shown with its value, source and time.
2. *Decide.* GO, LIMIT (tighter slippage by a written rule), WAIT (re-checked from scratch later) or BLOCK (one sentence why). Missing data never becomes a guess.
3. *Buy (Mode A, built).* The swap is rebuilt from the checked quote, pinned to the contract the quote named, dry-run again and given a gas limit from the node's estimate; the user signs in their own wallet. One real buy on mainnet: 1 USDT for 0.004333697515150079 NVDAB.
4. *Explain (built).* Holdings in shares, and a multiplier explanation that says "dividend" only when the announcement matches and every input is confirmed. For NVDAB it currently says "multiplier change", because the earlier multiplier and the issuer's withholding rate are not confirmed.
5. *Mode B, checked buys through the user's own Binance Agentic Wallet:* the wallet skill is built and its checks run live; no real Agentic Wallet swap has been made yet.
6. *Front door, a $1 first slice split into ten boxes, with the network fee paid for the recipient:* built and deployed, closed until its wallets are funded; the claim page refuses restricted jurisdictions with HTTP 451.
7. *Studio agent:* registered as ERC-8004 agent 370988; serves `guard_check` and `multiplier_status` from live data with fixed rules.

**Binance Web3 API modules used:** RWA Data (`rwa/tokens`, `rwa/underlying-market`, `rwa/underlying-profile`, `rwa/price`), Trading (`aggregator/quote`, `aggregator/swap`, `aggregator/approve-transaction`), Transaction (`pre-transaction/simulate`). Not used: Market, Wallet, B402, Agentic Wallet, BNB Agent Studio.

**Role of automation:** every decision is a deterministic rule over live data with a versioned config; no language model is used anywhere in the product.

**Proof on BSC mainnet**

| What | Link |
|---|---|
| A real protected buy, 1 USDT to 0.004333697515150079 NVDAB | https://bscscan.com/tx/0x526643d73ed93ad2a90033397710d4d03d41d6835938e722ba647b408666e8c1 |
| The owner's USDT approval, capped at 2 USDT | https://bscscan.com/tx/0x1a500450deba945ebc1d2207d702e7db791293a424499213a4c78d7e7fd4d8be |
| A guard decision while the US market was closed (LIMIT) | `docs/evidence/guard-nvdab-1usd-after-approval.railway-sg.json` |
| Funding swap into NVDAB for the gift | built; not run yet (needs the vault funded) |
| A gasless claim to a wallet with no BNB | built; not run yet |
| An Agentic Wallet swap | skill built (`skills/bitstock-buy`); no real swap made yet |
| An ERC-8004 registration (agent ID 370988, BSC mainnet, registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`; sponsored gas, the agent wallet holds 0 BNB; read back with `bag erc8004 show`) | Agent card: https://studio-production-6e9e.up.railway.app/.well-known/agent-card.json (transaction hash not captured) |
| The Studio agent answering from outside (free x402 face and A2A, live data) | https://studio-production-6e9e.up.railway.app |

**Not yet proven live / known limits:** the gift claim, the Agentic Wallet swap (both built, not run). The open-hours path has not been shown live, because the US market was closed all weekend. Multiplier history starts when the sentry began recording, because free RPC endpoints refuse historical log queries. The independent price uses Yahoo's chart API (unofficial, no service guarantee) because the Pyth Pro key was not entitled to US equities. The guard's thresholds are starting values, not yet measured.

**Eligibility and safety:** restricted jurisdictions are refused at the claim page; there are no hot wallets or relayer in the deployed system, so no funds are held; the agent has a persistent kill switch and a $5 buy cap; tokens can be paused or blocked by the issuer; not investment advice.

**How a judge can try it:** open https://bitstock-lilac.vercel.app on a phone. The home page and the live check show NVDAB's real status with sources and need no wallet. A protected buy needs a BNB Smart Chain wallet with a little USDT; the page explains each check before anything is signed.

## 4. Video script (3:00 maximum; limit is 4:00)

Matches what is built. Never show recorded data as live. State once: "The US market is closed this weekend, so I show the closed-market behaviour live."

| Time | Scene | Say | Show |
|---|---|---|---|
| 0:00 to 0:20 | The problem | "Tokenized stocks trade on chain even when Wall Street is closed, and a wallet just shows you a price." | The Bitstock home page, live console filling in |
| 0:20 to 1:10 | Check | "Before any buy, Bitstock reads five things live. The market is closed, so it says Go with a tighter limit, and here is why." | `/check`, then `/buy` with the five checks, each with source and time |
| 1:10 to 1:50 | Buy | "It tested this exact transaction first. I sign in my own wallet." | The tested-before-you-sign panel, the wallet prompt, the BscScan page of a real buy |
| 1:50 to 2:20 | Explain | "Each NVDAB token stands for 1.000778 shares. Bitstock only calls that a dividend when it can match the company's announcement." | Holdings and Learn |
| 2:20 to 2:45 | Honesty | "If it cannot read something, it waits. If anything fails, it says no, in one sentence." | The BLOCK decision from before the approval |
| 2:45 to 3:00 | Close | "Bitstock: buy small, only after the checks pass." | Home page call to action |

## 5. Do and do not say

Say what was measured, with the number and the time, and what does not work yet. Do not say anything listed in `AGENTS.md` section 12, "provably random", "hosted autonomous trading", "guaranteed", or a dividend amount that was not matched to the issuer's announcement. Do not describe the gift, the Mode B skill or the Studio agent as working.
