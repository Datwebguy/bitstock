# 0005. Autonomous buying runs inside the user's own Agentic Wallet

Status: accepted

## Context
Binance Agentic Wallet is an MPC wallet the user signs into from their own agent. Its daily limit, token scope and high-risk handling are set in the Binance App; the agent can read them and cannot change them. It supports a defined set of operations (swap, transfer, limit order, and others), does not sign arbitrary transactions, and signs only EIP-712 typed data (plain-text signing is unsupported). No session-delegation format with a custom per-transaction allowance is documented.

## Decision
Mode B ships as a Wallet Skill that a user installs next to the official `binance-agentic-wallet` skill. It runs the Bitstock guard first, then uses the wallet's own swap commands within the limits the user set in the Binance App. The Bitstock server holds no user keys and no session keys. The team demonstrates Mode B with its own wallet.

## Consequences
- Claims must say "within the limits you set in the Binance App" and must not describe hosted autonomous trading for other people's wallets.
- Claim flows must not require a plain-text signature, so they work with Agentic Wallets.
- If the wallet's capabilities change, this ADR is superseded by a new one.
