# TxLINE devnet runbook

This runbook is the repeatable ProofPlay path for activating TxLINE's free World Cup tier and verifying every data path used by the MVP. The implementation follows the official [Quickstart](https://txline.txodds.com/documentation/quickstart), [World Cup guide](https://txline.txodds.com/documentation/worldcup), [devnet examples](https://txline.txodds.com/documentation/examples/devnet-examples), and [troubleshooting guide](https://txline.txodds.com/documentation/examples/troubleshooting).

## Pinned network contract

Every value in a row must stay on the same network. ProofPlay intentionally rejects overrides that mix these devnet values with another TxLINE host, program, or mint.

| Setting             | Devnet value                                                          |
| ------------------- | --------------------------------------------------------------------- |
| Solana genesis hash | `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`                        |
| Default RPC         | `https://api.devnet.solana.com`                                       |
| TxLINE API origin   | `https://txline-dev.txodds.com`                                       |
| TxLINE program      | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`                        |
| TxL Token-2022 mint | `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG`                        |
| Free service level  | `1` (verified against the on-chain pricing matrix before subscribing) |
| Duration            | `4` weeks                                                             |
| Selected leagues    | `[]` for the standard World Cup bundle                                |

The RPC URL may be replaced with a private devnet RPC, including Helius. The activation script still reads its genesis hash and verifies the TxLINE program account before sending a transaction.

## One-time wallet setup

Use a dedicated devnet wallet. The filename below matches the repository's keypair ignore rule.

```bash
solana-keygen new --no-bip39-passphrase --silent -o txline-devnet-keypair.json
npm run txline:address
```

Fund only the printed public address with devnet SOL. About `0.1 SOL` is ample for the Token-2022 associated account, free subscription, and retries. Never paste the keypair contents, seed phrase, guest JWT, or API token into GitHub, chat, screenshots, or support channels.

Run the preflight diagnostic after funding:

```bash
npm run txline:diagnose
```

This checks the RPC genesis hash, executable TxLINE program, pinned public configuration, wallet address, and balance without exposing credentials.

## Activate or renew access

Copy `.env.example` to `.env` if the defaults need to be overridden. The activation path then:

1. verifies the Solana network and current free pricing row;
2. creates the wallet's Token-2022 associated account when absent;
3. sends `subscribe(1, 4)` to the devnet TxLINE program;
4. obtains a guest JWT from the matching devnet host;
5. signs the exact detached-signature preimage `${txSig}::${jwt}`;
6. activates the API token; and
7. writes both credentials to `.txline/devnet-credentials.json` with owner-only file permissions.

```bash
npm run txline:activate
```

If the on-chain subscription confirms but the activation request is interrupted, recover that public transaction signature without subscribing again:

```bash
npm run txline:recover -- <confirmed-subscription-signature>
```

The activated API token is long-lived relative to the guest JWT. A `401` requires a fresh guest JWT from the same host, not another on-chain subscription:

```bash
npm run txline:renew
```

The API client performs one automatic JWT renewal and retry during verification. It continues sending the same API token in `X-Api-Token`.

## Verify the integration contract

```bash
npm run txline:verify
```

The verification script exercises these authenticated paths:

- fixture snapshot for World Cup competition `72`;
- odds snapshot for a covered fixture;
- score snapshot and historical records for a completed fixture;
- scores SSE connection using both auth headers; and
- `scores/stat-validation` proof retrieval using a non-zero sequence observed in the historical response.

It writes a secret-free report to `.txline/verification-report.json`. The report records public network values, the public wallet address, selected fixture IDs, record counts, the observed proof sequence/stat key, and SSE connection time. It never contains either credential.

The latest checked-in, secret-free integration result is available in [`docs/evidence/txline-devnet-verification.json`](evidence/txline-devnet-verification.json). It records successful JWT renewal with API-token reuse plus fixtures, historical odds, score snapshot/replay, SSE, and proof validation paths.

The fixture query and SSE timeout can be adjusted for troubleshooting:

```bash
TXLINE_FIXTURE_COMPETITION_ID=72 \
TXLINE_FIXTURE_START_EPOCH_DAY=20605 \
TXLINE_SSE_TIMEOUT_MS=30000 \
npm run txline:verify
```

## Failure diagnostics

| Diagnostic                | Meaning                                                              | Action                                                                                                      |
| ------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `TXLINE_NETWORK_MISMATCH` | RPC, API host, program, mint, or stored credentials disagree         | Restore the pinned devnet values and reactivate only if the local credential file came from another network |
| `TXLINE_JWT_EXPIRED`      | Data endpoint returned `401` after renewal was unavailable or failed | Run `npm run txline:renew` and retry                                                                        |
| `TXLINE_ACCESS_DENIED`    | API returned `403`                                                   | Confirm the subscription wallet, activation signature, host, API token, and bundle permissions              |
| `TXLINE_INVALID_SEQUENCE` | A proof request used a missing, zero, or unsupported score sequence  | Select `Seq`/`seq` from a real snapshot, historical record, update, or SSE message                          |
| `TXLINE_SSE_ERROR`        | The scores stream did not open before the timeout                    | Renew the JWT, check both auth headers and the devnet host, then increase the timeout if needed             |

An open SSE connection with no score messages is healthy when no covered fixture is actively updating. Historical records provide the deterministic demo path after matches finish.

## Integration feedback

What worked well:

- the official examples cover subscription, JWT renewal, snapshots, SSE, and proof retrieval end to end;
- one normalized scores surface supports both current updates and historical replay; and
- the validation endpoint makes the exact score sequence being proven visible to application code.

Friction to report with the submission:

- activation depends on a precise three-part signing preimage and two credentials with different lifecycles;
- the activation endpoint returned the successful API token as plain text rather than JSON, so clients should accept both response shapes;
- the historical scores endpoint returned an SSE-framed replay (`text/event-stream`) rather than a JSON array, requiring event-frame decoding before selecting `Seq` values;
- completed fixtures returned historical odds only when `asOf` was set to the fixture start time; a current-time snapshot was empty;
- fixed fixture/sequence examples age quickly, so production code must discover current records and retain their real sequence values; and
- network-sensitive values are spread across Solana RPC, IDL, program, mint, guest-auth host, and API host, making an explicit consistency check essential.

If support is required, share only the network, endpoint/status, program ID, public wallet address, redacted transaction signature, fixture ID, sequence, and stat key. Never share authentication headers or wallet secrets.
