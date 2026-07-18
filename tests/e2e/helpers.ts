import type { Page } from "@playwright/test";

export const finalRecord = {
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
    participant1: { goals: 1, yellowCards: 0, redCards: 0, corners: 1 },
    participant2: { goals: 2, yellowCards: 0, redCards: 0, corners: 6 },
  },
  stats: { "1": 1, "2": 2, "7": 1, "8": 6 },
  amendment: null,
  isFinal: true,
};

export async function mockGoldenReplay(page: Page) {
  await page.route("**/api/replay/18241006?**", async (route) => {
    const events = [
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
      body: events,
    });
  });
}

export async function tabTo(page: Page, name: RegExp, limit = 80) {
  for (let attempt = 0; attempt < limit; attempt += 1) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => {
      const element = document.activeElement;
      return `${element?.getAttribute("aria-label") ?? ""} ${element?.textContent ?? ""}`.trim();
    });
    if (name.test(label)) return;
  }
  throw new Error(`Could not reach ${name} with the Tab key.`);
}
