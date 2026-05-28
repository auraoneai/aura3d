import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyScenePatch, createMockProvider, diffAuraSceneIR, type AuraSceneDiffEntry } from "../../packages/ai-scene/src";
import { collectProviderEnvironment, redactReport } from "../ai-scene-readiness/index";

export const SCENE_DIFF_AUDIT_REPORT = "tests/reports/ai-scene/scene-diff-audit.json";

export async function createSceneDiffAuditReport() {
  const provider = createMockProvider({ generatedAt: "2026-05-26T00:00:00.000Z" });
  const sceneResult = await provider.completeScene({ prompt: "Create a robot and flower previs scene.", qualityTarget: "L3" });
  const unsupportedCases = [];
  let patchResult = null;
  let applied = null;
  let diffs: AuraSceneDiffEntry[] = [];
  if (sceneResult.ok) {
    patchResult = await provider.completePatch({ prompt: "Make the hero smaller for a wider shot.", scene: sceneResult.value });
    if (patchResult.ok) {
      applied = applyScenePatch(sceneResult.value, patchResult.value);
      diffs = [...diffAuraSceneIR(sceneResult.value, applied.scene)];
    } else {
      unsupportedCases.push(unsupported("patch-provider", patchResult.error.message));
    }
  } else {
    unsupportedCases.push(unsupported("scene-provider", sceneResult.error.message));
  }
  if (sceneResult.ok && diffs.length === 0) unsupportedCases.push(unsupported("diff-empty", "Scene patch produced no observable diff."));
  return {
    schema: "a3d-scene-diff-audit",
    generatedAt: new Date().toISOString(),
    pass: unsupportedCases.length === 0,
    inputs: {
      root: ".",
      providerMode: "mock",
      requiredFiles: [
        "packages/ai-scene/src/AuraScenePatch.ts",
        "packages/ai-scene/src/AuraSceneDiff.ts"
      ],
      requiredReports: [],
      environment: collectProviderEnvironment(process.env)
    },
    evidence: [
      {
        id: "scene-diff",
        path: "diffAuraSceneIR",
        present: diffs.length > 0,
        status: diffs.length > 0 ? "present" : "missing",
        detail: `${diffs.length} diff entries generated.`
      }
    ],
    providerMode: "mock",
    networkUsed: false,
    blockedClaims: [],
    unsupportedCases,
    patch: patchResult?.ok ? patchResult.value : null,
    applied,
    diffs
  };
}

type SceneDiffAuditReport = Awaited<ReturnType<typeof createSceneDiffAuditReport>>;

export function writeSceneDiffAuditReport(report: SceneDiffAuditReport | Promise<SceneDiffAuditReport> = createSceneDiffAuditReport(), path = SCENE_DIFF_AUDIT_REPORT): Promise<void> {
  return Promise.resolve(report).then((resolvedReport) => {
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(resolve(path), `${JSON.stringify(redactReport(resolvedReport), null, 2)}\n`);
  });
}

function unsupported(id: string, detail: string) {
  return { id, severity: "blocked" as const, detail, nextAction: "Fix AI scene patching or diff generation." };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await createSceneDiffAuditReport();
  await writeSceneDiffAuditReport(report);
  if (!report.pass) {
    console.error(`Scene diff audit failed:\n${report.unsupportedCases.map((entry) => entry.detail).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Scene diff audit passed. Report: ${SCENE_DIFF_AUDIT_REPORT}`);
  }
}
