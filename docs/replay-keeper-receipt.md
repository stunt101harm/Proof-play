# Replay, keeper, and Proof Receipt

This path makes the settlement story repeatable for judges without checking raw TxLINE data into the repository or requiring a wallet in the browser.

## Deterministic replay

Open `/replay` and select the seeded completed fixture `18241006`. The server requests its historical score records from TxLINE, normalizes them through the same `MatchScoreRecord` adapter used by live SSE, sorts and deduplicates by observed sequence, and emits them as a same-origin event stream.

The `@proof-play/replay` scheduler compresses source-time gaps with deterministic log weighting into a 75-second target at 1×. The UI supports 0.5×, 1×, 2×, and 4× speed plus start, pause/resume, and clean restart. Resume requests only sequences newer than the last reduced event, and the reducer independently ignores duplicates or stale events.

Source labels never blur provenance:

- `REPLAY` means accelerated TxLINE historical records.
- `TxLINE history` names the upstream source.
- `devnet` names the project network.
- The 4 YES / 6 NO positions are explicitly labelled as a seeded demo pool.

The application stores no raw licensed history. If live SSE is unavailable, replay remains functional because it uses TxLINE's historical endpoint.

## Settlement keeper

The `@proof-play/keeper` process can scan all program pools, operate on one pool, or watch continuously:

```bash
KEEPER_WALLET_PATH=/absolute/path/to/devnet-wallet.json \
  npm run start --workspace=@proof-play/keeper -- --once

KEEPER_WALLET_PATH=/absolute/path/to/devnet-wallet.json \
  npm run start --workspace=@proof-play/keeper -- \
  --watch --interval-ms 30000 --max-attempts 4

KEEPER_WALLET_PATH=/absolute/path/to/devnet-wallet.json \
  npm run start --workspace=@proof-play/keeper -- \
  --once --pool 3fCNRpakrJdsoaG46xFuHqMUK2YZM9FyvwuJediB5PhD
```

For every locked pool, the keeper:

1. fetches normalized TxLINE history with bounded exponential retry;
2. accepts only `game_finalised`, `statusId=100`, positive-sequence records;
3. requests the V3 proof for that exact fixture, sequence, and immutable stat-key order;
4. rejects a fixture, sequence, key-order, leaf-count, or full-game period mismatch;
5. refreshes pool state immediately before submission;
6. submits permissionlessly and waits for finalized confirmation; and
7. emits credential-free JSON logs for pending, retry, terminal, submission, and confirmation states.

`--dry-run` stops after exact proof validation. Re-running against a resolved, cancelled, or closed pool returns `alreadySettled` before proof retrieval or transaction submission. The checked-in [devnet idempotency evidence](evidence/keeper-idempotency-devnet.json) records that behavior against the canonical closed pool.

## Proof Receipt

Open `/receipt` for the receipt derived from the canonical [proof-settlement devnet evidence](evidence/proof-settlement-devnet-verification.json). The view binds:

- the human question and both condition legs;
- fixture `18241006`, final sequence `962`, `game_finalised`, status `100`, and proven stats;
- compiler version, ordered stat keys, condition commitment, predicate result, and winner;
- TxLINE and ProofPlay programs, daily root, pool, and settlement transaction explorer links; and
- YES/NO totals, winning stake, claim, and the deterministic payout formula.

The reusable receipt builder fails closed when final inputs, observed sequence, predicate result, winner, or payout accounting disagree. Pending and failed receipts cannot expose a winner or claimed payout. Tests cover verified YES, verified NO from a false predicate, pending, failed, and malformed cases.

## Evidence boundary

Replay illustrates the event sequence; it is not represented as a new on-chain settlement. The receipt points to the real, previously completed devnet settlement. The keeper's observed sequence and action are transparent API metadata; TxLINE V3 commits the selected event root, while the ProofPlay program independently requires every proven leaf to use full-game period `100`.
