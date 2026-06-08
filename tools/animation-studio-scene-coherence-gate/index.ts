/**
 * animation-studio-scene-coherence-gate — CI gate for a generated/edited EpisodeDocument
 * Loads a document JSON and fails (exit 1) if it is not coherent: characters or
 * props off the walkable set, cameras far from the action, uncovered shots, etc.
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.base.json tools/animation-studio-scene-coherence-gate/index.ts <document.json> [--out report.json]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateEpisodeDocument } from "../../packages/create-aura3d/templates/animation-studio/src/animation-episode-validator.js";
import type { EpisodeDocument } from "../../packages/create-aura3d/templates/animation-studio/src/episode-document.js";

function main(): void {
  const args = process.argv.slice(2);
  const docPath = args.find((a) => !a.startsWith("--"));
  if (!docPath) {
    console.error("usage: animation-studio-scene-coherence-gate <document.json> [--out report.json]");
    process.exitCode = 2;
    return;
  }
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;

  const doc = JSON.parse(readFileSync(resolve(docPath), "utf8")) as EpisodeDocument;
  const validation = validateEpisodeDocument(doc);

  const report = {
    kind: "animation-studio-scene-coherence-gate",
    document: doc.id,
    ok: validation.ok,
    errors: validation.errors,
    warnings: validation.warnings
  };
  if (outPath) writeFileSync(resolve(outPath), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`scene-coherence gate: ${doc.id} → ${validation.ok ? "PASS" : "FAIL"}`);
  for (const e of validation.errors) console.log(`  ERROR: ${e}`);
  for (const w of validation.warnings) console.log(`  warn:  ${w}`);
  process.exitCode = validation.ok ? 0 : 1;
}

main();
