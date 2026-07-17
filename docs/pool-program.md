# ProofPlay pool program

The ProofPlay Anchor program provides deterministic custody and accounting for
binary YES/NO pari-mutuel pools. It is deployed to Solana devnet at
`AJwjCjk9sb9SWMiuLWDCDgnL6zFEENgnULfkCYaU5Ar`.

The program escrows a conventional SPL token chosen when a pool is created.
ProofPlay clients use a dedicated, clearly labelled devnet demo token. TxLINE
subscription credits are never collateral and are never transferred by this
program.

## Accounts and addresses

| Account            | PDA seeds                                           | Purpose                                                                      |
| ------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Pool`             | `pool`, creator public key, little-endian `pool_id` | Immutable market identity, lifecycle, side totals, and remaining liabilities |
| `Vault`            | `vault`, pool public key                            | SPL token account owned by the pool PDA                                      |
| `SettlementConfig` | `settlement_config`, pool public key                | Immutable stat-key order and exact TxLINE predicate strategy                 |
| `SettlementRecord` | `settlement`, pool public key                       | One-time proof metadata and verified outcome receipt                         |
| `Position`         | `position`, pool public key, owner public key       | One wallet's aggregate stake and terminal claim/refund flags                 |

`pool_id` is a creator-scoped `u64` nonce. A wallet has one position per pool:
its first deposit fixes the YES/NO side, and later deposits may only add to that
same side. This keeps one claim authority and one terminal flag per participant.

The pool permanently binds the creator, fixture ID, mint, 32-byte canonical
condition commitment, compiler version, cutoff, refund-availability timestamp,
and demo-mode flag. `create_pool` atomically creates `SettlementConfig` with the
ordered stat keys and exact `validateStatV3` strategy. These values cannot be
replaced after deposits begin.

## Lifecycle instructions

| Instruction           | Authority and precondition                                                    | Effect                                                                    |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `create_pool`         | Creator signs; valid future cutoff, refund grace, and exact-coverage strategy | Creates the pool, immutable settlement config, and empty token vault      |
| `join_pool`           | Participant signs before cutoff while `Open`                                  | Transfers tokens into the vault and records an aggregate YES/NO position  |
| `lock_pool`           | Permissionless at or after cutoff                                             | Moves `Open` to `Locked`                                                  |
| `record_demo_outcome` | Creator signs; pool is `Locked` and explicitly demo-only                      | Records a positive replay sequence and the selected demo winner           |
| `settle_pool`         | Permissionless; pool is `Locked`; valid final TxLINE V3 proof                 | Executes TxLINE CPI, derives the winner, and creates the one-time receipt |
| `cancel_pool`         | Creator at any time while unresolved, or anyone after `refund_after`          | Makes every funded position refundable                                    |
| `claim`               | Winning position owner signs                                                  | Pays the deterministic pro-rata share exactly once                        |
| `refund`              | Position owner signs after cancellation                                       | Returns the original stake exactly once                                   |

`record_demo_outcome` cannot settle a production pool. It exists only so the
escrow lifecycle can be exercised independently on devnet. Production pools
can be settled by any payer, but the caller cannot choose the fixture, stat
order, strategy, or winner. The program derives the daily-root PDA from the
proof timestamp, pins TxLINE devnet program
`6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`, invokes
`validate_stat_v3`, and maps its returned boolean to YES/NO atomically.

Every proven stat leaf must use TxLINE full-game period `100`. The receipt
stores the immutable commitment/compiler version, TxLINE program and root,
proof timestamp, event root, proven stat values, result, winner, and observed
API sequence. TxLINE V3's on-chain payload commits to the selected event root
but does not itself include the API sequence or action string; those fields are
therefore transparent keeper metadata, not overstated as on-chain proof inputs.

If a selected winning side has no stake, the pool becomes `Cancelled`; the
other side is refunded instead of its deposits being captured. An economically
finished pool becomes `Closed`, but its read-only accounts remain available for
receipts and audit history.

## Accounting and safety rules

Let `R` be the recorded remaining pool liability, `W` the remaining unclaimed
winning stake, and `p` a claimant's stake. Each payout is:

```text
floor(R * p / W)
```

After a payout the program subtracts both the payout from `R` and the stake from
`W`. The final winner receives the exact remainder. This conserves every base
unit without a privileged fee or dust sweep.

The implementation enforces the following boundaries:

- deposits are non-zero, checked for overflow, and rejected at the cutoff;
- every pool, vault, and position must match its canonical PDA seeds;
- token mints, token-account owners, pool ownership, and vault authority are
  checked on every transfer path;
- payout liability is derived only from confirmed program deposits, never from
  the vault's raw balance;
- a direct external transfer can create inert surplus but cannot increase a
  participant's payout;
- settlement and cancellation are terminal choices, and positions cannot claim
  or refund twice;
- settlement configuration must cover every stat index exactly once and only
  supports compiler-v1 goals/corners keys `1`, `2`, `7`, and `8`;
- altered fixtures, stat order, period, strategy, timestamp/root account,
  Merkle nodes, values, and settlement replays fail atomically;
- token transfers and state changes are atomic within the Solana transaction.

## Reproducing the devnet lifecycle

Build the program and run the funded verifier with an explicitly selected
devnet wallet:

```bash
npm run anchor:build
PROOF_PLAY_WALLET_PATH=/absolute/path/to/devnet-wallet.json npm run program:verify
```

The verifier checks the cluster genesis and executable program, creates a fresh
demo mint, funds both sides, proves late deposits fail, settles and claims a
demo pool, exercises losing/duplicate/substituted-account failures, and then
cancels and refunds a second pool. It prints a secret-free JSON report suitable
for `docs/evidence/`.

The checked-in [devnet lifecycle evidence](evidence/pool-lifecycle-devnet.json)
records the deployment, pool accounts, transaction signatures, expected
rejections, zero final liabilities, and empty vault balances from the canonical
run.

Run the production proof verifier after the program is deployed:

```bash
PROOF_PLAY_WALLET_PATH=/absolute/path/to/devnet-wallet.json npm run program:verify-proof
```

It selects the finalized TxLINE sequence, requests the compact V3 multiproof,
creates and funds a production pool, proves every adversarial alteration fails
without changing state, settles permissionlessly, rejects replay, claims the
payout, measures serialized transaction bytes and compute units, and writes a
secret-free [proof-settlement report](evidence/proof-settlement-devnet-verification.json).
