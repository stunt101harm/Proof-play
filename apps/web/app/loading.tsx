export default function Loading() {
  return (
    <main>
      <section className="loading-shell" aria-live="polite" aria-busy="true">
        <span className="eyebrow">Loading verified state</span>
        <h1>Checking ProofPlay evidence…</h1>
        <p>
          Pending TxLINE or Solana data is never displayed as a final result.
        </p>
      </section>
    </main>
  );
}
