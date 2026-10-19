#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const marketingDir = resolve(scriptDir, "..");
const repoRoot = resolve(marketingDir, "..");
const registry = process.argv.includes("--registry");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const canonical = readJson(resolve(repoRoot, "package.json")).version;
const marketingPackage = readJson(resolve(marketingDir, "package.json"));
const html = readFileSync(resolve(marketingDir, "index.html"), "utf8");
const failures = [];
const checks = [];

function check(label, actual, expected) {
  const ok = actual === expected;
  checks.push({ label, actual, expected, ok });
  if (!ok) failures.push(`${label}: expected ${expected}, found ${actual}`);
}

check(
  "marketing dependency @aura3d/engine",
  marketingPackage.dependencies?.["@aura3d/engine"],
  canonical
);

const schemaVersion = html.match(/"softwareVersion"\s*:\s*"([^"]+)"/)?.[1] ?? null;
check("JSON-LD softwareVersion", schemaVersion, canonical);

const claimedVersions = new Set(
  [...html.matchAll(/(?:@aura3d\/[a-z-]+@|create-aura3d@|v|(?:version|live)\s+)(\d+\.\d+\.\d+)/g)]
    .map((match) => match[1])
);
for (const version of claimedVersions) {
  if (version !== canonical) {
    failures.push(`homepage claims ${version}; canonical is ${canonical}`);
  }
}
checks.push({
  label: "homepage version claims",
  actual: [...claimedVersions].join(", ") || "none",
  expected: canonical,
  ok: claimedVersions.size === 0 || [...claimedVersions].every((version) => version === canonical)
});

const scaffoldCommand = html.match(/npx\s+create-aura3d@(\d+\.\d+\.\d+)[^<\n]*/)?.[0] ?? null;
check(
  "homepage scaffold command",
  scaffoldCommand?.match(/@(\d+\.\d+\.\d+)/)?.[1] ?? null,
  canonical
);
if (scaffoldCommand && !scaffoldCommand.includes("--template product-viewer")) {
  failures.push(`homepage scaffold command lost its template: ${scaffoldCommand}`);
}

const showcaseIndex = readFileSync(resolve(repoRoot, "apps/showcase-index/index.html"), "utf8");
const showcaseVersions = new Set(
  [...showcaseIndex.matchAll(/(?:@aura3d\/[a-z-]+@|create-aura3d@|\bv|(?:Playable game|Aura3D)\s*,?\s*)(\d+\.\d+\.\d+)/g)].map(
    (match) => match[1]
  )
);
for (const version of showcaseVersions) {
  if (version !== canonical) failures.push(`showcase index claims ${version}; canonical is ${canonical}`);
}
checks.push({
  label: "showcase index version claims",
  actual: [...showcaseVersions].join(", ") || "none",
  expected: canonical,
  ok: showcaseVersions.size === 0 || [...showcaseVersions].every((version) => version === canonical)
});

if (registry) {
  const npmLatest = (packageName) =>
    execFileSync("npm", ["view", packageName, "dist-tags.latest", "--json"], {
      cwd: repoRoot,
      encoding: "utf8"
    })
      .trim()
      .replace(/^"|"$/g, "");
  for (const packageName of ["@aura3d/engine", "@aura3d/cli", "create-aura3d"]) {
    check(`npm latest ${packageName}`, npmLatest(packageName), canonical);
  }

  let githubTag = null;
  try {
    githubTag = execFileSync(
      "gh",
      ["release", "view", "--repo", "auraoneai/aura3d", "--json", "tagName", "--jq", ".tagName"],
      { cwd: repoRoot, encoding: "utf8" }
    ).trim();
  } catch (error) {
    failures.push(`GitHub latest release could not be read: ${error.message}`);
  }
  if (githubTag !== null) check("GitHub latest release tag", githubTag, `v${canonical}`);
}

for (const entry of checks) {
  console.log(`${entry.ok ? "PASS" : "FAIL"}  ${entry.label}: ${entry.actual}`);
}
if (failures.length > 0) {
  console.error(`\nVersion drift detected (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`\nVersion truth passed: ${canonical}${registry ? " across source, npm, GitHub, and marketing" : ""}.`);
