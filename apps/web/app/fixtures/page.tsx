import { FixturesBrowser } from "@/components/fixtures-browser";
import { SiteNav } from "@/components/site-nav";

export default function FixturesPage() {
  return (
    <main>
      <SiteNav label="Match navigation" />
      <header className="page-header page-header--compact">
        <div>
          <span className="eyebrow">TxLINE match discovery</span>
          <h1>Find the match. Follow the proof.</h1>
          <p>
            Browse covered fixtures from the normalized TxLINE adapter, then
            open a live or accelerated match center without exposing data-feed
            credentials.
          </p>
        </div>
      </header>
      <FixturesBrowser />
      <footer>
        <p>Neutral team presentation · no official tournament affiliation</p>
        <span>TxLINE data · Solana devnet</span>
      </footer>
    </main>
  );
}
