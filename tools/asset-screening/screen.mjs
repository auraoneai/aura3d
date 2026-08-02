#!/usr/bin/env node
/**
 * `screen-assets`: run the candidate screening pipeline end to end.
 *
 * ## Why a runnable entry point matters
 *
 * The pipeline and its effects were both testable before this existed, and neither was *runnable*. That
 * gap is the whole failure mode in miniature: a capability nobody can invoke does not stop the next
 * developer from re-wording a search query and hoping, which is how three unusable hero vehicles shipped.
 *
 * This command takes an intent, screens real catalog candidates, and retains the report -- including every
 * rejection reason -- under `tests/reports/asset-screening/`.
 *
 * ## Rendered visibility is deliberately unproven here
 *
 * No render probe is injected: that needs a browser and a dev server, and fabricating a rendered verdict
 * from geometry is precisely the conflation that produced a false renderer diagnosis. Roles requiring a
 * readable feature therefore report `unproven` and select nothing unless `--fallback` permits it. Rendered
 * proof comes from `tests/browser/showcase-release-asset-probes.spec.ts` and
 * `tests/browser/vehicle-wheel-visibility.spec.ts`.
 *
 * Usage:
 *   node tools/asset-screening/screen.mjs --intent tools/asset-screening/intents/hero-vehicle.json
 *   node tools/asset-screening/screen.mjs --role prop --style "low poly pine tree" --json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeJsonArtifactAtomically } from "../evidence-freshness/index.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const root = resolve(flag("--root") ?? process.cwd());

// Built output: this is a plain `.mjs` tool and cannot import the TypeScript sources. Run `pnpm build`
// first if these imports fail.
const { screenAssetCandidates, formatScreeningReport } = await import("../../packages/aura3d-cli/dist/asset-screening-pipeline.js");
const { createScreeningEffects, createRetainedRenderProbe } = await import("../../packages/aura3d-cli/dist/asset-screening-effects.js");
const { validateAssetIntent } = await import("../../packages/aura3d-cli/dist/asset-intent.js");

/** Build an intent from a JSON file or from inline flags. */
function readIntent() {
  const path = flag("--intent");
  if (path) return JSON.parse(readFileSync(resolve(root, path), "utf8"));
  const role = flag("--role");
  const style = flag("--style");
  if (!role || !style) {
    console.error("usage: screen.mjs --intent <file.json> | --role <role> --style <text> [--fallback <policy>]");
    process.exit(2);
  }
  return {
    id: `${role}-${style}`.replace(/[^a-z0-9-]+/gi, "-").toLowerCase(),
    role,
    style,
    licensePolicy: flag("--license-policy") ?? "commercial-attribution-allowed",
    ...(flag("--fallback") ? { fallbackPolicy: flag("--fallback") } : {})
  };
}

const intent = readIntent();
const problems = validateAssetIntent(intent);
if (problems.length > 0) {
  console.error(`Intent "${intent.id}" cannot be satisfied as written:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(2);
}

/*
 * `--use-retained-renders` consumes rendered proof that already exists on disk.
 *
 * Off by default: a screening run over fresh catalog candidates has no retained renders for them, so the
 * probe would return nothing and the flag would only add noise. It becomes useful when re-screening assets
 * the browser suite has already probed -- which is how a hero candidate gets from `unproven` to admitted
 * without this tool ever pretending to have rendered anything itself.
 */
const effects = createScreeningEffects({
  projectDir: root,
  ...(flag("--staging") ? { stagingDir: resolve(root, flag("--staging")) } : {}),
  searchLimit: Number(flag("--limit") ?? 10),
  ...(args.includes("--use-retained-renders")
    ? { renderProbe: createRetainedRenderProbe({ projectDir: root }) }
    : {})
});

const report = await screenAssetCandidates({
  intent,
  effects,
  maxCandidatesToPull: Number(flag("--max-pulls") ?? 4),
  stopAtFirstAccepted: !args.includes("--rank-all")
});

const outputPath = resolve(root, "tests/reports/asset-screening", `${intent.id}.json`);
writeJsonArtifactAtomically(outputPath, { ...report, generatedAt: new Date().toISOString() });

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const line of formatScreeningReport(report)) console.log(line);
  console.log(`\nretained ${outputPath.slice(root.length + 1)}`);
}

// A screen that selected nothing is a meaningful non-zero outcome for scripting.
if (!report.selected) process.exitCode = 1;
