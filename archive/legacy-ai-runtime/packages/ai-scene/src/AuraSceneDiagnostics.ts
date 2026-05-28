import type { AuraResolvedAsset } from "./AuraAssetResolver.js";
import type { AuraSceneIR } from "./AuraSceneIR.js";

export interface AuraSceneDiagnostics {
  readonly schema: "aura3d.ai-scene.diagnostics";
  readonly sceneId: string;
  readonly provider: string;
  readonly model: string;
  readonly backend: string;
  readonly qualityTarget: string;
  readonly resolvedAssets: readonly string[];
  readonly placeholders: readonly string[];
  readonly approximations: readonly string[];
  readonly unresolved: readonly string[];
  readonly warnings: readonly string[];
  readonly exportReady: boolean;
}

export function createAuraSceneDiagnostics(input: {
  readonly scene: AuraSceneIR;
  readonly backend: string;
  readonly resolvedAssets?: readonly AuraResolvedAsset[];
  readonly warnings?: readonly string[];
  readonly approximations?: readonly string[];
}): AuraSceneDiagnostics {
  const resolvedAssets = input.resolvedAssets ?? [];
  const placeholders = resolvedAssets.filter((asset) => asset.placeholder).map((asset) => asset.placeholder?.id ?? asset.requirement.id);
  const unresolved = input.scene.unresolved.map((entry) => `${entry.path}: ${entry.reason}`);
  const warnings = [
    ...(input.warnings ?? []),
    ...resolvedAssets.flatMap((asset) => asset.diagnostics),
    ...input.scene.unresolved.map((entry) => entry.fallback)
  ];
  return {
    schema: "aura3d.ai-scene.diagnostics",
    sceneId: input.scene.sceneId,
    provider: input.scene.provenance.provider,
    model: input.scene.provenance.model,
    backend: input.backend,
    qualityTarget: input.scene.qualityTarget,
    resolvedAssets: resolvedAssets.filter((asset) => asset.matched).map((asset) => asset.matched?.uri ?? asset.requirement.id),
    placeholders,
    approximations: input.approximations ?? [],
    unresolved,
    warnings,
    exportReady: unresolved.length === 0
  };
}
