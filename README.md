# ProofPlay

Verifiable same-match prediction pools powered by TxLINE and Solana.

Project planning is tracked in the [ProofPlay delivery epic](https://github.com/stunt101harm/Proof-play/issues/1).

## Product documentation

- [MVP product specification](docs/product-spec.md)
- [Domain and state model](docs/state-model.md)
- [Judge demo script](docs/demo-script.md)
- [TxLINE devnet runbook](docs/txline-devnet.md)
- [Typed TxLINE adapter contract](docs/txline-adapter.md)
- [Architecture decisions](docs/adr/README.md)

## Status

ProofPlay is being built for the 2026 TxLINE World Cup Hackathon. The repository now includes the implementation workspace, deployable web foundation, shared package boundaries, and Anchor program scaffold. Product features follow the child issues in the delivery epic.

## Prerequisites

- Node.js 22.13 or newer and npm 10 or newer
- Rust and Cargo
- Anchor CLI 0.31.1
- Solana CLI configured for devnet when running program workflows

## Quick start

```bash
npm ci
cp .env.example .env
npm run dev
```

The web workspace prints its local URL when ready. TxLINE credentials are not required for the foundation page; server integrations validate them only when the TxLINE client is created.

Never commit `.env`, wallet keypairs, activated API tokens, or guest JWTs.

## Repository structure

```text
apps/web                  Next.js-compatible web app and server routes
packages/domain           Shared product and state vocabulary
packages/txline           TxLINE network and adapter boundary
packages/condition-engine Versioned condition compiler boundary
programs/proof_play       Anchor program
scripts/keeper            Settlement keeper process
tests                     Cross-workspace tests
tooling                   Repository validation scripts
```

## Common commands

| Command                   | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `npm run dev`             | Start the web app                             |
| `npm run build`           | Build the deployable web worker               |
| `npm run lint`            | Lint the web workspace                        |
| `npm run typecheck`       | Typecheck every TypeScript workspace          |
| `npm test`                | Check workspace boundaries and run unit tests |
| `npm run test:rendered`   | Verify the built app server-renders           |
| `npm run txline:diagnose` | Check TxLINE devnet consistency and funding   |
| `npm run txline:activate` | Subscribe and activate local TxLINE access    |
| `npm run txline:recover`  | Recover activation for a confirmed subscribe  |
| `npm run txline:renew`    | Renew the local guest JWT                     |
| `npm run txline:verify`   | Exercise every required TxLINE data path      |
| `npm run anchor:build`    | Build the Anchor program                      |
| `npm run anchor:test`     | Compile and test the Rust workspace           |
| `npm run check`           | Run the complete local validation suite       |

## Environment

The checked-in [`.env.example`](.env.example) lists every current configuration key. Public values are limited to the Solana network, RPC URL, and ProofPlay program ID. TxLINE credentials and keeper wallet paths are server-only.

The optional `HELIUS_API_KEY` is reserved for a private RPC URL if the public devnet endpoint becomes unreliable; it is not required for local foundation work.
