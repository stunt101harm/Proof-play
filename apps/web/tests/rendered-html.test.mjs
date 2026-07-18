import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the ProofPlay foundation", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>ProofPlay \| Verifiable match predictions<\/title>/i,
  );
  assert.match(html, /Prediction pools that settle with proof/i);
  assert.match(html, /TxLINE-powered settlement/i);
  assert.match(html, /No real-money wagering/i);
  assert.doesNotMatch(html, /codex-preview|Starter Project|taking shape/i);
});

test("server-renders the deterministic replay demo", async () => {
  const response = await render("/replay");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Replay a full match in under two minutes/i);
  assert.match(html, /REPLAY · TxLINE history · devnet/i);
  assert.match(html, /Fixture 18241006/i);
  assert.match(html, /Start replay/i);
});

test("server-renders the verified devnet Proof Receipt", async () => {
  const response = await render("/receipt");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Proof Receipt/i);
  assert.match(html, /TxLINE proof accepted on Solana devnet/i);
  assert.match(html, /5DBFhtF8dmg8iPH63/i);
  assert.match(html, /Winning side/i);
  assert.match(html, /YES/i);
});
