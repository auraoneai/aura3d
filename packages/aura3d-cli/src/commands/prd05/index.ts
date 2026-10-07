/**
 * C-39 lane-05 command registrations (PRD-05 §7.1, §14 Phase 0).
 *
 * Phase 0 implements `assets admit` and `assets review` for real; the other
 * verbs are registered now so the surface and usage text exist, and return a
 * clear "lands in Phase N" until their phases land.
 */

import { registerCliCommand } from "../../contracts/commands.js";
import type { AuraCliAssetRole } from "../../asset-core-types.js";
import { admitAsset } from "./admit.js";
import { optimizeAssetsVerb } from "./optimize.js";
import { reviewAsset } from "./review.js";

function readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function readNumber(argv: readonly string[], name: string): number | undefined {
  const value = readFlag(argv, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected ${name} <number>, got "${value}".`);
  return parsed;
}

function readAxes(argv: readonly string[]): Record<string, number> | undefined {
  const value = readFlag(argv, "--axes");
  if (value === undefined) return undefined;
  const axes: Record<string, number> = {};
  for (const pair of value.split(",")) {
    const [key, raw] = pair.split("=").map((part) => part.trim());
    const parsed = Number(raw);
    if (!key || !Number.isFinite(parsed)) throw new Error(`--axes expects k=v pairs (got "${pair}").`);
    axes[key] = parsed;
  }
  return axes;
}

registerCliCommand({
  name: "assets admit",
  owner: "prd05",
  summary: "Admit an asset to a quality tier through the §6.4 admission gates.",
  usage: "aura3d assets admit <id> --quality prototype|candidate|release [--role <role>]",
  run: async (argv, io) => {
    const id = argv[0];
    const quality = readFlag(argv, "--quality") ?? "release";
    if (!id || id.startsWith("--")) {
      io.stderr("Usage: aura3d assets admit <id> --quality prototype|candidate|release");
      return 2;
    }
    if (quality !== "prototype" && quality !== "candidate" && quality !== "release") {
      io.stderr(`Unsupported --quality value "${quality}". Use prototype, candidate, or release.`);
      return 2;
    }
    const result = admitAsset({ projectDir: io.cwd, assetId: id, quality, role: readFlag(argv, "--role") as AuraCliAssetRole | undefined });
    for (const check of result.checks) io.stdout(`  ${check.gate} ${check.verdict} — ${check.message}`);
    if (result.ok) {
      io.stdout(`${id}: admitted at quality "${result.quality}".`);
      return 0;
    }
    for (const failure of result.failures) io.stderr(`${id}: ${failure}`);
    io.stderr(`${id}: admission rejected (recorded on the entry).`);
    return 1;
  },
});

registerCliCommand({
  name: "assets review",
  owner: "prd05",
  summary: "Append a look-dev review (C-32 judge identity) to an asset.",
  usage: "aura3d assets review <id> --judge human|vision-model --judge-id <id> --score N --axes k=v,... --notes \"...\" [--verdict accept|reject]",
  run: async (argv, io) => {
    const id = argv[0];
    const judge = readFlag(argv, "--judge");
    if (!id || id.startsWith("--") || (judge !== "human" && judge !== "vision-model")) {
      io.stderr("Usage: aura3d assets review <id> --judge human|vision-model --judge-id <id> --score N --axes k=v,... --notes \"...\"");
      return 2;
    }
    const result = reviewAsset({
      projectDir: io.cwd,
      assetId: id,
      judge,
      judgeId: readFlag(argv, "--judge-id") ?? "anonymous",
      reviewer: readFlag(argv, "--reviewer") ?? readFlag(argv, "--judge-id") ?? "anonymous",
      score: readNumber(argv, "--score"),
      axes: readAxes(argv),
      notes: readFlag(argv, "--notes") ?? "",
      verdict: (() => { const v = readFlag(argv, "--verdict"); return v === "accept" || v === "reject" ? v : undefined; })(),
    });
    if (result.ok) io.stdout(result.message);
    else io.stderr(result.message);
    return result.ok ? 0 : 1;
  },
});

function phaseStub(name: string, phase: string, summary: string, usage: string): void {
  registerCliCommand({
    name,
    owner: "prd05",
    summary,
    usage,
    run: async (_argv, io) => {
      io.stderr(`${name}: lands in PRD-05 ${phase}; the verb is registered now so scripts can detect it.`);
      return 1;
    },
  });
}

registerCliCommand({
  name: "assets optimize",
  owner: "prd05",
  summary: "Optimize assets through the §6.3 step pipeline (tools/asset-optimize).",
  usage: "aura3d assets optimize <id...> [--profile <id>] [--geometry meshopt|draco|none] [--dry-run] [--allow-local-small] [--ktx <path>] [--report <file>] [--out-dir <dir>] [--no-manifest]",
  run: async (argv, io) =>
    optimizeAssetsVerb({ projectDir: io.cwd, argv, stdout: io.stdout, stderr: io.stderr }),
});
phaseStub("assets lookdev", "Phase 4 (apps/asset-lookdev)", "Dispatch the look-dev capture workflow for assets.", "aura3d assets lookdev <id...> [--group <route>]");
phaseStub("assets budget", "Phase 2 (budget measurement)", "Report per-tier asset budgets (lands in Phase 2).", "aura3d assets budget [--route apps/<app>] [--tier low|medium|high|ultra] [--json]");
phaseStub("assets library", "Phase 5 (curated library)", "List/add/sync the curated asset library (lands in Phase 5).", "aura3d assets library list|add|sync");
phaseStub("assets prune", "Phase 6 (manifest hygiene)", "Prune stale/orphaned manifest entries (lands in Phase 6).", "aura3d assets prune [--dry-run]");

export {};
