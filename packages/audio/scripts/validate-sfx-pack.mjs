#!/usr/bin/env node
/**
 * validate-sfx-pack.mjs — PRD-09 §6.9 pack acceptance.
 *
 * Fails when:
 *   - any manifest entry lacks `license`, `sourceUrl`, `author`, `lufs`,
 *     `truePeak`, or either encoding file on disk (Opus .webm + AAC .m4a);
 *   - a route/template cue map declares `provenance: "synth"` outside the
 *     allowlist below (cue maps must reference the admitted pack or a real
 *     asset — synthesized defaults were removed by C-25).
 *
 * Usage: node packages/audio/scripts/validate-sfx-pack.mjs [--pack <dir>]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const packDir = resolve(root, process.argv.includes("--pack") ? process.argv[process.argv.indexOf("--pack") + 1] : "assets/packs/game-sfx-core");
const manifestPath = join(packDir, "manifest.json");

const fail = [];
if (!existsSync(manifestPath)) {
  console.error(`validate-sfx-pack: no manifest at ${manifestPath}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const REQUIRED = ["id", "license", "sourceUrl", "author", "lufs", "truePeak", "encodings"];
for (const [i, entry] of (manifest.entries ?? []).entries()) {
  for (const field of REQUIRED) {
    if (entry[field] === undefined) fail.push(`entry[${i}] ${entry.id ?? "?"}: missing ${field}`);
  }
  for (const fmt of ["opus", "aac"]) {
    const rel = entry.encodings?.[fmt];
    if (rel && !existsSync(join(packDir, rel))) fail.push(`entry ${entry.id}: missing file ${rel}`);
  }
}
if ((manifest.entries ?? []).length === 0) fail.push("manifest has zero entries");

// Route/template cue maps: provenance "synth" must be allowlisted.
const SYNTH_ALLOWLIST = new Set([
  // Route-owned synthesized cues that intentionally generate audio (e.g.
  // WebAudio oscillators for tuning forks) and are not C-25 assets.
]);
const scanRoots = ["apps/", "packages/", "create-aura3d/"].filter((d) => existsSync(join(root, d)));
let cueMaps = [];
try {
  cueMaps = execSync(
    `rg -l 'provenance:\\s*["'\\'']synth["'\\'']' ${scanRoots.join(" ")} --glob '!node_modules' --glob '!dist' --glob '!packages/audio/scripts/validate-sfx-pack.mjs'`,
    { cwd: root, encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean);
} catch {
  // rg exits 1 when nothing matches — that is the desired empty result.
}
for (const file of cueMaps) {
  const rel = file.replace(`${root}/`, "");
  if (!SYNTH_ALLOWLIST.has(rel)) fail.push(`${rel}: provenance "synth" outside the allowlist`);
}

if (fail.length) {
  for (const line of fail) console.error(`validate-sfx-pack: FAIL ${line}`);
  process.exit(1);
}
console.log(`validate-sfx-pack: ${manifest.entries.length} entries OK (${packDir})`);
