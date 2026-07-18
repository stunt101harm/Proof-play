import Link from "next/link";

import { SiteNav } from "@/components/site-nav";

const termsUrl =
  "https://txline.txodds.com/documentation/legal/hackathon-terms";
const noticesUrl =
  "https://github.com/stunt101harm/Proof-play/blob/main/THIRD_PARTY_NOTICES.md";

export default function LegalPage() {
  return (
    <main>
      <SiteNav label="Legal notice navigation" />
      <header className="page-header page-header--compact">
        <div>
          <span className="eyebrow">Prototype, legal &amp; data notice</span>
          <h1>Built to demonstrate verification—not real-money wagering.</h1>
          <p>
            ProofPlay is an experimental, 18+ hackathon prototype operating only
            on Solana devnet. This notice describes the limits visible
            throughout the product.
          </p>
        </div>
      </header>

      <section className="legal-shell">
        <div className="legal-grid">
          <article>
            <h2>No real value or prize</h2>
            <p>
              Devnet SOL and ProofPlay demo tokens have no monetary value. The
              app accepts no payment, promises no prize or return, and is not a
              production gambling, investment, or financial service.
            </p>
          </article>
          <article>
            <h2>Independent prototype</h2>
            <p>
              ProofPlay is not sponsored, endorsed, or affiliated with FIFA or
              any tournament organiser. No tournament logos, marks, official
              graphics, or implied endorsement are used.
            </p>
          </article>
          <article>
            <h2>TxLINE data boundary</h2>
            <p>
              TxLINE is the primary sports-data source. The app transforms
              responses into limited product views and does not publish a raw
              feed, downloadable dataset, or reusable data archive. Access is
              subject to the official{" "}
              <a href={termsUrl} target="_blank" rel="noreferrer">
                hackathon terms
              </a>
              .
            </p>
          </article>
          <article>
            <h2>Wallet and network risk</h2>
            <p>
              Wallets remain self-custodied. Devnet and third-party RPCs can be
              delayed or unavailable. ProofPlay never represents a failed,
              pending, or unverified transaction as final; Explorer remains the
              source for transaction confirmation.
            </p>
          </article>
          <article id="attribution">
            <h2>Open-source attribution</h2>
            <p>
              The project uses attributed open-source libraries and
              project-authored visual assets. The complete dependency and asset
              notice is available in the{" "}
              <a href={noticesUrl} target="_blank" rel="noreferrer">
                repository attribution file
              </a>
              .
            </p>
          </article>
          <article>
            <h2>Privacy and suitability</h2>
            <p>
              The public app does not request identity documents or store wallet
              private keys. Users are responsible for determining whether
              interacting with this prototype is lawful and appropriate in their
              jurisdiction.
            </p>
          </article>
        </div>
      </section>

      <footer>
        <p>ProofPlay · independent TxLINE Hackathon prototype</p>
        <span>
          <Link href="/demo">Run the wallet-free demo</Link> · Not legal advice
        </span>
      </footer>
    </main>
  );
}
