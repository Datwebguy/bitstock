# 0004. The relayer pays gas for the first claim

Status: accepted

## Context
A new wallet has no BNB, so it cannot receive or move tokens that require gas. B402 is Binance's x402 implementation: it sponsors gas for **payment settlement** and the payer needs no BNB for that. It is not a general paymaster for ERC-20 transfers or swaps.

## Decision
A dedicated relayer wallet sends the claim transfer and pays the BNB gas. The relayer holds a small balance, has an enforced cap and a kill switch. Each transfer is simulated with `eth_call` first, because the issuer's compliance hook can block an address. The real gas used and its BNB cost are recorded for every claim.

## Consequences
- The cost per claim is a real, measured number that sets the minimum sensible box size.
- Documentation never says the gas is sponsored by B402.
- If a sponsor mechanism that supports arbitrary contract calls is verified later, it can replace the relayer behind the same interface.
