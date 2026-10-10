# 0001. Product spine: Check, Buy, Explain, with a gasless front door

Status: accepted

## Context
The first framing was a stock-gifting app. Gifting brings people in, but it does not give them a reason to stay or a reason to trust the product, and it is easy to copy. The real, durable problem for a newcomer holding a tokenized stock is deciding when it is safe to buy and understanding what silently happens to the token afterwards (pauses, scaled-multiplier changes, closed markets).

## Decision
Bitstock is defined by three verbs: **Check** (is it safe to buy now), **Buy** (small amounts within user limits), **Explain** (what is happening to what you own). The gasless first slice is the front door, an acquisition path into the three verbs.

## Consequences
- The guard is the core module; the gift flow is optional and replaceable.
- Success is measured by decisions made and explained, not boxes opened.
- Marketing and documentation must not describe Bitstock as a gifting product.
