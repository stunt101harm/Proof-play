import { ReplayMatch } from "@/components/replay-match";
import { ButtonLink } from "@/components/ui/button-link";
import Link from "next/link";

export default function ReplayPage() {
  return (
    <main>
      <nav className="nav" aria-label="Replay navigation">
        <Link className="brand" href="/" aria-label="ProofPlay home">
          <span className="brand__mark" aria-hidden="true">
            P
          </span>
          <span>ProofPlay</span>
        </Link>
        <div className="nav__actions">
          <ButtonLink href="/receipt" variant="secondary">
            View Proof Receipt
          </ButtonLink>
        </div>
      </nav>
      <header className="page-header">
        <span className="eyebrow">Judge demo · Step 01</span>
        <h1>Replay a full match in under two minutes.</h1>
        <p>
          The same normalized TxLINE score records and reducer power live mode
          and this deterministic historical replay. No licensed raw feed data is
          committed to the repository.
        </p>
      </header>
      <ReplayMatch />
      <footer>
        <p>Historical replay · Fixture 18241006</p>
        <span>Source mode is always explicit</span>
      </footer>
    </main>
  );
}
