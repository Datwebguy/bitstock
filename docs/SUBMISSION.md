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
| Public repo, accessible through judging (12 to 23 Oct) | [ ] |
| Deployed link that loads without a login | [ ] |
| Demo video, 4 minutes or less, link works | [ ] |
| Project submission form: https://forms.gle/yToDUzaDMwWnq6R6A | [ ] |
| Developer Experience Report form (own words): https://forms.gle/EUQ39xf54GHjC2ys5 | [ ] |
| Every team member confirmed not in an excluded jurisdiction | [ ] |
| README status table matches reality | [ ] |
| Repo search: no keys, no banned statements, only the owner in `git log` | [ ] |

## 3. Project description (draft)

**One line:** Bitstock is a market-aware autopilot for small-money investing in tokenized stocks on BNB Smart Chain: it checks the market before every buy, buys small amounts within limits you control, and explains in plain words what is happening to what you own.

**The problem**
- A tokenized stock changes while you hold it: the underlying market closes or pauses, and a reinvested dividend or split changes what each token represents through a scaled multiplier (ERC-8056). Wallets say nothing about this. The NVDAB multiplier read [value] at [time].
- Binance's RWA Data API reports whether a stock's market is open, paused for a corporate action, or limited around earnings. [What the quote path did while the market was closed: ___ .]
- A new wallet has no BNB, so it cannot even receive a first slice. [Measured gas cost of one claim: ___ BNB; evidence: tx hash.]

**What it does**
1. *Check.* Five checks before a buy: market session, multiplier state, independent price comparison, a live quote at the exact size, and a Transaction API dry run. Each is shown with its value, source and time. The outcome is go, limit, wait or decline, with the reason.
2. *Buy.* Mode A: the user taps buy and signs in their own wallet. Mode B: a Wallet Skill uses the user's own Binance Agentic Wallet to buy at a verified market open inside the limits the user set in the Binance App. [Built / not built.]
3. *Explain.* Live multiplier, any scheduled change, and a plain-words explanation of what it means for the holder. [Built / not built.]
4. *Front door.* A pool of NVDAB split into ten boxes (20/15/15/10/10/10/5/5/5/5 percent). The assignment is committed in advance (hash ___) and revealed after. A recipient with no BNB connects a wallet and the relayer pays the gas. [Built / not built.]

**Binance Web3 API modules used:** RWA Data ([endpoints]), Trading ([quote, swap, approve]), Transaction ([simulate]), Market ([ ]), Wallet ([ ]), B402 ([ ] or not used), Agentic Wallet ([ ]), BNB Agent Studio ([ ]).

**Role of automation:** decisions are deterministic rules over live data; no model chooses what to buy. [Say exactly where a language model is used for text, if at all.]

**Proof on BSC mainnet**

| What | Link |
|---|---|
| Funding swap into NVDAB | [ ] |
| One gasless claim to a wallet with no BNB | [ ] |
| One guard decision while the market is closed | [ ] |
| One Agentic Wallet swap | [ ] |
| ERC-8004 registration | [ ] |

**Not built / known limits:** [list honestly. For example: the open-hours path cannot be shown live because the US market is closed until Monday 13:30 UTC; multiplier history starts when the sentry began recording; Mode B works inside the user's own Agentic Wallet and does not trade for others; paid x402 is not enabled.]

**Eligibility and safety:** restricted jurisdictions are blocked at the claim page; recipients never pay; the relayer and vault are dedicated low-balance wallets with a kill switch; tokens can be paused or blocked by the issuer; not investment advice.

**How a judge can try it:** open [URL] on a phone. The guard check for NVDAB with live sources and the multiplier view are read-only and need no wallet or funds.

## 4. Video script (3:00 maximum; limit is 4:00)

Edit to match what actually works. Never show recorded data as live. Never show a number that is not on a real screen. State once: "The US market is closed this weekend, so I show the closed-market behaviour live."

| Time | Scene | Say | Show |
|---|---|---|---|
| 0:00 to 0:25 | The problem | "A tokenized stock changes while you hold it, and nothing tells you. Buying at the wrong moment costs you." | Wallet showing a balance and no explanation |
| 0:25 to 1:25 | Check | "Before any buy, Bitstock checks the market. The US market is closed, so it [waits / tightens the limit]. Here is why." | Guard HUD, each check with value, source and time; the decision |
| 1:25 to 2:00 | Buy | "I tap buy for one dollar. It was dry-run first. Here is the transaction." | Mode A buy, BscScan page [if the path allowed a real buy] |
| 2:00 to 2:30 | Explain | "This token's multiplier is [value] now. When a dividend is reinvested it changes. This is what that means." | Live multiplier screen and explanation |
| 2:30 to 2:50 | Front door | "Someone with no BNB can start: the relayer pays the gas." | Real claim to a wallet with 0 BNB, then BscScan |
| 2:50 to 3:00 | Stack | "A Wallet Skill for Agentic Wallet users and an agent on BNB Agent Studio." | Only what was built |

## 5. Do and do not say

Say what was measured, with the number and the time, and what does not work yet. Do not say anything listed in `AGENTS.md` section 12, "provably random", "hosted autonomous trading", "guaranteed", or a dividend amount that was not matched to the issuer's announcement.
