# Bitstock on BNB Agent Studio

A BNB Agent Studio seller agent (scaffolded with `bag init`, `@bnbagent/studio-cli` 0.0.14) that serves two Bitstock skills to other agents over A2A and x402:

| Skill | Send | Get |
|---|---|---|
| `guard_check` | `{"skill": "guard_check", "token": "TSLAB", "usd": "1", "wallet": "0x…"}` | GO, LIMIT, WAIT or BLOCK, every check with its reason, source and time. Nothing is bought. |
| `multiplier_status` | `{"skill": "multiplier_status", "token": "NVDAB"}` | Shares per token (ERC-8056 `uiMultiplier`), any scheduled change, market session, gap to the real stock price. |

The answers come from fixed rules over live data from the Bitstock API (`app/agent/src/bitstock.ts`). No language model is called (`[llm].provider = "none"`). If Bitstock cannot be read, the call fails; nothing is filled in. The x402 face is free (`price_usd = "0"`): no B402 merchant credentials are configured, so nothing is charged.

## Run

Set `BITSTOCK_AGENT_URL` to the Bitstock server address; there is no default in code.

```bash
cd studio && pnpm install
(cd app/agent && npx bag wallet new --generate-password)   # the agent's own identity wallet; keep it in .studio/, never commit it
(cd app/agent && npx bag doctor && npx bag dev)            # A2A card at http://localhost:9000/.well-known/agent-card.json
```

## Identity (ERC-8004)

The agent registers its public endpoint on BSC mainnet with `bag erc8004 register --endpoint <public url>` (or `bag deploy verify` after a `bag deploy`). That needs the agent wallet to hold a little BNB. Status: **not registered yet**; see `docs/SUBMISSION.md`.

- `.studio/` holds the encrypted keystore and secrets and is git-ignored.
- `app/agent/` is the deployable agent (TypeScript, `src/`).
