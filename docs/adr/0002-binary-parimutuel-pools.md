# ADR 0002: Binary zero-fee pari-mutuel pools

- Status: Accepted
- Date: 2026-07-17
- Owners: ProofPlay team

## Context

The hackathon brief permits prediction markets, escrow pools, and AMMs. An AMM or order book would add pricing, liquidity, trading, and partial-fill concerns that do not improve the central TxLINE verification demonstration within the available schedule.

The product still needs real escrow, deterministic settlement, understandable payouts, and safe cancellation/refund behavior.

## Decision

Use binary YES/NO pari-mutuel pools for the hackathon MVP:

- The canonical condition is a boolean statement.
- Participants deposit a dedicated devnet demo SPL token on YES or NO.
- Deposits close no later than scheduled kickoff.
- There is no protocol fee in version 1.
- The winning side shares the complete vault proportional to stake.
- Remaining-balance claim accounting conserves integer base units.
- A pool with no stake on the winning side becomes refundable.
- Cancelled or permanently unverifiable pools become refundable.
- Positions are not transferable and there is no cash-out or secondary market.

## Consequences

### Positive

- Fans immediately understand the interaction.
- The program has a small auditable state machine.
- The demo highlights TxLINE validation, escrow, and proof receipts.
- Accounting invariants can be tested comprehensively.

### Negative

- Pool-implied probabilities are coarse and liquidity is fragmented.
- Participants cannot enter or exit at a changing price.
- Claim order may determine which winner receives a final base-unit rounding remainder, though total conservation and proportional fairness are preserved.

## Alternatives rejected

- **Constant-product AMM:** too much pricing and liquidity logic for the deadline.
- **Order book:** requires matching, cancellations, and significantly more UI.
- **Fixed-odds house market:** introduces a privileged counterparty and solvency model.
- **Points-only database pool:** would not demonstrate on-chain escrow and payout.

## Revisit when

- The proof-backed settlement path is stable and the project pursues post-hackathon trading.
- A production fee, liquidity model, and compliance posture are designed.
