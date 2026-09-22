/**
 * Copy-boundary test for Aura Clash public-facing copy.
 *
 * Aura Clash is a development showcase, not a flagship/release-ready game.
 * This test guards index.html and TitleScreen.ts against maturity claims
 * (flagship, mature, production-ready, release-ready, complete/finished game)
 * that would misrepresent the route's status.
 *
 * Run: node tests/copy-boundary.test.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "index.html",
  "src/ui/TitleScreen.ts",
];

const forbiddenPatterns = [
  /\bflagship\b/i,
  /\bmature\b/i,
  /\bproduction[- ]ready\b/i,
  /\brelease[- ]ready\b/i,
  /\bcomplete game\b/i,
  /\bfinished game\b/i,
  /\bpremium\b/i,
  /\bcinematic\b/i,
];

let failures = 0;
for (const file of files) {
  const path = join(root, file);
  const content = readFileSync(path, "utf-8");
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      console.error(`FAIL: ${file} contains forbidden maturity claim matching ${pattern}`);
      failures += 1;
    }
  }
  // Positive assertion: the development-showcase framing must be present.
  if (!/development showcase/i.test(content)) {
    console.error(`FAIL: ${file} is missing the required "development showcase" framing`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\n${failures} copy-boundary violation(s) found.`);
  process.exit(1);
}
console.log("PASS: copy-boundary — no maturity claims, development-showcase framing present.");
