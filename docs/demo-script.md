# ProofPlay judge demo script

## Objective

Demonstrate the complete product and technical value of TxLINE in **3 minutes 50 seconds**, leaving more than one minute of safety under the five-minute submission limit.

The recording uses the wallet-free Judge Demo. It links to separately prepared real devnet transactions so the walkthrough remains reliable without misrepresenting simulated deposits as financial actions.

## Seeded demo fixture

The deterministic replay uses completed TxLINE fixture `18241006` and the real devnet pool `3fCNRpakrJdsoaG46xFuHqMUK2YZM9FyvwuJediB5PhD`. The verified condition is:

- Participant 2 wins.
- Total corners are at most 7.

Final sequence `962` proves goals `1–2` and corners `1–6`. The full history replays in a deterministic 75-second window at 1×, or about 19 seconds at 4×. No raw historical feed payload is stored in the repository.

## Timeline

### 0:00–0:20 — Problem and promise

**Screen:** ProofPlay home.

**Narration:**

> Sports prediction platforms normally ask users to trust both the result feed and the operator's payout. ProofPlay lets anyone create a prediction in plain language and settles it from cryptographically verifiable TxLINE data on Solana.

**Must show:** TxLINE and Solana attribution, DEVNET/JUDGE DEMO labels.

### 0:20–0:45 — Choose a TxLINE fixture

**Action:** Open `/demo`, select the verified England–Argentina fixture, and point out the fixture ID and proof-ready label. Use `/fixtures` briefly only if the recording needs to establish the wider covered catalog.

**Narration:**

> Fixtures, match state, consensus odds, and the event timeline come from TxLINE through one normalized data adapter. The same interface handles live SSE and accelerated historical replay.

**Must show:** Fixture ID, scheduled/replay status, odds only if actually returned.

### 0:45–1:20 — Build a verifiable condition

**Action:** Continue to the condition step and create the two-leg market.

1. Select “Participant 2 wins.”
2. Add “Total corners at most seven.”
3. Open “How this settles.”

**Narration:**

> The creator never enters code. ProofPlay compiles these blocks into ordered TxLINE stat keys and a versioned multi-stat validation strategy. This canonical condition is committed with the pool, so the rules cannot change after users join.

**Must show:** Human statement, stat keys, predicate preview, condition commitment.

### 1:20–1:45 — Join the pool

**Action:** Back YES, then reveal seeded YES/NO participants and pool totals. Keep the on-screen `SIMULATED PARTICIPATION` label visible.

**Narration:**

> The real devnet flow escrows a dedicated demo SPL token. For judging, this interaction is simulated so no wallet, token, or fee is required. The linked program uses a simple zero-fee pari-mutuel pool: the winning side shares the complete vault pro rata.

**Must show:** Explicit SIMULATED label, both sides funded, payout estimate, link to real devnet pool evidence.

### 1:45–2:35 — Replay the match

**Action:** Start the preselected 4× replay, briefly pause/resume, then let it reach the final record. Restart only if needed.

**Narration:**

> TxLINE score records update the score, phase, relevant statistics, and each condition leg. In-play status is intentionally provisional—ProofPlay will not release funds until it sees the final record and validates the matching proof.

**Must show:** Events moving, condition legs changing, sequence advancing, final `game_finalised` state.

### 2:35–3:20 — Validate, settle, and inspect the Proof Receipt

**Action:** Reach `game_finalised`, select “Inspect settlement,” then open the complete `/receipt` from the final demo step.

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
- Reset and run the entire `/demo` flow once in an incognito window.
- Keep a pre-settled receipt route available if the live transaction explorer is slow.
- Never substitute a simulated verification result for real devnet evidence; clearly state when the UI is replaying a recorded flow.
- Record one uninterrupted product walkthrough, then re-record only if the golden path or timing fails.
