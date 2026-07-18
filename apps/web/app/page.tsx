import { CONDITION_LIMITS } from "@proof-play/condition-engine";
import { PRODUCT, SYSTEM_COMPONENTS } from "@proof-play/domain";
import { getTxlineNetworkConfig } from "@proof-play/txline";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Surface } from "@/components/ui/surface";
import { readPublicEnv } from "@/lib/env";

const deliveryEpic = "https://github.com/stunt101harm/Proof-play/issues/1";
const productSpec =
  "https://github.com/stunt101harm/Proof-play/blob/main/docs/product-spec.md";

export default function Home() {
  const environment = readPublicEnv();
  const txline = getTxlineNetworkConfig(environment.solanaNetwork);

  return (
    <main>
      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="ProofPlay home">
          <span className="brand__mark" aria-hidden="true">
            P
          </span>
          <span>{PRODUCT.name}</span>
        </a>
        <div className="nav__status">
          <span className="status-dot" aria-hidden="true" />
          {PRODUCT.network}
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero__copy">
          <Badge tone="accent">TxLINE-powered settlement</Badge>
          <h1>{PRODUCT.tagline}</h1>
          <p className="hero__lede">
            Build a match prediction in plain language, join either side, and
            settle the result from cryptographic sports data anchored on Solana.
          </p>
          <div className="hero__actions">
            <ButtonLink href="/demo">Run the judge demo</ButtonLink>
            <ButtonLink href="/fixtures" variant="secondary">
              Browse TxLINE matches
            </ButtonLink>
          </div>
          <dl className="hero__limits" aria-label="MVP limits">
            <div>
              <dt>{CONDITION_LIMITS.maxLegs}</dt>
              <dd>condition legs</dd>
            </div>
            <div>
              <dt>{CONDITION_LIMITS.maxUniqueStatKeys}</dt>
              <dd>verified stat keys</dd>
            </div>
            <div>
              <dt>0</dt>
              <dd>trusted result operators</dd>
            </div>
          </dl>
        </div>

        <aside className="proof-card" aria-label="Example proof receipt">
          <div className="proof-card__topline">
            <span>Proof Receipt</span>
            <Badge>Foundation</Badge>
          </div>
          <p className="proof-card__question">
            Argentina wins
            <span>and</span>
            total corners are at most 7
          </p>
          <div className="proof-card__path" aria-label="Verification path">
            <div>
              <span>01</span>
              <p>Human condition</p>
            </div>
            <div>
              <span>02</span>
              <p>TxLINE predicate</p>
            </div>
            <div>
              <span>03</span>
              <p>Solana settlement</p>
            </div>
          </div>
          <div className="proof-card__footer">
            <span>Network</span>
            <strong>{environment.solanaNetwork}</strong>
            <span>Oracle</span>
            <strong>{new URL(txline.apiOrigin).hostname}</strong>
          </div>
        </aside>
      </section>

      <Surface eyebrow="One coherent system" title="The foundation is in place">
        <p className="surface__intro">
          Every component follows the same product contract, from the fan-facing
          sentence to the final payout evidence.
        </p>
        <div className="component-grid">
          {SYSTEM_COMPONENTS.map((component, index) => (
            <article className="component-card" key={component.name}>
              <span className="component-card__index">0{index + 1}</span>
              <h3>{component.name}</h3>
              <p>{component.description}</p>
              <span className="component-card__status">{component.status}</span>
            </article>
          ))}
        </div>
      </Surface>

      <footer>
        <p>Built for the TxLINE World Cup Hackathon.</p>
        <span>
          <a href={productSpec}>Product contract</a> ·{" "}
          <a href={deliveryEpic}>Delivery epic</a> · No real-money wagering
        </span>
      </footer>
    </main>
  );
}
