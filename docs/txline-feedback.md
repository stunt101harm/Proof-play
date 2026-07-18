# TxLINE integration feedback

## What worked especially well

### One model across product surfaces

The fixture, odds, snapshot, history, SSE, and proof endpoints cover the entire
product lifecycle. After normalization, the same score record can drive a live
match center, deterministic replay, condition preview, keeper finality check,
and receipt. That substantially reduced application-specific glue.

### History plus SSE makes a reliable demo possible

The ordered historical endpoint was essential because the tournament matches
finish after the submission deadline. We could run the exact same reducer at
accelerated speed, then use SSE for the live-capability path. This is a strong
developer experience for both production recovery and hackathon judging.

### V3 proofs are practical on Solana

The compact multi-stat proof mapped cleanly into an Anchor instruction. A
four-stat compound condition fit in an 883-byte settlement transaction and the
full ProofPlay-to-TxLINE CPI consumed about 210,000 compute units. This makes
custom, inspectable settlement logic feasible without an operator oracle.

### Devnet access and diagnostics

The free World Cup service level, devnet program, and proof endpoints made it
possible to test the complete path rather than shipping a mocked contract. The
documented program/mint values and public Explorer evidence are valuable trust
anchors.

## Friction we encountered

### Finality is not simply “the greatest sequence”

For fixture `18241006`, sequence `962` is the valid `game_finalised`, status
`100` record. A later sequence `963` is a transport `disconnected` record with
the same score but is not final. Consumers must filter on action/status/finality
rather than select the last history element. Calling this out directly in the
history/SSE documentation would prevent unsafe settlement implementations.

### Authentication has two lifetimes

The API token and guest JWT have different renewal behavior. A small official
server SDK or a concise state diagram for subscription, guest start, renewal,
and recovery would reduce activation mistakes. We retained the activated API
token and renew only the guest JWT after `401`, while treating `403` as an access
configuration failure.

### Fixture discovery is snapshot-window based

There is no separate fixture-detail route in the path we used, so callers must
know a valid `startEpochDay`/competition window and filter the snapshot. A direct
fixture lookup or clearer window metadata would simplify deep links and replay
recovery.

### API sequence and on-chain proof have different trust boundaries

The V3 payload commits to the selected event root and proven stat leaves, but it
does not include the observed API sequence/action. ProofPlay stores sequence as
transparent keeper metadata and independently requires full-game period `100`
on-chain. Including an explicit event identifier/finality commitment in the V3
payload would make the receipt even easier to explain.

### Schema discoverability

The normalized concept is strong, but production integration still benefited
from defensive casing/wrapper readers and shape fixtures. A versioned OpenAPI
spec, JSON Schemas, and copy-paste examples for every endpoint—including
amendments, status transitions, heartbeat frames, and proof responses—would
shorten implementation time and make breaking changes easier to detect.

## Suggested additions

1. Publish a small official TypeScript client with token renewal, SSE reconnect,
   `Last-Event-ID`, and typed proof payloads.
2. Document a normative finality predicate and examples where non-final records
   occur after `game_finalised`.
3. Add direct fixture lookup and expose snapshot-window metadata.
4. Add schema/version identifiers to every response and SSE event.
5. Include the final event identifier or equivalent finality commitment in the
   compact on-chain proof contract.

Overall, TxLINE's combination of normalized product data and Solana-verifiable
proofs was the key differentiator. It let ProofPlay use one provider for the fan
experience and the trustless settlement boundary instead of stitching together
a sports feed and a separate oracle.
