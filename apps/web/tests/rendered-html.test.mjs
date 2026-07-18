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

test("server-renders covered fixture discovery", async () => {
  const response = await render("/fixtures");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /TxLINE match discovery/i);
  assert.match(html, /Find the match\. Follow the proof\./i);
  assert.match(html, /England/i);
  assert.match(html, /Argentina/i);
  assert.match(html, /Proof verified/i);
});

test("server-renders the fixture match center", async () => {
  const response = await render("/matches/18241006");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /TxLINE match center/i);
  assert.match(html, /England/i);
  assert.match(html, /Argentina/i);
  assert.match(html, /Historical replay/i);
  assert.match(html, /Live SSE/i);
  assert.match(html, /Argentina wins and total corners are at most 7/i);
});

test("server-renders the reusable condition creator", async () => {
  const response = await render("/create/18241006");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Build the human contract first/i);
  assert.match(html, /No-code condition/i);
  assert.match(html, /Condition type/i);
  assert.match(html, /Pool title/i);
  assert.match(html, /Compiling the current condition/i);
});

test("server-renders the wallet-free Judge Demo entry point", async () => {
  const response = await render("/demo");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Understand ProofPlay by using it/i);
  assert.match(html, /Wallet-free/i);
  assert.match(html, /Select a verified match/i);
  assert.match(html, /simulated participation/i);
  assert.match(html, /Use this fixture/i);
});
