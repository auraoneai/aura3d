import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { heroCharacter } from "../../packages/create-aura3d/templates/animation-studio/src/character.js";
import { createAnimationProfile, validateAnimationStudioCharacter } from "../../packages/create-aura3d/templates/animation-studio/src/profile.js";

export interface AnimationStudioReadinessReport {
  readonly schema: "animation-studio-readiness/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly characterId: string;
  readonly profileSchema: string;
  readonly checks: ReadonlyArray<{ readonly id: string; readonly ok: boolean; readonly detail: string }>;
  readonly blockers: readonly string[];
}

const defaultOut = "tests/reports/animation-studio/readiness.json";

export function createAnimationStudioReadinessReport(generatedAt = new Date().toISOString()): AnimationStudioReadinessReport {
  const readiness = validateAnimationStudioCharacter(heroCharacter);
  const profile = createAnimationProfile(heroCharacter);
  const checks = [
    { id: "character-readiness", ok: readiness.ok, detail: readiness.ok ? "all required locomotion clips mapped" : readiness.errors.join("; ") },
    { id: "profile-schema", ok: profile.schema === "aura-animation-profile/v1", detail: profile.schema },
    { id: "state-graph", ok: profile.stateGraph.states.length === 3, detail: profile.stateGraph.states.join(" -> ") },
    {
      id: "blend-tree-monotonic",
      ok: profile.blendTree.children.every((c, i, a) => i === 0 || c.threshold > a[i - 1]!.threshold),
      detail: profile.blendTree.children.map((c) => `${c.clip}@${c.threshold}`).join(", ")
    },
    { id: "ik-chains", ok: profile.ikChains.length > 0, detail: profile.ikChains.map((c) => c.id).join(", ") }
  ];
  const blockers = checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`);
  return {
    schema: "animation-studio-readiness/v1",
    ok: blockers.length === 0,
    generatedAt,
    characterId: heroCharacter.id,
    profileSchema: profile.schema,
    checks,
    blockers
  };
}

export function writeAnimationStudioReadinessReport(root: string, report: AnimationStudioReadinessReport, out = defaultOut): void {
  const abs = join(root, out);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(report, null, 2)}\n`);
}

const currentScript = process.argv[1] ? relative(process.cwd(), process.argv[1]) : "";
if (currentScript.endsWith("tools/animation-studio-readiness/index.ts") || currentScript.endsWith("tools/animation-studio-readiness/index.js")) {
  const report = createAnimationStudioReadinessReport();
  writeAnimationStudioReadinessReport(process.cwd(), report);
  if (!report.ok) {
    console.error(`animation-studio readiness FAILED:\n${report.blockers.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`animation-studio readiness OK (${report.checks.length} checks): ${report.characterId}`);
  }
}
