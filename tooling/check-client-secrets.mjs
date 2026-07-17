import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const clientDirectory = path.resolve("apps/web/dist/client");
const forbidden = [
  /TXLINE_GUEST_JWT/,
  /TXLINE_API_TOKEN/,
  /\.txline\/devnet-credentials\.json/,
  /X-Api-Token/i,
  /\bguestJwt\b/,
  /\bapiToken\b/,
];

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

const files = await filesUnder(clientDirectory);
for (const file of files) {
  const contents = await readFile(file, "utf8");
  const finding = forbidden.find((pattern) => pattern.test(contents));
  if (finding) {
    throw new Error(
      `Server-only TxLINE credential marker ${finding} found in ${path.relative(process.cwd(), file)}`,
    );
  }
}

console.log(`Client credential scan passed (${files.length} built files).`);
