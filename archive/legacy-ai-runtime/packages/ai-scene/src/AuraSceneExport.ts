import { redactSecretsFromObject } from "./AuraSecretRedactor.js";
import type { AuraCompiledSceneRuntime } from "./AuraSceneCompiler.js";
import type { AuraSceneDiagnostics } from "./AuraSceneDiagnostics.js";
import type { AuraSceneIR } from "./AuraSceneIR.js";

export interface AuraSceneExportBundle {
  readonly schema: "aura3d.ai-scene.export-bundle";
  readonly generatedAt: string;
  readonly scene: AuraSceneIR;
  readonly diagnostics: AuraSceneDiagnostics;
  readonly screenshot?: {
    readonly mimeType: "image/png";
    readonly dataUrl: string;
  };
}

export function exportAuraSceneBundle(input: { readonly runtime?: AuraCompiledSceneRuntime; readonly scene?: AuraSceneIR; readonly diagnostics?: AuraSceneDiagnostics; readonly screenshotDataUrl?: string }): AuraSceneExportBundle {
  const scene = input.scene ?? input.runtime?.ir;
  const diagnostics = input.diagnostics ?? input.runtime?.diagnostics;
  if (!scene || !diagnostics) throw new Error("exportAuraSceneBundle requires either a compiled runtime or explicit scene and diagnostics.");
  const bundle: AuraSceneExportBundle = {
    schema: "aura3d.ai-scene.export-bundle",
    generatedAt: new Date().toISOString(),
    scene,
    diagnostics,
    ...(input.screenshotDataUrl ? { screenshot: { mimeType: "image/png", dataUrl: input.screenshotDataUrl } } : {})
  };
  return redactSecretsFromObject(bundle);
}
