import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <section className="failure-shell">
        <span className="eyebrow">404 · not found</span>
        <h1>This ProofPlay route does not exist.</h1>
        <p>
          No pool, settlement, or TxLINE result was inferred from the missing
          address.
        </p>
        <div className="failure-shell__actions">
          <Link href="/fixtures">Browse verified matches</Link>
          <Link href="/demo">Run the Judge Demo</Link>
        </div>
      </section>
    </main>
  );
}
