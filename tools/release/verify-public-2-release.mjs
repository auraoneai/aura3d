#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const outputPath = resolve(root, "release-artifacts", "2.0-npm-registry-verification.json");
const expectedVersion = "2.0.0";
const expectedPackageCount = 29;

function readManifest(directory) {
  return JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8"));
}

const publicPackages = [readManifest(root)];
for (const entry of readdirSync(resolve(root, "packages"))) {
  const directory = resolve(root, "packages", entry);
  try {
    const manifest = readManifest(directory);
    if (manifest.private !== true) publicPackages.push(manifest);
  } catch {
    // Directories without a package manifest are not publishable packages.
  }
}
publicPackages.sort((left, right) => left.name.localeCompare(right.name));

if (publicPackages.length !== expectedPackageCount) {
  throw new Error(`Expected ${expectedPackageCount} public packages, found ${publicPackages.length}.`);
}

const deprecationMessage = "Aura3D 2.0.0 supersedes this release. Upgrade to 2.0.0 and follow the migration guide: https://aura3d.auraone.ai/docs/migration-2.0.html";
const results = [];

for (const manifest of publicPackages) {
  if (manifest.version !== expectedVersion) {
    throw new Error(`${manifest.name} source version is ${manifest.version}, expected ${expectedVersion}.`);
  }

  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(manifest.name)}`;
  const response = await fetch(registryUrl, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${manifest.name} registry read failed: HTTP ${response.status}.`);
  const metadata = await response.json();
  const current = metadata.versions?.[expectedVersion];
  if (!current) throw new Error(`${manifest.name}@${expectedVersion} is absent from npm.`);

  // npm's full registry document can retain stale version keys after an
  // unpublish. A live version has a matching publication timestamp.
  const pre2Versions = Object.keys(metadata.versions ?? {}).filter(
    (version) => Number(version.split(".")[0]) < 2 && typeof metadata.time?.[version] === "string",
  );
  const missingDeprecations = pre2Versions.filter((version) => metadata.versions[version].deprecated !== deprecationMessage);
  if (missingDeprecations.length > 0) {
    throw new Error(`${manifest.name} has ${missingDeprecations.length} pre-2.0 versions without the exact deprecation notice: ${missingDeprecations.join(", ")}`);
  }
  if (current.deprecated) throw new Error(`${manifest.name}@${expectedVersion} is incorrectly deprecated.`);
  if (metadata["dist-tags"]?.latest !== expectedVersion) {
    throw new Error(`${manifest.name} latest is ${metadata["dist-tags"]?.latest}, expected ${expectedVersion}.`);
  }

  results.push({
    name: manifest.name,
    version: expectedVersion,
    latest: metadata["dist-tags"].latest,
    integrity: current.dist?.integrity ?? null,
    shasum: current.dist?.shasum ?? null,
    tarball: current.dist?.tarball ?? null,
    currentDeprecated: false,
    pre2VersionCount: pre2Versions.length,
    pre2DeprecatedCount: pre2Versions.length,
  });
}

const receipt = {
  schema: "aura3d.npm-public-release-verification/1.0",
  generatedAt: new Date().toISOString(),
  command: "node tools/release/verify-public-2-release.mjs",
  cwd: ".",
  registry: "https://registry.npmjs.org",
  expectedVersion,
  expectedPackageCount,
  packageCount: results.length,
  pre2VersionCount: results.reduce((sum, result) => sum + result.pre2VersionCount, 0),
  pre2DeprecatedCount: results.reduce((sum, result) => sum + result.pre2DeprecatedCount, 0),
  deprecationMessage,
  status: "pass",
  packages: results,
};

writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`Verified ${receipt.packageCount}/${expectedPackageCount} npm packages at ${expectedVersion}.`);
console.log(`Verified ${receipt.pre2DeprecatedCount}/${receipt.pre2VersionCount} pre-2.0 versions deprecated.`);
console.log(`Receipt: ${outputPath}`);
