# Final hackathon submission checklist

Deadline: **July 19, 2026 at 23:59 UTC**.

## Required links

- [x] Public repository: <https://github.com/stunt101harm/Proof-play>
- [ ] Public application: <https://proof-play-txline.peterclawbot.chatgpt.site>
- [x] Devnet program: <https://explorer.solana.com/address/AJwjCjk9sb9SWMiuLWDCDgnL6zFEENgnULfkCYaU5Ar?cluster=devnet>
- [x] TxLINE-backed settlement: <https://explorer.solana.com/tx/5DBFhtF8dmg8iPH63RW74px3BrYbfAG1FZJzEiYpEChsUPrateGudXESKiJuyMxjhunVwPyyAeGYFytXucsqrqWH?cluster=devnet>
- [ ] Demo video (YouTube or Loom, public/unlisted and playable without login): add URL
- [ ] Superteam Earn submission URL/receipt: add after submission

## Initial-screening package

- [x] Working implementation, not a concept or wireframe
- [x] TxLINE is the primary fixture, odds, score, history, SSE, and proof source
- [x] Technical overview describes the idea, architecture, highlights, and exact endpoints
- [x] TxLINE integration feedback includes strengths and concrete friction
- [x] Public repository contains setup, tests, program IDs, Explorer evidence, security decisions, and limitations
- [x] Screenshots contain normalized product views only—not raw licensed payloads
- [ ] Final video is five minutes or less and names TxLINE's role throughout

## Before recording

- [ ] Merge the final submission PR to `main`
- [ ] Deploy the exact merged commit and make the app public
- [ ] Confirm `/api/health` returns HTTP 200 without credentials in the body
- [ ] Run `/demo` from a clean signed-out browser at desktop resolution
- [ ] Confirm fallback behavior still reaches the verified receipt if live history is temporarily unavailable
- [ ] Open the settlement and program Explorer links in advance
- [ ] Hide notifications, unrelated tabs, tokens, wallet paths, and browser autofill

## Video review

- [ ] Duration is under 5:00 (target script: 3:50)
- [ ] Problem and one-line promise appear in the first 20 seconds
- [ ] Fixture, condition compiler, simulated join, replay, receipt, and payout are readable
- [ ] TxLINE is named for ingestion, SSE/history, proof retrieval, and CPI validation
- [ ] Simulated participation and real devnet evidence are never conflated
- [ ] Final frame includes ProofPlay, repository URL, and deployed URL
- [ ] Video link plays in a signed-out browser and captions/audio are understandable

## Independent final recheck

- [ ] Repository visibility is `PUBLIC`
- [ ] App access is public and does not ask judges to sign in
- [ ] App, `/demo`, `/receipt`, and `/api/health` all return successfully
- [ ] Program account is executable on Solana devnet
- [ ] Canonical settlement is finalized and shows the TxLINE `ValidateStatV3` CPI
- [ ] `main` has green CI and no open release-blocking issues
- [ ] Secret/compliance/dependency gates pass on the submitted commit
- [ ] Superteam form contains app, repo, video, technical overview, and feedback links
- [ ] Submitted form is reopened once and every link is clicked again

Do not close issue #14 or the delivery epic until every unchecked item above is
complete and the submission receipt/link has been recorded.
