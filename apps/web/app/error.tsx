"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset(): void;
}) {
  useEffect(() => {
    console.error("[proof-play.ui]", {
      event: "route-error",
      digest: error.digest ?? "unavailable",
    });
  }, [error.digest]);

  return (
    <main>
      <section className="failure-shell" role="alert">
        <span className="eyebrow">Safe failure</span>
        <h1>This ProofPlay view could not be completed.</h1>
        <p>
          No failed or unknown action is being represented as final. If a wallet
          transaction was signed, verify its actual state on Solana Explorer
          before retrying.
        </p>
        <div className="failure-shell__actions">
          <button type="button" className="demo-primary" onClick={reset}>
            Retry this view
          </button>
          <Link href="/demo">Use the wallet-free Judge Demo</Link>
        </div>
      </section>
    </main>
  );
}
