import Link from "next/link";

export function SiteNav({ label }: { label?: string }) {
  return (
    <nav className="nav" aria-label={label ?? "Primary navigation"}>
      <Link className="brand" href="/" aria-label="ProofPlay home">
        <span className="brand__mark" aria-hidden="true">
          P
        </span>
        <span>ProofPlay</span>
      </Link>
      <div className="site-links">
        <Link href="/fixtures">Matches</Link>
        <Link href="/demo">Judge Demo</Link>
        <Link href="/receipt">Proof Receipt</Link>
      </div>
    </nav>
  );
}
