import { SettlementKeeper, type KeeperRunOptions } from "./core";
import { createKeeperDependencies } from "./runtime";

type CliOptions = KeeperRunOptions & {
  watch: boolean;
  intervalMs: number;
};

function readPositiveInteger(value: string | undefined, label: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function parseKeeperArgs(args: string[]): CliOptions {
  const options: CliOptions = { watch: false, intervalMs: 30_000 };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--once") options.watch = false;
    else if (argument === "--watch") options.watch = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--pool") options.poolAddress = args[++index];
    else if (argument === "--interval-ms") {
      options.intervalMs = readPositiveInteger(args[++index], "--interval-ms");
    } else if (argument === "--max-attempts") {
      options.maxAttempts = readPositiveInteger(
        args[++index],
        "--max-attempts",
      );
    } else {
      throw new Error(`Unknown keeper argument: ${argument}`);
    }
  }
  return options;
}

async function main() {
  const options = parseKeeperArgs(process.argv.slice(2));
  const dependencies = await createKeeperDependencies();
  const keeper = new SettlementKeeper(dependencies, (event) => {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  });
  if (!options.watch) {
    const results = await keeper.run(options);
    process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
    if (results.some((result) => result.status === "terminalFailure")) {
      process.exitCode = 1;
    }
    return;
  }

  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());
  await keeper.watch({
    intervalMs: options.intervalMs,
    signal: controller.signal,
    runOptions: options,
  });
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${JSON.stringify({ event: "keeper.fatal", message: message.slice(0, 240) })}\n`,
  );
  process.exitCode = 1;
});

export * from "./core";
