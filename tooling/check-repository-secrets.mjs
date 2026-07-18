import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const trackedFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean);
const scanner = "tooling/check-repository-secrets.mjs";
const binaryExtensions = new Set([
  ".gif",
  ".ico",
  ".jpg",
  ".jpeg",
  ".png",
  ".pdf",
  ".woff",
  ".woff2",
]);
const forbidden = [
  {
    label: "private-key PEM block",
    pattern: new RegExp(
      ["-----BEGIN ", "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"].join(""),
    ),
  },
  {
    label: "GitHub access token",
    pattern: new RegExp(["\\bgh", "[pousr]_[A-Za-z0-9]{30,}\\b"].join("")),
  },
  {
    label: "live Stripe-style secret",
    pattern: new RegExp(["\\bsk_", "live_[A-Za-z0-9]{20,}\\b"].join("")),
  },
];
const secretAssignments = new Set([
  "HELIUS_API_KEY",
  "KEEPER_WALLET_PATH",
  "PROOF_PLAY_WALLET_PATH",
  "TXLINE_API_TOKEN",
  "TXLINE_GUEST_JWT",
]);
const findings = [];

for (const file of trackedFiles) {
  if (
    file === scanner ||
    binaryExtensions.has(path.extname(file).toLowerCase())
  ) {
    continue;
  }
  const buffer = readFileSync(file);
  if (buffer.includes(0)) continue;
  const contents = buffer.toString("utf8");
  for (const candidate of forbidden) {
    if (candidate.pattern.test(contents))
      findings.push(`${file}: ${candidate.label}`);
  }

  const base = path.basename(file);
  if (base === ".env" || base.startsWith(".env.")) {
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match || !secretAssignments.has(match[1])) continue;
      const value = match[2].replace(/^['"]|['"]$/g, "").trim();
      if (value) findings.push(`${file}: non-empty ${match[1]}`);
    }
  }

  if (/keypair|credentials/i.test(base)) {
    try {
      const parsed = JSON.parse(contents);
      if (
        Array.isArray(parsed) &&
        parsed.length === 64 &&
        parsed.every(
          (value) => Number.isInteger(value) && value >= 0 && value <= 255,
        )
      ) {
        findings.push(`${file}: Solana keypair byte array`);
      }
      if (
        parsed &&
        typeof parsed === "object" &&
        ["apiToken", "guestJwt", "privateKey"].some(
          (key) => typeof parsed[key] === "string" && parsed[key].trim(),
        )
      ) {
        findings.push(`${file}: credential JSON value`);
      }
    } catch {
      // Non-JSON files are covered by the text patterns above.
    }
  }
}

if (findings.length) {
  throw new Error(`Tracked secret scan failed:\n${findings.join("\n")}`);
}
console.log(`Repository secret scan passed (${trackedFiles.length} files).`);
