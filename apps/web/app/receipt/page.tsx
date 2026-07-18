import {
  receiptFromDevnetEvidence,
  type DevnetEvidence,
} from "@proof-play/receipt";
import { CopyIdentifier } from "@/components/copy-identifier";
import { ButtonLink } from "@/components/ui/button-link";
import Link from "next/link";
import evidenceJson from "../../../../docs/evidence/proof-settlement-devnet-verification.json";

const receipt = receiptFromDevnetEvidence(
  evidenceJson as unknown as DevnetEvidence,
);

function tokenAmount(raw: string, decimals: number) {
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function Identifier({ label, value }: { label: string; value: string }) {
  return (
    <div className="identifier">
      <span>{label}</span>
      <code>{value}</code>
      <CopyIdentifier value={value} />
    </div>
  );
}

export default function ReceiptPage() {
  const settlement = receipt.settlement!;
  const result = receipt.result!;
  const validation = receipt.validation!;
  const payout = receipt.payout!;
  const summary = receipt.payoutSummary!;

  return (
    <main>
      <nav className="nav" aria-label="Receipt navigation">
        <Link className="brand" href="/" aria-label="ProofPlay home">
          <span className="brand__mark" aria-hidden="true">
            P
          </span>
          <span>ProofPlay</span>
        </Link>
        <ButtonLink href="/replay" variant="secondary">
          Run match replay
        </ButtonLink>
      </nav>

      <header className="page-header page-header--receipt">
        <div>
          <span className="eyebrow">Judge demo · Step 02</span>
          <h1>Proof Receipt</h1>
          <p>
            Human-readable settlement evidence backed by a real devnet
            transaction.
          </p>
        </div>
        <div className="verified-seal" aria-label="Settlement verified">
          <span>✓</span>
          <strong>Verified</strong>
          <small>Solana devnet</small>
        </div>
      </header>

      <section className="receipt-shell">
        <div className="receipt-question">
          <span className="eyebrow">Pool question</span>
          <h2>{receipt.market.statement}</h2>
          <ol>
            {receipt.market.legs.map((leg) => (
              <li key={leg}>{leg}</li>
            ))}
          </ol>
          <div className="receipt-result">
            <span>Predicate result</span>
            <strong>{validation.predicateResult ? "TRUE" : "FALSE"}</strong>
            <span>Winning side</span>
            <strong>{settlement.winningSide?.toUpperCase()}</strong>
          </div>
        </div>

        <div className="receipt-grid">
          <article className="receipt-panel">
            <span className="eyebrow">01 · Final sports data</span>
            <h3>Fixture {receipt.market.fixtureId}</h3>
            <dl className="receipt-facts">
              <div>
                <dt>Action</dt>
                <dd>{result.action}</dd>
              </div>
              <div>
                <dt>Status ID</dt>
                <dd>{result.statusId}</dd>
              </div>
              <div>
                <dt>Sequence</dt>
                <dd>{result.sequence}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>TxLINE</dd>
              </div>
            </dl>
            <div className="receipt-stats">
              {result.stats.map((stat) => (
                <span key={stat.key}>
                  Key {stat.key}: <strong>{stat.value}</strong>
                </span>
              ))}
            </div>
          </article>

          <article className="receipt-panel">
            <span className="eyebrow">02 · Compiled condition</span>
            <h3>Deterministic strategy v{receipt.market.compilerVersion}</h3>
            <dl className="receipt-facts">
              <div>
                <dt>Stat keys</dt>
                <dd>{receipt.market.statKeys.join(", ")}</dd>
              </div>
              <div>
                <dt>Proof accepted</dt>
                <dd>{validation.proofAccepted ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>100 · final</dd>
              </div>
              <div>
                <dt>Observed seq</dt>
                <dd>{settlement.observedSequence}</dd>
              </div>
            </dl>
            <Identifier
              label="Condition commitment"
              value={receipt.market.conditionCommitment}
            />
          </article>

          <article className="receipt-panel">
            <span className="eyebrow">03 · Pool accounting</span>
            <h3>{settlement.poolState} · payout complete</h3>
            <dl className="receipt-facts">
              <div>
                <dt>YES pool</dt>
                <dd>{tokenAmount(payout.yesAmount, payout.tokenDecimals)}</dd>
              </div>
              <div>
                <dt>NO pool</dt>
                <dd>{tokenAmount(payout.noAmount, payout.tokenDecimals)}</dd>
              </div>
              <div>
                <dt>Total pool</dt>
                <dd>
                  {tokenAmount(summary.totalPoolAmount, payout.tokenDecimals)}
                </dd>
              </div>
              <div>
                <dt>Winner claim</dt>
                <dd>
                  {tokenAmount(
                    summary.calculatedClaimAmount!,
                    payout.tokenDecimals,
                  )}
                </dd>
              </div>
            </dl>
            <p className="formula">{summary.formula}</p>
          </article>

          <article className="receipt-panel">
            <span className="eyebrow">04 · On-chain verification</span>
            <h3>{receipt.statusMessage}</h3>
            <div className="explorer-links">
              <a href={receipt.explorer.settlementTransaction!}>
                Settlement transaction ↗
              </a>
              <a href={receipt.explorer.pool}>Pool account ↗</a>
              <a href={receipt.explorer.dailyScoresRoot!}>
                TxLINE daily root ↗
              </a>
              <a href={receipt.explorer.proofPlayProgram!}>
                ProofPlay program ↗
              </a>
            </div>
            <Identifier
              label="Transaction"
              value={settlement.transactionSignature}
            />
          </article>
        </div>

        <div className="receipt-identifiers">
          <Identifier label="Pool" value={receipt.market.poolAddress} />
          <Identifier
            label="ProofPlay program"
            value={settlement.proofPlayProgramId}
          />
          <Identifier
            label="TxLINE program"
            value={validation.txlineProgramId}
          />
        </div>
      </section>

      <footer>
        <p>Real devnet evidence · no mocked settlement</p>
        <span>Pending and failed receipts never claim a winner</span>
      </footer>
    </main>
  );
}
