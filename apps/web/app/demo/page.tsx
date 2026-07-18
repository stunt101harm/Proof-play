import { JudgeDemo } from "@/components/judge-demo";
import { SiteNav } from "@/components/site-nav";

export default function DemoPage() {
  return (
    <main>
      <SiteNav label="Judge Demo navigation" />
      <header className="page-header page-header--demo">
        <div>
          <span className="eyebrow">Zero setup · one coherent golden path</span>
          <h1>Understand ProofPlay by using it.</h1>
          <p>
            Select a covered match, compile a readable condition, join a seeded
            pool, replay TxLINE history, and inspect a real devnet Proof
            Receipt— no wallet extension, token, account, or fee required.
          </p>
        </div>
        <div className="demo-runtime">
          <strong>≈ 2 minutes</strong>
          <span>complete product path</span>
        </div>
      </header>
      <JudgeDemo />
      <footer>
        <p>Judge Demo · simulated participation · real settlement evidence</p>
        <span>No real-money wagering · no official tournament affiliation</span>
      </footer>
    </main>
  );
}
