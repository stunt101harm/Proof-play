# ProofPlay judge demo script

## Objective

Demonstrate the complete product and technical value of TxLINE in **3 minutes 50 seconds**, leaving more than one minute of safety under the five-minute submission limit.

The recording uses the wallet-free Judge Demo. It links to separately prepared real devnet transactions so the walkthrough remains reliable without misrepresenting simulated deposits as financial actions.

## Demo fixture requirements

Issue [#20](https://github.com/stunt101harm/Proof-play/issues/20) will select the exact covered historical fixture. It should:

- Have a decisive final result.
- Include enough score and corner updates to make the condition visibly change.
- Support a valid final TxLINE proof.
- Produce a compelling two-leg condition such as “Participant 1 wins and total corners are at least nine.”
- Replay from scheduled to `game_finalised` in 45–50 seconds.

If no suitable two-leg fixture validates, the demo falls back to a verified single-leg condition rather than fabricating proof support.

## Timeline

### 0:00–0:20 — Problem and promise

**Screen:** ProofPlay home/fixture list.

**Narration:**

> Sports prediction platforms normally ask users to trust both the result feed and the operator's payout. ProofPlay lets anyone create a prediction in plain language and settles it from cryptographically verifiable TxLINE data on Solana.

**Must show:** TxLINE and Solana attribution, DEVNET/JUDGE DEMO labels.

### 0:20–0:45 — Choose a TxLINE fixture

**Action:** Open the seeded covered fixture.

**Narration:**

> Fixtures, match state, consensus odds, and the event timeline come from TxLINE through one normalized data adapter. The same interface handles live SSE and accelerated historical replay.

**Must show:** Fixture ID, scheduled/replay status, odds only if actually returned.

### 0:45–1:20 — Build a verifiable condition

**Action:** Create the two-leg market.

1. Select “Participant 1 wins.”
2. Add “Total corners at least nine.”
3. Open “How this settles.”

**Narration:**

> The creator never enters code. ProofPlay compiles these blocks into ordered TxLINE stat keys and a versioned multi-stat validation strategy. This canonical condition is committed with the pool, so the rules cannot change after users join.

**Must show:** Human statement, stat keys, predicate preview, condition commitment.

### 1:20–1:45 — Join the pool

**Action:** Back YES, then reveal seeded YES/NO participants and pool totals.

**Narration:**

> The real devnet flow escrows a dedicated demo SPL token. For judging, this interaction is simulated so no wallet, token, or fee is required. The linked program uses a simple zero-fee pari-mutuel pool: the winning side shares the complete vault pro rata.

**Must show:** Explicit SIMULATED label, both sides funded, payout estimate, link to real devnet pool evidence.

### 1:45–2:35 — Replay the match

**Action:** Start the accelerated replay.

**Narration:**

> TxLINE score records update the score, phase, relevant statistics, and each condition leg. In-play status is intentionally provisional—ProofPlay will not release funds until it sees the final record and validates the matching proof.

**Must show:** Events moving, condition legs changing, sequence advancing, final `game_finalised` state.

### 2:35–3:20 — Validate, settle, and inspect the Proof Receipt

**Action:** Let the keeper transition complete and open the receipt.

**Narration:**

> The keeper retrieves the proof for this exact fixture and sequence. The ProofPlay program binds it to the condition created earlier, invokes TxLINE validation, and records the winning side once. The receipt connects the fan-friendly question to the verified stat values, Merkle-root context, settlement transaction, and payout calculation.

**Must show:** Verified leg values, TxLINE program/network, ProofPlay program, transaction link, winner, claim amount.

### 3:20–3:50 — Architecture and close

**Screen:** Compact architecture panel or README diagram.

**Narration:**

> ProofPlay combines TxLINE's real-time feeds and cryptographic validation with deterministic condition compilation and Solana escrow. The result is a prediction pool whose rules, result, and payout are all inspectable. Create a prediction anyone can understand; settle it with proof nobody has to trust.

**Must show:** Data flow from TxLINE to adapter, compiler, program validation, vault, and receipt.

## Recording checklist

- [ ] Entire recording is under five minutes.
- [ ] No secrets, API tokens, wallet keypairs, browser notifications, or unrelated tabs are visible.
- [ ] The deployed URL and public repository are readable.
- [ ] Judge Demo, replay, simulated deposits, and devnet evidence are labelled accurately.
- [ ] TxLINE is named during fixture ingestion, live/replay events, proof retrieval, and settlement.
- [ ] At least one real Solana explorer transaction is opened or clearly linked.
- [ ] The Proof Receipt is readable at recording resolution.
- [ ] The final 10 seconds contain the project name, one-line pitch, repository, and deployed URL.

## Failure-safe recording plan

- Preload the deployed app and explorer links before recording.
- Reset and run the entire Judge Demo once in an incognito window.
- Keep a pre-settled receipt route available if the live transaction explorer is slow.
- Never substitute a simulated verification result for real devnet evidence; clearly state when the UI is replaying a recorded flow.
- Record one uninterrupted product walkthrough, then re-record only if the golden path or timing fails.
