import type { AuraCompiledSceneRuntime } from "@aura3d/ai-scene";

export interface AuraAISceneEvidence {
  readonly schema: "aura3d.ai-scene.evidence";
  readonly generatedAt: string;
  readonly sceneId: string;
  readonly backend: string;
  readonly renderItemCount: number;
  readonly diagnostics: AuraCompiledSceneRuntime["diagnostics"];
  readonly screenshot?: {
    readonly mimeType: "image/png";
    readonly dataUrl: string;
  };
}

export function captureAISceneEvidence(input: {
  readonly runtime: AuraCompiledSceneRuntime;
  readonly screenshotDataUrl?: string;
}): AuraAISceneEvidence {
  return {
    schema: "aura3d.ai-scene.evidence",
    generatedAt: new Date().toISOString(),
    sceneId: input.runtime.sceneId,
    backend: input.runtime.diagnostics.backend,
    renderItemCount: input.runtime.renderItems.length,
    diagnostics: input.runtime.diagnostics,
    ...(input.screenshotDataUrl ? { screenshot: { mimeType: "image/png", dataUrl: input.screenshotDataUrl } } : {})
  };
}
