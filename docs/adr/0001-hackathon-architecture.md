# ADR 0001: Hackathon architecture

- Status: Accepted
- Date: 2026-07-17
- Owners: ProofPlay team

## Context

ProofPlay must ship a deployed web experience, a Solana devnet program, TxLINE feed/proof integration, a deterministic demo, tests, public documentation, and a video by July 19. The architecture must make the full vertical path easy to demonstrate without introducing infrastructure that does not improve judging outcomes.

TxLINE credentials cannot be exposed to browsers. Live and historical data must share one domain model. Settlement transport must be retryable without giving the keeper authority to choose an outcome.

## Decision

Use a single repository with these logical components:

```text
apps/web                  Next.js app and authenticated server routes
packages/domain           Shared fixture, market, pool, condition, and receipt types
packages/txline           REST/SSE/proof client and payload normalization
packages/condition-engine Canonicalization, compilation, display, and local evaluation
programs/proof_play       Anchor pool, escrow, settlement, refund, and claim program
scripts/keeper            Final-record watcher and settlement submitter
tests                     Integration and end-to-end coverage
```

Additional decisions:

- Node.js 20+ and TypeScript are the default off-chain runtime.
- Next.js provides the web UI and server boundary; TxLINE credentials remain in server-only modules.
- Anchor/Rust provides the on-chain pool program.
- The web client reads authoritative pool/position state from Solana rather than duplicating it in a required application database.
- The keeper is an independently runnable process with idempotent retries.
- Live SSE and historical replay emit the same normalized event type.
- Judge Demo reuses production UI components and reducers while replacing wallet actions with clearly labelled simulated actions.
- Synthetic fallback data cannot claim TxLINE verification; real proof receipts must link to matching devnet evidence.
- No external database is required for the P0 path. A deployment cache or store may be added only if the adapter or replay reliability requires it.

## Consequences

### Positive

- One language and shared types cover most off-chain code.
- The adapter isolates TxLINE schema/network concerns.
- Deterministic domain and condition packages can be tested without browsers or RPC calls.
- The Judge Demo stays representative rather than becoming a separate mock product.
- Fewer required services reduce deployment and demo failure risk.

### Negative

- Serverless hosts may not suit long-lived SSE or keeper processes; those components may require a small persistent service.
- Reading all pool state from Solana can need indexing as usage grows.
- A no-database MVP limits analytics and historical product views.

## Revisit when

- The deployment target cannot support stable SSE proxying.
- Pool discovery requires an indexer.
- Persistent replay caching is required under TxLINE's data terms.
- Mainnet readiness requires separate API, keeper, and indexing services.
