import { notFound } from "next/navigation";
import Link from "next/link";

import { MatchCenter } from "@/components/match-center";
import { SiteNav } from "@/components/site-nav";
import { seededFixture } from "@/lib/demo-data";

function displayKickoff(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId } = await params;
  const fixture = seededFixture(fixtureId);
  if (!fixture) notFound();

  return (
    <main>
      <SiteNav label="Match center navigation" />
      <header className="match-header">
        <div>
          <span className="eyebrow">TxLINE match center · Final</span>
          <h1>
            {fixture.participants[0].name}
            <span>vs</span>
            {fixture.participants[1].name}
          </h1>
          <p>
            {displayKickoff(fixture.startsAt)} · Fixture {fixture.fixtureId} ·
            Solana devnet
          </p>
        </div>
        <div className="match-header__actions">
          <Link href={`/create/${fixture.fixtureId}`}>Create a pool</Link>
          {fixture.coverage === "verified" ? (
            <Link href="/demo">Run Judge Demo</Link>
          ) : null}
        </div>
      </header>
      <MatchCenter fixture={fixture} />
      <footer>
        <p>TxLINE normalized match data</p>
        <span>Replay is historical · live mode is explicitly labelled</span>
      </footer>
    </main>
  );
}
