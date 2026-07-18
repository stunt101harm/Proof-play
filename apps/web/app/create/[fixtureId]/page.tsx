import { notFound } from "next/navigation";
import Link from "next/link";

import { ConditionBuilder } from "@/components/condition-builder";
import { SiteNav } from "@/components/site-nav";
import { seededFixture } from "@/lib/demo-data";

export default async function CreatePoolPage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId } = await params;
  const fixture = seededFixture(fixtureId);
  if (!fixture) notFound();
  const names: [string, string] = [
    fixture.participants[0].name,
    fixture.participants[1].name,
  ];

  return (
    <main>
      <SiteNav label="Pool creator navigation" />
      <header className="page-header page-header--compact">
        <div>
          <span className="eyebrow">
            Prediction creator · Fixture {fixtureId}
          </span>
          <h1>Build the human contract first.</h1>
          <p>
            Choose one or two supported conditions. ProofPlay validates them in
            real time and shows the exact TxLINE inputs and deterministic
            strategy before a pool can be created.
          </p>
        </div>
      </header>
      <div className="selected-fixture-bar">
        <span>Selected match</span>
        <strong>
          {names[0]} vs {names[1]}
        </strong>
        <Link href={`/matches/${fixtureId}`}>Back to match center</Link>
      </div>
      <ConditionBuilder fixtureId={fixtureId} participantNames={names} />
      <footer>
        <p>Compiler v1 · one or two AND legs</p>
        <span>Devnet demo tokens have no monetary value</span>
      </footer>
    </main>
  );
}
