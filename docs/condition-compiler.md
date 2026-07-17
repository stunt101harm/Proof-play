# Condition compiler v1

The `@proof-play/condition-engine` package is the settlement contract between the creator UI, Proof Receipt, keeper, and TxLINE validation instruction. It accepts an untrusted condition document, validates and normalizes it, derives all display and settlement artifacts, and fails closed when the requested market cannot be represented exactly.

## Canonical input

```json
{
  "version": 1,
  "fixtureId": "18241006",
  "operator": "all",
  "legs": [
    { "kind": "participantWins", "participant": 2 },
    { "kind": "totalCorners", "comparison": "atMost", "threshold": 7 }
  ]
}
```

Version 1 accepts exactly one or two legs joined by `all`. Fixture IDs are positive decimal strings without leading zeros. Extra, missing, floating-point, or unknown fields are rejected rather than ignored.

The supported templates are:

| Leg               | Parameters                      | Full-game TxLINE keys | Strategy predicate              |
| ----------------- | ------------------------------- | --------------------- | ------------------------------- |
| `participantWins` | participant `1` or `2`          | goals `1`, `2`        | selected minus opponent `> 0`   |
| `totalGoals`      | `atLeast`/`atMost`, integer `N` | goals `1`, `2`        | sum `> N-1` or `< N+1`          |
| `bothTeamsScore`  | none                            | goals `1`, `2`        | each value `> 0`                |
| `winningMargin`   | participant, integer `N`        | goals `1`, `2`        | selected minus opponent `> N-1` |
| `totalCorners`    | `atLeast`/`atMost`, integer `N` | corners `7`, `8`      | sum `> N-1` or `< N+1`          |

Goal bounds are limited to `0..30`, winning margins to `1..30`, and corner bounds to `0..60`. These are versioned product safety bounds, not claims about a sport's theoretical maximum. An `atLeast 0` total is rejected as already decided; `atMost 0` remains a valid market.

Compiler v1 intentionally supports full-game soccer stats only. The real verification proof records these leaves with period `100`. Period-specific markets require a separately specified key/period catalog and a new compiler version. Cards remain deferred because TxLINE separates yellow and red card keys and ProofPlay has not defined whether “total cards” combines or weights them.

## Determinism and commitment

The compiler:

1. Validates exact fields and integer bounds.
2. Rejects duplicates, contradictions, already-decided legs, and unsupported templates.
3. Sorts legs by the compiler-v1 kind order, then by their canonical JSON bytes.
4. Sorts the unique TxLINE stat keys numerically.
5. Compiles predicates using positions in that stat-key array.
6. Serializes the normalized document with RFC 8785 JSON Canonicalization Scheme semantics.
7. Hashes the UTF-8 canonical JSON with SHA-256.

Display names are optional inputs to rendering and never enter the canonical JSON or commitment. The output includes the normalized condition, readable full statement and per-leg statements, canonical JSON, 32 commitment bytes plus hex, ordered stat keys, exact `validateStatV2` strategy, and predicate-to-leg indexes for receipts and local evaluation.

## TxLINE exact-coverage rule

TxLINE `validateStatV2` requires every requested stat index to be evaluated exactly once across the complete strategy. The compiler therefore rejects two legs that reuse a stat key with `DUPLICATE_STAT_COVERAGE`.

For example, winner plus total goals is logically meaningful but both legs reuse goal keys `1` and `2`, so it cannot be represented by this V2 strategy. Winner plus total corners is valid: the first predicate covers indexes `0` and `1`, the second covers indexes `2` and `3`, and the proof requests each leaf exactly once. The creator UI should offer only compatible second legs rather than letting the on-chain program reject the result later.

## Local evaluation

`evaluateCondition` executes the compiled strategy against the normalized `MatchScoreRecord.stats` map. It returns per-leg outcomes and the final `all` outcome. Missing required stats produce `missingStats` with a `null` outcome; negative, fractional, or non-finite values are rejected. A missing or malformed result is never inferred as `false`.

## Devnet evidence

The compound statement “Participant 2 wins and total corners are at most 7” was compiled with keys `[1, 2, 7, 8]` and evaluated against TxLINE historical fixture `18241006`, final sequence `962`. The returned period-`100` values were `[1, 2, 1, 6]`.

Both the local evaluator and an unsigned Solana devnet simulation of TxLINE program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` returned `true`. The secret-free evidence, canonical document, commitment, and exact strategy are stored in [`evidence/condition-compiler-verification.json`](evidence/condition-compiler-verification.json).
