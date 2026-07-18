# Third-party notices

ProofPlay is an independent, open-source hackathon prototype. Its source and
project-authored assets are available under the repository license. This file
records the principal third-party software and services used by the submission;
the lockfile remains the authoritative version inventory.

## Application and blockchain software

| Component                                                             | Purpose                                     | License           |
| --------------------------------------------------------------------- | ------------------------------------------- | ----------------- |
| [React](https://react.dev/) and [Next.js](https://nextjs.org/)        | Web interface and application routing       | MIT               |
| [vinext](https://github.com/cloudflare/vinext)                        | Cloudflare-compatible Next.js build runtime | MIT               |
| [Solana web3.js](https://github.com/solana-foundation/solana-web3.js) | Devnet transactions and account reads       | MIT               |
| [Anchor](https://github.com/coral-xyz/anchor)                         | Solana program framework and client         | MIT OR Apache-2.0 |
| [SPL Token](https://github.com/solana-program/token)                  | Dedicated devnet demo-token escrow          | Apache-2.0        |

## Quality tooling

| Component                                         | Purpose                                   | License    |
| ------------------------------------------------- | ----------------------------------------- | ---------- |
| [Playwright](https://playwright.dev/)             | Browser acceptance and responsive testing | Apache-2.0 |
| [axe-core](https://github.com/dequelabs/axe-core) | Automated accessibility checks            | MPL-2.0    |
| [Vitest](https://vitest.dev/)                     | Unit and integration testing              | MIT        |

Transitive notices and complete license texts are distributed by the respective
packages in `node_modules` after `npm ci`.

## Services and data

- Sports data and verification proofs are supplied by
  [TxLINE](https://txline.txodds.com/) subject to its
  [hackathon terms](https://txline.txodds.com/documentation/legal/hackathon-terms).
  ProofPlay does not grant rights to TxLINE data and does not distribute a raw
  feed or standalone dataset.
- Blockchain state and transaction links use public Solana devnet interfaces.
  “Solana” is used descriptively; no endorsement is implied.

## Visual assets and marks

`apps/web/public/og.png`, the ProofPlay wordmark treatment, interface graphics,
and CSS artwork were created for this project. The submission does not use FIFA
logos, tournament marks, official match photography, or other third-party brand
assets.
