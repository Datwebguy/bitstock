# Bitstock

Bitstock is a market-aware autopilot for small-money investing in tokenized stocks on BNB Smart Chain.

It checks the market before every buy, buys small amounts within limits you control, and explains in plain words what is happening to what you own.

Built for BNB Hack: Tokenized Stocks Edition. BSC mainnet only. Spot only. Not financial advice.

> Status: early. This README states only what has been built and run. Items marked `[ ]` are planned, not done. See `docs/ROADMAP.md`.

## What it does

| | |
|---|---|
| **Check** | Before a buy, reads whether the stock's market is open, closed, paused or about to change (dividend, split, earnings), how good the pool and price are, and runs a dry run. It shows every check. |
| **Buy** | Buys small amounts only when the checks allow it, on your command or at a verified market-open session, within the limits you set. If it is not safe it waits, tightens the limit, or declines, and says why. |
| **Explain** | Tells you in plain words what is happening to your token, such as a scaled-multiplier change when a dividend is reinvested. |

A free first slice lets someone with no BNB start. It is the front door, not the product.

## Status

| Part | Status |
|---|---|
| Signed Binance Web3 API client | [ ] |
| Guard (Check) | [ ] |
| Executor, protected buy (Mode A) | [ ] |
| Executor, scheduled buy at market open (Mode B, Agentic Wallet skill) | [ ] |
| Explainer (multiplier view) | [ ] |
| Front door: gasless first slice | [ ] |
| Agent on BNB Agent Studio | [ ] |

## Proof (BSC mainnet)

Filled from real runs only.

| What | Link |
|---|---|
| Funding swap | [ ] |
| Gasless claim to a wallet with no BNB | [ ] |
| Guard decision while the market is closed | [ ] |
| Agentic Wallet swap | [ ] |

## Run it

Requires Node 22 or later, pnpm, and a Binance Web3 API key. Use a region the API allows.

```bash
cp .env.example .env     # fill in values; never commit .env
pnpm install
pnpm test
pnpm dev
```

## Documentation

| | |
|---|---|
| `AGENTS.md` | Engineering manual and hard rules |
| `docs/ARCHITECTURE.md` | How the system is built and why |
| `docs/adr/` | Architecture decisions |
| `docs/ROADMAP.md` | What exists, what is next, what is not planned |
| `docs/VERIFIED.md` | Facts that were checked, with sources |
| `docs/RESOURCES.md` | Links, contracts and references |
| `docs/DX_EVIDENCE.md` | Developer-experience evidence log |
| `docs/SUBMISSION.md` | Hackathon submission pack |

## Limits

- Mode B runs inside the user's own Binance Agentic Wallet, within limits set in the Binance App. Bitstock does not hold other people's keys or trade for people who have not set it up.
- The first-slice draw is committed in advance and revealed after the campaign. It is not on-chain randomness.
- Tokens can be paused or blocked by their issuer. Some jurisdictions are blocked at the claim page.

## Security

See `SECURITY.md`.

## Licence

MIT
