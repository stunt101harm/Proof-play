import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ffmpeg = process.env.FFMPEG_PATH;
if (!ffmpeg) throw new Error("FFMPEG_PATH is required to assemble the demo.");

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:3000";
const outputDirectory = path.resolve("../outputs");
const workingDirectory = path.resolve("../work/proofplay-demo-media");
await mkdir(outputDirectory, { recursive: true });
await mkdir(workingDirectory, { recursive: true });

const segments = [
  {
    title: "Problem and promise",
    narration:
      "Sports prediction platforms normally ask users to trust both the result feed and the operator that releases payouts. ProofPlay replaces that trust with inspectable rules and evidence. Fans build a condition in plain language, a Solana program escrows dedicated devnet demo tokens, and TxLINE supplies both the sports data and the cryptographic proof used to settle the result.",
  },
  {
    title: "TxLINE fixture and product data",
    narration:
      "The wallet-free Judge Demo starts with a covered TxLINE fixture. ProofPlay uses the fixture snapshot for discovery, consensus odds for context, live server-sent events for match updates, and historical scores for a deterministic replay when no match is live. One typed adapter normalizes every response and keeps both TxLINE credentials on the server.",
  },
  {
    title: "Deterministic condition compiler",
    narration:
      "This two-leg question says that Participant Two wins and total corners are at most seven. The creator writes no code. ProofPlay compiles the readable blocks into ordered TxLINE stat keys, an exact validate stat V3 strategy, and a canonical condition commitment. The pool stores that commitment before anyone joins, so neither the creator nor the keeper can change the rules later.",
  },
  {
    title: "Escrow and deterministic replay",
    narration:
      "Participation is explicitly simulated for judging, so no wallet, fee, or token is required. The linked real devnet flow holds a conventional demo SPL token in a program-derived vault. The replay then feeds ordered TxLINE history through the same reducer as live SSE. In-play values remain provisional, and settlement stays locked until the game finalised record with status one hundred is observed.",
  },
  {
    title: "TxLINE proof, Solana CPI, and payout",
    narration:
      "At finality, the permissionless keeper requests the compact V3 proof for the exact fixture, final record, and stat-key order. The ProofPlay program derives the TxLINE daily root and invokes TxLINE validate stat V3 by cross-program invocation. This real devnet transaction returned true, recorded YES as the winner, and rejected attempts to alter the fixture, period, strategy, root, stat value, or Merkle proof. The receipt connects the readable question to the final TxLINE values, program accounts, settlement transaction, and deterministic payout. Four YES tokens shared the complete ten-token vault, leaving no operator fee and no rounding dust.",
  },
  {
    title: "Closing pitch",
    narration:
      "ProofPlay combines TxLINE feeds and cryptographic validation with deterministic condition compilation and Solana escrow. The public repository includes the program, keeper, tests, security runbooks, and secret-free devnet evidence. Create a prediction anyone can understand, and settle it with proof nobody has to trust.",
  },
];

const audioFiles = [];
const durations = [];
for (const [index, segment] of segments.entries()) {
  const audio = path.join(workingDirectory, `segment-${index + 1}.aiff`);
  execFileSync("say", [
    "-v",
    process.env.DEMO_VOICE ?? "Samantha",
    "-r",
    process.env.DEMO_VOICE_RATE ?? "170",
    "-o",
    audio,
    segment.narration,
  ]);
  const info = execFileSync("afinfo", [audio], { encoding: "utf8" });
  const duration = Number(info.match(/estimated duration:\s+([\d.]+)/)?.[1]);
  if (!Number.isFinite(duration)) throw new Error(`Cannot read ${audio}.`);
  audioFiles.push(audio);
  durations.push(duration * 1_000);
}

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
  recordVideo: { dir: workingDirectory, size: { width: 1440, height: 900 } },
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
    body,
  });
});

async function wait(fraction, duration) {
  await page.waitForTimeout(Math.max(250, Math.round(fraction * duration)));
}

async function title(label) {
  await page.evaluate((value) => {
    document.querySelector("#proofplay-video-title")?.remove();
    const element = document.createElement("div");
    element.id = "proofplay-video-title";
    element.textContent = value;
    Object.assign(element.style, {
      position: "fixed",
      zIndex: "9999",
      right: "24px",
      bottom: "24px",
      padding: "12px 18px",
      border: "1px solid rgba(118, 239, 189, 0.45)",
      borderRadius: "999px",
      background: "rgba(2, 15, 10, 0.92)",
      color: "#76efbd",
      font: "700 14px ui-monospace, SFMono-Regular, Menlo, monospace",
      letterSpacing: "0.04em",
      boxShadow: "0 12px 36px rgba(0, 0, 0, 0.32)",
    });
    document.body.append(element);
  }, label);
}

await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
await title(segments[0].title);
await wait(1, durations[0]);

await page.goto(`${baseUrl}/demo`, { waitUntil: "networkidle" });
await title(segments[1].title);
await wait(0.45, durations[1]);
await page.getByRole("button", { name: /use this fixture/i }).click();
await title(segments[1].title);
await wait(0.55, durations[1]);

await page.getByRole("button", { name: /use this condition/i }).waitFor();
await title(segments[2].title);
await wait(0.25, durations[2]);
await page.getByText("How this settles", { exact: true }).click();
await wait(0.5, durations[2]);
await page.getByRole("button", { name: /use this condition/i }).click();
await title(segments[2].title);
await wait(0.25, durations[2]);

await title(segments[3].title);
await wait(0.3, durations[3]);
await page.getByRole("button", { name: /join yes with 1 demo token/i }).click();
await title(segments[3].title);
await wait(0.2, durations[3]);
await page.getByRole("button", { name: /start replay/i }).click();
const settlement = page.getByRole("button", { name: /inspect settlement/i });
await settlement.waitFor({ state: "visible" });
await wait(0.3, durations[3]);
await settlement.click();
await page.getByLabel(/verified on solana devnet/i).waitFor();
await title(segments[3].title);
await wait(0.2, durations[3]);

await title(segments[4].title);
await wait(0.45, durations[4]);
await page
  .getByRole("link", { name: /open the complete proof receipt/i })
  .click();
await page.getByLabel("Settlement verified").waitFor();
await title(segments[4].title);
await wait(0.55, durations[4]);

await title(segments[5].title);
await page.locator(".receipt-identifiers").scrollIntoViewIfNeeded();
await wait(0.45, durations[5]);
await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
await title("ProofPlay · prediction pools that settle with proof");
await wait(0.55, durations[5]);

const video = page.video();
await context.close();
const screenVideo = path.join(workingDirectory, "proofplay-screen.webm");
await video.saveAs(screenVideo);
await browser.close();

const concatFile = path.join(workingDirectory, "narration-concat.txt");
await writeFile(
  concatFile,
  audioFiles
    .map((file) => `file '${file.replaceAll("'", "'\\''")}'`)
    .join("\n"),
);
const narration = path.join(workingDirectory, "proofplay-narration.m4a");
execFileSync(
  ffmpeg,
  [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatFile,
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    narration,
  ],
  { stdio: "inherit" },
);

const finalVideo = path.join(outputDirectory, "ProofPlay-hackathon-demo.mp4");
execFileSync(
  ffmpeg,
  [
    "-y",
    "-i",
    screenVideo,
    "-i",
    narration,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "21",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    finalVideo,
  ],
  { stdio: "inherit" },
);

await writeFile(
  path.join(outputDirectory, "ProofPlay-hackathon-demo-transcript.md"),
  `# ProofPlay hackathon demo transcript\n\n${segments
    .map((segment) => `## ${segment.title}\n\n${segment.narration}`)
    .join("\n\n")}\n`,
);
console.log(`Demo video saved to ${finalVideo}.`);
