# Operations and failure runbook

This runbook covers the public web demo and the permissionless settlement
keeper. It is intentionally safe to share: never paste credential values,
wallet bytes, seed phrases, or private RPC URLs into logs or issues.

## Health checks

| Surface              | Check                               | Healthy result                                                            |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| Web worker           | `GET /api/health`                   | HTTP 200, web `ready`; TxLINE is `configured` or explicitly `replay-only` |
| TxLINE live probe    | `GET /api/health?probe=txline`      | HTTP 200 and TxLINE `reachable`                                           |
| Keeper watch process | `GET http://127.0.0.1:8788/healthz` | HTTP 200 after a run, with aggregate result counts only                   |

The default web check is shallow and does not spend an upstream request. The
explicit probe returns HTTP 503 when TxLINE is unreachable, without exposing
the upstream response or credentials. The keeper endpoint is opt-in:

```bash
KEEPER_WALLET_PATH=/absolute/path/to/devnet-wallet.json \
  npm run start --workspace=@proof-play/keeper -- \
  --watch --interval-ms 30000 --health-port 8788
```

Set `KEEPER_HEALTH_HOST=0.0.0.0` only inside an access-controlled container or
private network. The response includes timestamps, aggregate statuses, and no
wallet or token material.

## Fast diagnosis

1. Confirm `/api/health` and the public `/demo` route load.
2. If TxLINE is `replay-only`, verify both `TXLINE_GUEST_JWT` and
   `TXLINE_API_TOKEN` are present only in the server environment.
3. Run `npm run txline:diagnose`, then `npm run txline:renew` if the guest JWT
   expired. Use `npm run txline:recover` only for the documented interrupted
   activation case.
4. If Solana reads fail, verify devnet and the configured RPC. A private Helius
   devnet RPC may replace the public endpoint; the browser must never receive a
   secret API key.
5. If a transaction appears stuck or failed, use its public signature on Solana
   Explorer. The UI must not present pending or unknown state as confirmed.
6. If the keeper degrades, inspect credential-free JSON events and the aggregate
   `lastRun.results`. A proof mismatch is terminal and must never be bypassed.

## Judge-safe fallback

The wallet-free Judge Demo and checked devnet receipt remain the canonical
judging path. If live credentials or TxLINE history are temporarily unavailable,
the UI labels the failure and permits the judge to continue using the already
verified final state. This fallback never claims to perform a new transaction or
to re-verify synthetic data.

## Recovery rules

- Retry rate limits, network failures, expired blockhashes, and upstream 5xx
  errors with bounded backoff.
- Do not retry invalid fixture IDs, malformed normalized data, proof mismatches,
  wallet-network mismatches, or contract constraint failures without fixing the
  cause.
- Keeper execution is idempotent: settled, cancelled, and closed pools return
  `alreadySettled`; re-running must not submit a second settlement.
- Rotate a credential immediately if it is exposed, remove it from history, and
  rerun `npm run security:secrets` before publishing.
