import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const workspaceRoots = ["apps", "packages", "scripts"];
const packageFiles = [];

for (const root of workspaceRoots) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      packageFiles.push(path.join(root, entry.name, "package.json"));
    }
  }
}

const packages = new Map();

for (const packageFile of packageFiles) {
  const manifest = JSON.parse(await readFile(packageFile, "utf8"));

  if (!manifest.name) {
    throw new Error(`${packageFile} does not declare a package name`);
  }

  if (packages.has(manifest.name)) {
    throw new Error(`Duplicate workspace package name: ${manifest.name}`);
  }

  packages.set(manifest.name, {
    file: packageFile,
    dependencies: {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    },
  });
}

const workspaceNames = new Set(packages.keys());
const graph = new Map(
  [...packages.entries()].map(([name, manifest]) => [
    name,
    Object.keys(manifest.dependencies).filter((dependency) =>
      workspaceNames.has(dependency),
    ),
  ]),
);

const visited = new Set();
const active = new Set();

function visit(name, trail = []) {
  if (active.has(name)) {
    throw new Error(
      `Workspace dependency cycle: ${[...trail, name].join(" -> ")}`,
    );
  }

  if (visited.has(name)) {
    return;
  }

  active.add(name);
  for (const dependency of graph.get(name) ?? []) {
    visit(dependency, [...trail, name]);
  }
  active.delete(name);
  visited.add(name);
}

for (const name of graph.keys()) {
  visit(name);
}

console.log(
  `Workspace graph is acyclic (${packages.size} packages, ${
    [...graph.values()].flat().length
  } internal dependencies).`,
);

process.exitCode = 0;
