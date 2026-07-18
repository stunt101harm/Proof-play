# Security, accessibility, and compliance

## Trust boundaries

- TxLINE credentials and keeper wallet paths are server-only. CI scans tracked
  files and the built client bundle for credential markers.
- Browser transactions are composed for the connected wallet, limited to
  Solana devnet, and confirmed before the UI reports success.
- Settlement fails closed unless the final TxLINE fixture, sequence, stat keys,
  full-game periods, and stored condition all match.
- Security headers prevent MIME sniffing, framing, referrer over-sharing, and
  access to unused camera, microphone, and geolocation capabilities.

Run the complete gates with `npm run security`. They cover tracked-secret
patterns, public-asset branding/data boundaries, client-bundle credentials, and
production dependency advisories. CI also runs unit tests, built-worker route
checks, a deterministic browser golden path, keyboard-only operation,
accessibility scans, responsive overflow checks, and Rust program tests.

## Dependency review

The July 18, 2026 production audit reports zero high-severity and zero critical
advisories. Moderate advisories remain in legacy Solana/Anchor transitive tooling
and the current web toolchain where npm reports no compatible direct fix. They
do not cross the server-only credential boundary, and CI fails on any newly
introduced high or critical production advisory. Re-run `npm audit --omit=dev`
before submission and record any changed result here.

## Hackathon and product safeguards

- The public application is an 18+ experimental hackathon prototype.
- It runs only on Solana devnet. Demo tokens, devnet SOL, and simulated positions
  have no monetary value; the application accepts no payment and offers no
  prize.
- ProofPlay is independent and uses no FIFA/tournament logo, official graphics,
  or implied affiliation.
- TxLINE responses are transformed into limited application views. The project
  does not publish raw feed responses, downloadable datasets, or reusable data
  archives.
- Principal dependency, service, and asset attribution is in
  [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Accessibility baseline

Every route includes a keyboard-visible skip link and global focus indicators.
Animations collapse when reduced motion is requested. Critical pages are tested
at mobile and desktop widths, and the entire wallet-free golden path can be
completed with Tab, Enter, and standard controls. Automated axe checks reject
critical WCAG A/AA violations on the home, fixture, demo, receipt, creator, and
legal routes.
