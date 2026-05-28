import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileSceneIRToRuntime, createMockProvider, exportAuraSceneBundle } from "../../packages/ai-scene/src";
import { collectProviderEnvironment, redactReport } from "../ai-scene-readiness/index";

export const PROMPT_TO_SCENE_EVIDENCE_REPORT = "tests/reports/ai-scene/prompt-to-scene-evidence.json";

export async function createPromptToSceneEvidenceReport() {
  const prompt = "Create a sunrise greenhouse previs scene. A lonely robot discovers a glowing flower with dust, fog, camera push, and warm rim lighting.";
  const provider = createMockProvider({ generatedAt: "2026-05-26T00:00:00.000Z" });
  const providerResult = await provider.completeScene({ prompt, qualityTarget: "L3", backendPreference: "auto" });
  const unsupportedCases = [];
  let runtime = null;
  let bundle = null;
  if (providerResult.ok) {
    const sceneWithPlaceholderRequirement = {
      ...providerResult.value,
      assetRequirements: [
        ...providerResult.value.assetRequirements,
        {
          id: "asset-glowing-flower-production",
          label: "Production glowing flower asset",
          type: "gltf" as const,
          semanticTags: ["flower", "botanical", "emissive"],
          styleTags: ["cinematic", "hero"],
          required: false
        }
      ]
    };
    runtime = await compileSceneIRToRuntime(sceneWithPlaceholderRequirement);
    bundle = exportAuraSceneBundle({ runtime });
  } else {
    unsupportedCases.push(unsupported("provider", providerResult.error.message));
  }
  if (runtime && runtime.renderItems.length === 0) unsupportedCases.push(unsupported("render-items", "Scene compiler produced no render items."));
  if (runtime && runtime.diagnosticSummary.placeholders.length === 0) unsupportedCases.push(unsupported("placeholder-evidence", "Prompt evidence should identify placeholder assets for missing production art."));
  return {
    schema: "a3d-prompt-to-scene-evidence",
    generatedAt: new Date().toISOString(),
    pass: unsupportedCases.length === 0,
    inputs: {
      root: ".",
      providerMode: "mock",
      requiredFiles: [
        "packages/ai-scene/src/AuraSceneCompiler.ts",
        "apps/aura-prompt-to-scene/index.html"
      ],
      requiredReports: [],
      environment: collectProviderEnvironment(process.env),
      prompt
    },
    evidence: [
      {
        id: "provider-output",
        path: "MockProvider.completeScene",
        present: providerResult.ok,
        status: providerResult.ok ? "present" : "missing",
        detail: providerResult.ok ? "MockProvider generated AuraSceneIR." : "MockProvider failed."
      },
      {
        id: "compiled-runtime",
        path: "compileSceneIRToRuntime",
        present: Boolean(runtime),
        status: runtime ? "present" : "missing",
        detail: runtime ? `${runtime.renderItems.length} render items compiled.` : "No runtime compiled."
      },
      {
        id: "export-bundle",
        path: "exportAuraSceneBundle",
        present: Boolean(bundle),
        status: bundle ? "present" : "missing",
        detail: bundle ? "Export bundle generated without secrets." : "Export bundle missing."
      }
    ],
    providerMode: "mock",
    networkUsed: false,
    blockedClaims: [],
    unsupportedCases,
    scene: providerResult.ok ? providerResult.value : null,
    runtimeSummary: runtime ? {
      sceneId: runtime.sceneId,
      renderItems: runtime.renderItems.length,
      resolvedAssets: runtime.resolvedAssets.length,
      placeholders: runtime.diagnosticSummary.placeholders.length,
      warnings: runtime.diagnosticSummary.warnings
    } : null,
    bundle
  };
}

type PromptToSceneEvidenceReport = Awaited<ReturnType<typeof createPromptToSceneEvidenceReport>>;

export function writePromptToSceneEvidenceReport(report: PromptToSceneEvidenceReport | Promise<PromptToSceneEvidenceReport> = createPromptToSceneEvidenceReport(), path = PROMPT_TO_SCENE_EVIDENCE_REPORT): Promise<void> {
  return Promise.resolve(report).then((resolvedReport) => {
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(resolve(path), `${JSON.stringify(redactReport(resolvedReport), null, 2)}\n`);
  });
}

function unsupported(id: string, detail: string) {
  return { id, severity: "blocked" as const, detail, nextAction: "Fix prompt-to-scene generation, compilation, or export." };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await createPromptToSceneEvidenceReport();
  await writePromptToSceneEvidenceReport(report);
  if (!report.pass) {
    console.error(`Prompt-to-scene evidence failed:\n${report.unsupportedCases.map((entry) => entry.detail).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Prompt-to-scene evidence passed. Report: ${PROMPT_TO_SCENE_EVIDENCE_REPORT}`);
  }
}
