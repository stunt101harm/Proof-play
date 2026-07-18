import { PoolExperience } from "@/components/pool-experience";
import { SiteNav } from "@/components/site-nav";

function value(input: string | string[] | undefined) {
  return typeof input === "string" ? input : undefined;
}

export default async function PoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ poolAddress: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ poolAddress }, query] = await Promise.all([params, searchParams]);
  const title = value(query.title)?.slice(0, 60) || "ProofPlay prediction pool";
  const description = value(query.description)?.slice(0, 180);

  return (
    <main>
      <SiteNav label="Pool participation navigation" />
      <header className="page-header page-header--compact pool-page-header">
        <div>
          <span className="eyebrow">On-chain prediction pool</span>
          <h1>{title}</h1>
          <p>
            {description ??
              "Read the immutable condition, follow on-chain totals, and expose only the wallet actions valid for the current pool state."}
          </p>
        </div>
      </header>
      <PoolExperience
        poolAddress={poolAddress}
        fixtureIdHint={value(query.fixture)}
        canonicalJson={value(query.condition)}
        creationTransaction={value(query.tx)}
      />
      <footer>
        <p>Real Solana devnet state · demo tokens have no monetary value</p>
        <span>TxLINE credits are never pool collateral</span>
      </footer>
    </main>
  );
}
