# 0007. An Agentic Wallet buy whose test run lacks only a USDT approval may proceed with a tighter limit

Status: accepted (owner to review)

## Context
The guard's fifth check builds the swap with Binance's Trading API and runs it through the Transaction API simulator from the buyer's address. The simulator is stateful: if the address has not approved USDT for the swap contract, the test run fails with "transfer amount exceeds allowance" (recorded in `docs/evidence/`). In Mode A the user approves first, so the check fails closed and says so.

In Mode B the buy is sent by the user's Binance Agentic Wallet through `baw market-order swap`. The official skill documents no separate approval step before `market-order swap`, so the wallet is expected to approve inside its own swap (to be confirmed on the first real Mode B swap and recorded in `docs/DX_EVIDENCE.md`); Bitstock cannot set the wallet's approvals. A fresh Agentic Wallet would therefore always fail the test run for a reason that its own swap removes, and Mode B could never run.

## Decision
When the request says the buyer is an Agentic Wallet (`executor: "agentic-wallet"`) and the test run fails **only** because of a missing allowance, the fifth check returns **warn**, not pass, with a plain sentence saying the exact trade could not be tested. A warn means the outcome is at most LIMIT, so the tighter slippage rule in `docs/METHOD.md` applies and is handed to `baw` as `--slippage`. Every other test-run failure still fails. Once the wallet has approved USDT (after its first swap), its test runs pass or fail on their merits like any other wallet.

No transaction is prepared for an Agentic Wallet decision; the wallet's own swap is the transaction.

## Consequences
- A first Mode B buy goes ahead without a successful test run of that exact transaction. The other four checks, the tighter limit, the wallet's own limits in the Binance App and its own high-risk handling still apply. The decision record keeps the raw failure.
- The rule is visible to the user: the check reads "Caution" with the reason, and the skill shows it before asking for a yes.
- If Binance's simulator gains a way to test with an approval in place, this ADR is superseded and the check returns to fail-closed.
