import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const publicDirectory = path.resolve("apps/web/public");
const legalPage = await readFile("apps/web/app/legal/page.tsx", "utf8");
const normalizedLegalPage = legalPage.replace(/\s+/g, " ").toLowerCase();
const requiredLegalMarkers = [
  "18+ hackathon prototype",
  "no monetary value",
  "not sponsored, endorsed, or affiliated",
  "does not publish a raw feed",
];
for (const marker of requiredLegalMarkers) {
  if (!normalizedLegalPage.includes(marker.toLowerCase())) {
    throw new Error(`Legal notice is missing required marker: ${marker}`);
  }
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? filesUnder(target) : [target];
      }),
    )
  ).flat();
}

for (const file of await filesUnder(publicDirectory)) {
  const relative = path.relative(publicDirectory, file);
  if (
    /fifa|world[-_ ]?cup[-_ ]?(logo|mark)|official[-_ ]?logo/i.test(relative)
  ) {
    throw new Error(
      `Restricted tournament branding found in public asset: ${relative}`,
    );
  }
  if (/\.(csv|tsv|jsonl?|ndjson)$/i.test(relative)) {
    throw new Error(
      `Potential standalone TxLINE data file found in public assets: ${relative}`,
    );
  }
}

await readFile("THIRD_PARTY_NOTICES.md", "utf8");
console.log(
  "Hackathon legal, branding, attribution, and data-boundary checks passed.",
);
