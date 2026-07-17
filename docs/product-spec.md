# ProofPlay MVP product specification

| Field               | Value                                                     |
| ------------------- | --------------------------------------------------------- |
| Status              | Accepted for hackathon MVP                                |
| Version             | 1.0                                                       |
| Target network      | Solana devnet                                             |
| Submission deadline | July 19, 2026 at 23:59 UTC                                |
| Parent epic         | [#1](https://github.com/stunt101harm/Proof-play/issues/1) |

## Product statement

ProofPlay is a no-code platform for creating and joining verifiable same-match soccer prediction pools. A creator assembles a condition from structured blocks, ProofPlay compiles it into deterministic TxLINE statistic predicates, participants deposit a demo SPL token on either side, and a Solana program settles the pool only after the configured result is cryptographically validated.

> Create a prediction anyone can understand. Settle it with proof nobody has to trust.

## Problem

Sports prediction products ask users to trust a platform's result feed, settlement implementation, and payout calculation. Even when an oracle is involved, the result is normally presented as a final number without an understandable chain of evidence.

ProofPlay makes the settlement contract visible at creation time and produces a human-readable Proof Receipt after resolution. TxLINE is the primary source for fixtures, odds, score events, historical replay, and validation proofs.

## Goals

- Demonstrate live or replayed TxLINE match data in a polished soccer experience.
- Let a non-technical user create a supported compound prediction without knowing stat keys.
- Compile every market into deterministic, versioned settlement semantics.
- Escrow devnet demo tokens and distribute them without a trusted payout operator.
- Validate the selected result through TxLINE on Solana before settlement.
- Give judges a complete, repeatable experience without requiring a wallet or tokens.
- Make the role of TxLINE obvious in the product and demo video.

## Non-goals

- Mainnet or real-money wagering.
- An automated market maker, order book, cash-out feature, or secondary trading.
- Permissionless arbitrary expressions or user-supplied code.
- Player props or markets absent from the actual TxLINE response.
- Production compliance operations such as KYC, geofencing, fiat payments, or custody.
- A mobile-native application.
- Claiming that simulated Judge Demo actions are real financial transactions.

## Users

### Pool creator

Wants to turn a match opinion into a transparent social challenge without understanding Solana or TxLINE internals.

### Participant

Wants to choose YES or NO, see the pool balance and potential payout, follow the condition during the match, and verify settlement.

### Judge

Wants to understand the problem, complete the golden path without setup, inspect real devnet evidence, and see how TxLINE is indispensable.

## Product principles

1. **Human contract first.** The question and settlement rules must be understandable before a deposit is signed.
2. **Deterministic underneath.** The displayed condition, canonical condition, stat keys, validation strategy, and on-chain commitment must describe the same outcome.
3. **Proof is a product surface.** Verification is shown as an explanation and receipt, not a hidden backend call.
4. **Safe failure.** Missing, stale, unsupported, cancelled, or unverified data must never be displayed as settled.
5. **Judge access matters.** The primary demo cannot depend on a wallet extension, faucet, live match, or paid account.

## MVP scope

| Capability      | P0 behavior                                                                   |
| --------------- | ----------------------------------------------------------------------------- |
| Match discovery | Covered World Cup fixtures grouped by date and match state                    |
| Match center    | Phase, score, relevant stats, timeline, odds when returned, and source status |
| Market creation | Structured builder with one or two condition blocks joined by `AND`           |
| Pool model      | Binary YES/NO pari-mutuel pool                                                |
| Participation   | Devnet wallet deposits using a dedicated demo SPL token                       |
| Live data       | TxLINE score SSE through a server-side adapter                                |
| Replay          | Accelerated historical replay using the same normalized event model           |
| Settlement      | Final match record plus TxLINE validation on Solana                           |
| Claims          | Pro-rata winner claims; refund path for cancelled pools                       |
| Receipt         | Human condition, stats, predicate, proof status, transaction, and payout      |
| Judge Demo      | Wallet-free seeded golden path with links to real devnet evidence             |

## Supported condition catalog

TxLINE identifies the two fixture teams as Participant 1 and Participant 2. ProofPlay resolves those positions to team names for display but stores participant positions in the canonical condition.

P0 conditions use full-game keys from the [TxLINE soccer feed specification](https://txline.txodds.com/documentation/scores/soccer-feed):

| Key | Meaning                     |
| --- | --------------------------- |
| `1` | Participant 1 total goals   |
| `2` | Participant 2 total goals   |
| `7` | Participant 1 total corners |
| `8` | Participant 2 total corners |

| User condition                   | Canonical meaning                          | Predicate shape                      |
| -------------------------------- | ------------------------------------------ | ------------------------------------ |
| Participant 1 wins               | P1 goals exceed P2 goals                   | `goals[1] - goals[2] > 0`            |
| Participant 2 wins               | P2 goals exceed P1 goals                   | `goals[2] - goals[1] > 0`            |
| Total goals at least `N`         | Combined goals are `N` or greater          | `goals[1] + goals[2] > N - 1`        |
| Total goals at most `N`          | Combined goals are `N` or fewer            | `goals[1] + goals[2] < N + 1`        |
| Both teams score                 | Each participant scores at least once      | `goals[1] > 0 AND goals[2] > 0`      |
| Participant wins by at least `N` | Selected goal difference is `N` or greater | `selectedGoals - otherGoals > N - 1` |
| Total corners at least `N`       | Combined corners are `N` or greater        | `corners[1] + corners[2] > N - 1`    |
| Total corners at most `N`        | Combined corners are `N` or fewer          | `corners[1] + corners[2] < N + 1`    |

The UI may describe integer bounds using familiar half-lines, such as “over 2.5 goals,” but the canonical condition stores only the equivalent integer constraint, such as “at least 3 goals.” This avoids floating-point settlement semantics.

Cards are a post-MVP extension. Yellow and red cards have separate TxLINE keys, so “total cards” will not ship until its scoring semantics are explicitly defined.

## Condition limits

- A market contains one or two user-visible condition blocks.
- Multiple blocks use `AND`; `OR`, `NOT`, and nested groups are excluded.
- A compiled market requests no more than four unique stat keys.
- Thresholds are bounded integers defined by the condition type. Goal/corner totals may use zero; winning margins start at one.
- The builder rejects duplicate, contradictory, unsupported, or already-decided conditions.
- The condition and compiler version cannot change after pool creation.

## Pool model

Each condition is phrased as a statement. Participants back either:

- **YES:** the full condition evaluates to true.
- **NO:** the full condition evaluates to false.

The hackathon MVP uses a zero-fee pari-mutuel pool:

- Deposits are accepted only before the configured cutoff.
- The cutoff is no later than the scheduled match start.
- YES and NO deposits are held by the pool vault.
- The winning side shares the complete pool pro rata.
- Claims use remaining-balance accounting so all base units are conserved despite integer rounding.
- If no stake exists on the winning side, all participants receive refunds.
- Cancelled, unsupported, expired, or permanently unverifiable pools enter the refund path.

The asset is a dedicated, clearly labelled devnet demo token. TxLINE subscription credits are never transferable through ProofPlay and are never used as pool collateral.

## Core user journeys

### Discover and inspect

1. Open the fixture list.
2. Filter or navigate to a covered match.
3. See schedule, current phase, score, available odds, active pools, and live/replay source state.

### Create

1. Select a scheduled fixture.
2. Add one supported condition block.
3. Optionally add a second `AND` block.
4. Review the human statement and “How this settles” technical preview.
5. Configure the cutoff and create the pool.
6. Confirm the devnet transaction and open the pool detail page.

### Join

1. Open an active pool.
2. Choose YES or NO.
3. Enter a demo-token amount.
4. Review the current pool share and estimated payout.
5. Sign the deposit and see the confirmed position.

### Follow

1. Watch score, phase, timeline, and relevant stats update.
2. See each condition leg as pending, currently passing, or currently failing.
3. Understand that in-play status is informational and not final settlement.

### Settle and claim

1. The keeper observes a final `game_finalised` record.
2. It retrieves the proof for the exact fixture and sequence.
3. ProofPlay submits the stored condition and proof for TxLINE validation.
4. The pool records YES or NO as the winner once.
5. Winners claim; cancelled or zero-winning-stake pools refund.
6. The user opens the Proof Receipt and Solana explorer evidence.

### Judge Demo

1. Enter `/demo` without a wallet.
2. Select the seeded fixture and assemble the seeded compound condition.
3. Join both sides through clearly labelled simulated participants.
4. Start the accelerated replay.
5. Watch the condition and match reach finalization.
6. Inspect the receipt and linked real devnet evidence.
7. Reset the flow for another reviewer.

## Functional requirements

### Data and match experience

- TxLINE credentials remain server-side.
- Raw payloads are normalized into versioned ProofPlay domain objects.
- SSE processing reconnects, deduplicates, and preserves sequence order.
- Odds surfaces render only markets returned for the selected fixture.
- LIVE, REPLAY, SIMULATED, and DEVNET states are visibly distinct.
- Historical or simulated data is never presented as live.

### Creation and compilation

- The displayed market sentence is generated from the canonical condition rather than separately authored text.
- The compiler produces stable stat-key order, strategy indexes, a canonical representation, and a commitment.
- The creator cannot submit an invalid condition or cutoff.

### Settlement

- Final settlement uses a record with `action=game_finalised`, `statusId=100`, and `period=100` as documented by TxLINE.
- Fixture, network, sequence, proof root, compiler version, and condition commitment must match the pool.
- Settlement is idempotent and can happen only once.
- A proof or predicate failure leaves funds locked for retry or the explicit refund policy; it never silently chooses a winner.

### Judge access

- The golden path works from an incognito browser with no account, wallet, tokens, or fees.
- Demo actions are clearly labelled as simulated.
- Real program IDs and devnet evidence are available from the receipt or technical panel.

## Non-functional requirements

- Primary pages work at 360 px mobile width and standard desktop widths.
- The golden path is keyboard accessible and has visible focus states.
- Critical UI has loading, empty, stale, reconnecting, pending, failed, cancelled, and retry states.
- Browser bundles and logs contain no TxLINE secrets or wallet keypairs.
- Compiler, escrow conservation, settlement binding, and one-time claim/refund behavior are automatically tested.
- The production Judge Demo completes in less than four minutes.

## Success criteria

- A working deployed app uses TxLINE as its primary sports-data source.
- A compound condition compiles and validates against a real TxLINE proof.
- A devnet pool completes create, join, settle, and claim/refund flows.
- The Proof Receipt connects user language to TxLINE values and Solana evidence.
- The wallet-free Judge Demo works reliably from a clean browser.
- The public repository documents endpoints, architecture, IDs, setup, tests, limitations, and TxLINE feedback.
- A sub-five-minute video demonstrates the full product and TxLINE's role.

## Open implementation questions

These questions do not change the frozen product contract and have explicit owners:

| Question                                                                                           | Owning issue                                                                                                                | Required decision                              |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Which covered historical fixture provides the strongest verified replay?                           | [#20](https://github.com/stunt101harm/Proof-play/issues/20)                                                                 | Before Judge Demo seeding                      |
| Does the deployed TxLINE devnet interface support direct program CPI for the selected V2 strategy? | [#15](https://github.com/stunt101harm/Proof-play/issues/15)                                                                 | Before settlement implementation is finalized  |
| Which demo-token program/mint and funding flow will be used?                                       | [#22](https://github.com/stunt101harm/Proof-play/issues/22) and [#24](https://github.com/stunt101harm/Proof-play/issues/24) | Before devnet participation testing            |
| Where will the SSE proxy and keeper run persistently?                                              | [#2](https://github.com/stunt101harm/Proof-play/issues/2)                                                                   | Before production deployment                   |
| What historical data may be cached for replay under the hackathon license?                         | [#20](https://github.com/stunt101harm/Proof-play/issues/20) and [#14](https://github.com/stunt101harm/Proof-play/issues/14) | Before committing or deploying replay material |

## Release boundary

The P0 release is complete only when the end-to-end golden path works. Additional fixtures, cards, more condition blocks, richer odds analysis, fees, AMM mechanics, mainnet support, and production compliance are explicitly deferred until after submission.
