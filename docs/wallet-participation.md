# Wallet creation and pool participation

ProofPlay supports real Solana devnet pool creation, deposits, claims, and refunds while preserving the wallet-free Judge Demo. Browser transactions use the deployed program at `AJwjCjk9sb9SWMiuLWDCDgnL6zFEENgnULfkCYaU5Ar` and conventional SPL tokens only.

## Browser trust boundary

- The app verifies the RPC genesis hash before enabling transactions.
- Phantom, Solflare, Backpack, and compatible injected wallets are detected without receiving seed phrases or private keys.
- Every transaction is built locally, shown as pending/signing/confirming/failed, signed by the connected wallet, and confirmed on devnet.
- The client derives canonical pool, vault, settlement-config, and position PDAs itself.
- Pool and position accounts are accepted only when their Anchor discriminator and program owner match.
- The dedicated ProofPlay demo-token mint is the only mint this client permits for new deposits.
- TxLINE subscription credits are explicitly blocked and are never presented as collateral.

## Creator flow

`/create/18241006` reuses the same compiler as settlement. A creator chooses one or two compatible condition legs, title, description, and UTC deposit cutoff. Before signing, the review surface shows:

- the readable condition;
- exact compiler version, stat keys, strategy, and 32-byte commitment;
- demo-token collateral and connected wallet;
- estimated network fee plus the fact that account rent is also required;
- the deterministic future pool address.

The browser serializes `create_pool` exactly as the checked Anchor IDL, estimates the transaction, waits for wallet approval, confirms it, and navigates to the new `/pools/<address>` route with the creation transaction attached.

Titles and descriptions are presentation metadata, not settlement inputs. The canonical condition is carried in the shareable URL and recompiled on the pool page. It is displayed as verified only when its fixture, compiler version, and commitment match the on-chain pool. A modified URL therefore cannot silently change the displayed contract.

## Participation state machine

The pool page reads fresh on-chain totals and the connected wallet's position PDA after every confirmed action.

| Pool/position state            | Exposed action                                      |
| ------------------------------ | --------------------------------------------------- |
| Open, before cutoff            | Join YES or NO with the configured demo token       |
| Existing open position         | Add only to its already-selected side               |
| Locked                         | No deposit; await TxLINE settlement or cancellation |
| Settled on the winning side    | Claim the exact deterministic pro-rata amount       |
| Settled on the losing side     | No claim action                                     |
| Cancelled, unrefunded position | Refund the original deposit                         |
| Claimed, refunded, or closed   | No repeat terminal action                           |

The payout preview uses the program's integer rule:

```text
floor(remaining_pool_amount * position_amount / remaining_winning_stake)
```

When the wallet is the final winner, the remaining pool amount is shown as the claim, matching the program's remainder-conservation rule.

## Funding a judge wallet

The UI can request devnet SOL from the cluster faucet for transaction fees. Public airdrops may be rate-limited.

Demo SPL tokens are issued only by the project team; the mint authority is never exposed to the browser or deployed app. From a trusted operator shell:

```bash
PROOF_PLAY_WALLET_PATH=/absolute/path/to/devnet-mint-authority.json \
  npm run demo:fund -- <judge-wallet-address> 20
```

`PROOF_PLAY_RPC_URL` may point to a private devnet RPC for this operator command. The command verifies the devnet genesis hash and mint authority, creates the recipient associated token account when needed, mints the requested amount, and prints only public addresses and the Explorer-safe transaction signature.

Never commit the wallet file, place a Helius API key in `NEXT_PUBLIC_SOLANA_RPC_URL`, or expose the mint authority through a public faucet endpoint.
