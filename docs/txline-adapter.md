# Typed TxLINE adapter contract

The `@proof-play/txline` package is the only application layer that understands TxLINE response casing, authentication headers, SSE framing, proof response shapes, or network-specific endpoints. Web, replay, compiler, and keeper code consume versioned ProofPlay objects from `@proof-play/domain`.

## Boundary and credentials

- `@proof-play/txline` exports the browser-safe adapter contract, normalized types, errors, and telemetry types.
- `@proof-play/txline/server` contains wallet activation and local credential persistence and must never enter a browser import graph.
- Web route handlers create the adapter through `apps/web/lib/txline-server.ts`. `TXLINE_GUEST_JWT` and `TXLINE_API_TOKEN` are read only while handling a server request.
- A `401` starts a new guest session and retries once with the same activated API token. A `403` fails with a structured access diagnostic.
- Public responses and telemetry contain endpoint names, status, timing, counts, and error codes; they never contain either credential or an authorization header.

## Endpoint mapping

| Adapter method                | TxLINE endpoint                          | Normalized result                          |
| ----------------------------- | ---------------------------------------- | ------------------------------------------ |
| `listFixtures` / `getFixture` | `GET /api/fixtures/snapshot`             | `MatchFixture`                             |
| `getOddsSnapshot`             | `GET /api/odds/snapshot/{fixtureId}`     | `MatchOddsMarket[]`                        |
| `getOddsUpdates`              | `GET /api/odds/updates/{fixtureId}`      | `MatchOddsMarket[]`                        |
| `getScoreSnapshot`            | `GET /api/scores/snapshot/{fixtureId}`   | `MatchScoreRecord[]`                       |
| `getScoreUpdates`             | `GET /api/scores/updates/{fixtureId}`    | `MatchScoreRecord[]`                       |
| `getHistoricalScores`         | `GET /api/scores/historical/{fixtureId}` | `MatchScoreRecord[]`                       |
| `streamScores`                | `GET /api/scores/stream`                 | ordered async stream of `MatchScoreRecord` |
| `getScoreProof`               | `GET /api/scores/stat-validation`        | server-side `TxlineScoreProof`             |
| `getScoreProofV3`             | `GET /api/scores/stat-validation-v3`     | compact on-chain `TxlineScoreProofV3`      |

`getFixture` filters the documented fixture snapshot because TxLINE does not expose a separate fixture-detail endpoint. Callers can supply `startEpochDay` and `competitionId` to select the correct snapshot window.

## Normalized objects

Every normalized fixture, odds market, and score record includes:

- `schemaVersion: 1` and `source: "txline"`;
- a decimal-string `fixtureId` so an upstream `int64` never loses precision in a future payload;
- ISO timestamps derived from TxLINE millisecond timestamps; and
- only stable fields required by downstream ProofPlay components.

Score records additionally preserve the observed sequence, source action, raw game state, numeric phase/status, participant designation, clock, full numeric stat-key map, relevant score summary, amendment summary, and derived ProofPlay lifecycle. Only `action=game_finalised` with `statusId=100` is normalized as final. The current devnet final record does not expose a separate top-level `period` field, so it remains `null` rather than being invented. Settlement separately requires every proven V3 stat leaf to carry full-game period `100`.

`getScoreProofV3` preserves only the byte-array hashes accepted by Anchor and
normalizes TxLINE's compact leaves, multiproof hashes, and leaf indices directly
into the `validate_stat_v3` argument shape. The requested sequence remains
explicit metadata because the V3 on-chain payload commits to the event root but
does not include a sequence field.

Odds normalization creates outcomes only from the arrays TxLINE returns for that market. `Pct: "NA"` becomes `probabilityPercent: null`; the adapter does not manufacture a probability or an unsupported market.

## Stream guarantees

The score SSE implementation:

1. sends both server-only authentication headers;
2. parses frames across arbitrary response chunks and ignores heartbeat comments;
3. reconnects with exponential backoff and the latest `Last-Event-ID`;
4. retains the activated API token across guest-JWT renewal;
5. deduplicates fixture/sequence pairs across reconnects;
6. buffers bounded out-of-order records and emits them in sequence order; and
7. records malformed frames, duplicates, reconnects, and sequence gaps through credential-free telemetry.

A fresh connection accepts its first sequence as the starting point. Consumers that resume durable processing should provide `startingSequences` so earlier duplicates are dropped and subsequent gaps are ordered deterministically.

## Safe web routes

The frontend can use these same-origin routes without receiving TxLINE credentials:

- `GET /api/txline/fixtures?competitionId=72&startEpochDay=...`
- `GET /api/txline/fixtures/{fixtureId}?competitionId=72&startEpochDay=...`
- `GET /api/txline/odds/{fixtureId}?asOf=...`
- `GET /api/txline/scores/{fixtureId}?mode=snapshot|updates|historical&asOf=...`
- `GET /api/txline/scores/stream?fixtureId=...`

JSON routes return `{ data, meta }` with `source`, `network`, and generation time. The stream route emits normalized `score` events with IDs in `{fixtureId}:{sequence}` form. Proof payloads remain server-side for the keeper and settlement path rather than being proxied into the browser.

## Failure behavior

Invalid fixture IDs, zero/synthetic proof sequences, duplicate stat keys, mixed-network configuration, changed upstream shapes, and fixture-mismatched proofs fail closed with `TxlineDiagnosticError`. Public API errors are redacted and never infer a match result. Representative fixtures, odds, snapshots, history framing, amendments, finalization, proof binding, reconnect ordering, duplicates, and route redaction are covered by the unit suite.

The latest secret-free live adapter result is recorded in [`docs/evidence/txline-adapter-verification.json`](evidence/txline-adapter-verification.json). It binds final sequence `962` to the returned full-game goals and corners keys `1`, `2`, `7`, and `8`, which is the compound-proof target for the condition compiler and settlement work.
