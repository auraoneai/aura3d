import type { AuraResolvedAsset } from "./AuraAssetResolver.js";
import type { AuraSceneIR, AuraSceneObject } from "./AuraSceneIR.js";

export interface AuraWorldNode {
  readonly id: string;
  readonly label: string;
  readonly kind: AuraSceneObject["kind"];
  readonly assetUri?: string;
  readonly placeholder?: string;
  readonly materialId?: string;
  readonly semanticTags: readonly string[];
}

export interface AuraWorldPlan {
  readonly sceneId: string;
  readonly environmentId: string;
  readonly nodes: readonly AuraWorldNode[];
  readonly diagnostics: readonly string[];
}

export function buildAuraWorldPlan(scene: AuraSceneIR, resolvedAssets: readonly AuraResolvedAsset[]): AuraWorldPlan {
  const assetByRequirement = new Map(resolvedAssets.map((asset) => [asset.requirement.id, asset]));
  return {
    sceneId: scene.sceneId,
    environmentId: scene.environment.id,
    nodes: scene.objects.map((object) => {
      const asset = object.assetRequirementId ? assetByRequirement.get(object.assetRequirementId) : undefined;
      return {
        id: object.id,
        label: object.label,
        kind: object.kind,
        ...(asset?.matched ? { assetUri: asset.matched.uri } : {}),
        ...(asset?.placeholder ? { placeholder: asset.placeholder.id } : {}),
        ...(object.materialId ? { materialId: object.materialId } : {}),
        semanticTags: object.semanticTags
      };
    }),
    diagnostics: resolvedAssets.flatMap((asset) => asset.diagnostics)
  };
}
