import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:3000";
const outputDirectory = path.resolve("docs/assets");
await mkdir(outputDirectory, { recursive: true });

const finalRecord = {
  schemaVersion: 1,
  source: "txline",
  fixtureId: "18241006",
  sequence: 962,
  sourceUpdatedAt: "2026-07-15T23:54:24.772Z",
  startsAt: "2026-07-15T21:00:00.000Z",
  action: "game_finalised",
  gameState: "finished",
  lifecycle: "finalized",
  statusId: 100,
  period: null,
  participant: null,
  participant1IsHome: true,
  clock: null,
  score: {
    participant1: { goals: 1, yellowCards: 1, redCards: 0, corners: 1 },
    participant2: { goals: 2, yellowCards: 3, redCards: 0, corners: 6 },
  },
  stats: { 1: 1, 2: 2, 7: 1, 8: 6 },
  amendment: null,
  isFinal: true,
};

const browser = await chromium.launch();
const context = await browser.newContext({
  colorScheme: "dark",
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
await page.route("**/api/replay/18241006?**", async (route) => {
  const body = [
    `event: replay-meta\ndata: ${JSON.stringify({
      fixtureId: "18241006",
      sourceMode: "historicalReplay",
      source: "txline",
      network: "devnet",
      totalRecords: 1,
      remainingRecords: 1,
      targetDurationMs: 1,
      speed: 4,
    })}\n\n`,
    `id: 18241006:962\nevent: replay-score\ndata: ${JSON.stringify(finalRecord)}\n\n`,
    `event: replay-end\ndata: ${JSON.stringify({ fixtureId: "18241006", lastSequence: 962 })}\n\n`,
  ].join("");
  await route.fulfill({
    status: 200,
    contentType: "text/event-stream; charset=utf-8",
    headers: { "Cache-Control": "no-store" },
    body,
  });
});

async function ready() {
  await page.evaluate(() => document.fonts.ready);
}

await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
await ready();
await page.locator(".hero").screenshot({
  path: path.join(outputDirectory, "proofplay-home.jpg"),
  type: "jpeg",
  quality: 90,
});

await page.goto(`${baseUrl}/demo`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /use this fixture/i }).click();
await page.getByRole("button", { name: /use this condition/i }).click();
await page.getByRole("button", { name: /join yes with 1 demo token/i }).click();
await page.getByRole("button", { name: /start replay/i }).click();
const settlement = page.getByRole("button", { name: /inspect settlement/i });
await settlement.waitFor({ state: "visible" });
await settlement.click();
await page.getByLabel(/verified on solana devnet/i).waitFor();
await ready();
await page.locator(".demo-stage.demo-settlement").screenshot({
  path: path.join(outputDirectory, "proofplay-judge-demo.jpg"),
  type: "jpeg",
  quality: 90,
});

await page.goto(`${baseUrl}/receipt`, { waitUntil: "networkidle" });
await page.getByLabel("Settlement verified").waitFor();
await ready();
await page.locator(".receipt-shell").screenshot({
  path: path.join(outputDirectory, "proofplay-proof-receipt.jpg"),
  type: "jpeg",
  quality: 90,
});

await context.close();
await browser.close();
console.log(`Submission screenshots saved to ${outputDirectory}.`);
