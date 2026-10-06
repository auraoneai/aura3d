// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AnimationPose } from "@aura3d/animation";
import type { AuraRuntimeNodeBounds, RuntimeNodeBoundsInput } from "../RuntimeNodeHandle";
import type { AuraRuntimeNodeImportedAssetEvidence, AuraRuntimeNodeImportedAssetDiagnostic, AuraRuntimeNodeImportedAssetEvidenceInput } from "../nodes/types.js";
import { animation } from "../nodes/animation.js";
import { calculateRuntimeNodeBounds } from "../RuntimeNodeHandle";
import { translation } from "../compiler/sceneMath.js";

export function createRuntimeNodeImportedAssetEvidence(
  input: AuraRuntimeNodeImportedAssetEvidenceInput
): AuraRuntimeNodeImportedAssetEvidence {
  const clips = [...new Set(input.clips ?? [])];
  const bones = [...new Set(input.skeletonBones ?? [])];
  const morphTargets = [...new Set(input.morphTargets ?? [])];
  const diagnostics: AuraRuntimeNodeImportedAssetDiagnostic[] = [];
  for (const clip of input.requiredClips ?? []) {
    if (!clips.includes(clip)) diagnostics.push({ severity: "error", code: "missing-clip", message: `Missing imported animation clip "${clip}".` });
  }
  for (const bone of input.requiredBones ?? []) {
    if (!bones.includes(bone)) diagnostics.push({ severity: "error", code: "missing-bone", message: `Missing imported skeleton bone "${bone}".` });
  }
  for (const morph of input.requiredMorphTargets ?? []) {
    if (!morphTargets.includes(morph)) diagnostics.push({ severity: "error", code: "missing-morph", message: `Missing imported morph target "${morph}".` });
  }
  if (bones.length === 0) diagnostics.push({ severity: "warning", code: "missing-skeleton", message: "Imported asset evidence has no skeleton bones." });
  if (!input.skinningPalette) diagnostics.push({ severity: "warning", code: "missing-skinning-palette", message: "Imported asset evidence has no skinning palette." });
  if ((input.renderItemCount ?? 0) < 1) diagnostics.push({ severity: "warning", code: "missing-render-items", message: "Imported asset evidence has no render items." });
  return {
    kind: "aura-runtime-node-imported-asset-evidence",
    assetId: input.assetId,
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    ...(bones.length > 0 ? { skeleton: { boneCount: bones.length, boneNames: bones } } : {}),
    clips,
    ...(input.activeClip ? { activeClip: input.activeClip } : {}),
    ...(input.skinningPalette ? {
      skinningPalette: {
        jointCount: input.skinningPalette.jointCount,
        matrixCount: input.skinningPalette.matrixCount ?? input.skinningPalette.jointCount,
        updated: input.skinningPalette.updated ?? true
      }
    } : {}),
    morphTargets,
    activeMorphTargets: { ...(input.activeMorphTargets ?? {}) },
    missingMorphTargets: [...(input.missingMorphTargets ?? [])],
    ...(input.bounds ? { bounds: isRuntimeNodeEvidenceBounds(input.bounds) ? input.bounds : calculateRuntimeNodeBounds(input.bounds) } : {}),
    renderItemCount: input.renderItemCount ?? 0,
    skinnedRenderItemCount: input.skinnedRenderItemCount ?? 0,
    morphRenderItemCount: input.morphRenderItemCount ?? 0,
    ...(input.lastMaterialTracksApplied !== undefined ? { lastMaterialTracksApplied: input.lastMaterialTracksApplied } : {}),
    ...(input.lastLightTracksApplied !== undefined ? { lastLightTracksApplied: input.lastLightTracksApplied } : {}),
    ...(input.lastFootPlantingGroundedFeet !== undefined ? { lastFootPlantingGroundedFeet: input.lastFootPlantingGroundedFeet } : {}),
    ...(input.lastFootPlantingTargetError !== undefined ? { lastFootPlantingTargetError: input.lastFootPlantingTargetError } : {}),
    ...(input.lastFootPlantingHipOffset !== undefined ? { lastFootPlantingHipOffset: input.lastFootPlantingHipOffset } : {}),
    ...(input.lastFootPlantingMissingLegs !== undefined ? { lastFootPlantingMissingLegs: [...input.lastFootPlantingMissingLegs] } : {}),
    ...(input.lastFootPlantingDeformation !== undefined ? { lastFootPlantingDeformation: input.lastFootPlantingDeformation.map(leg => ({ ...leg })) } : {}),
    ...(input.lastFootPlantingSurfaces !== undefined ? { lastFootPlantingSurfaces: input.lastFootPlantingSurfaces.map(point => ({ ...point, worldPosition: [...point.worldPosition] as const })) } : {}),
    ...(input.lastFootPlantingFeet !== undefined ? { lastFootPlantingFeet: input.lastFootPlantingFeet.map(foot => ({ ...foot, worldPosition: [...foot.worldPosition] as const })) } : {}),
    ...(input.footPlantingConfigured !== undefined ? { footPlantingConfigured: input.footPlantingConfigured } : {}),
    diagnostics
  };
}

export function cloneRuntimeAnimationPose(pose: AnimationPose): AnimationPose {
  return {
    bones: Object.fromEntries(
      Object.entries(pose.bones ?? {}).map(([bone, transform]) => [
        bone,
        {
          position: transform.position ? { ...transform.position } : undefined,
          rotation: transform.rotation ? { ...transform.rotation } : undefined,
          scale: transform.scale ? { ...transform.scale } : undefined
        }
      ])
    ),
    morphTargets: pose.morphTargets ? { ...pose.morphTargets } : undefined,
    rootMotion: pose.rootMotion
      ? {
          translation: pose.rootMotion.translation ? { ...pose.rootMotion.translation } : undefined,
          rotation: pose.rootMotion.rotation ? { ...pose.rootMotion.rotation } : undefined
        }
      : undefined,
    metadata: pose.metadata ? { ...pose.metadata } : undefined
  };
}

export function cloneRuntimeImportedAssetEvidence(evidence: AuraRuntimeNodeImportedAssetEvidence): AuraRuntimeNodeImportedAssetEvidence {
  return {
    ...evidence,
    skeleton: evidence.skeleton
      ? { boneCount: evidence.skeleton.boneCount, boneNames: [...evidence.skeleton.boneNames] }
      : undefined,
    clips: [...evidence.clips],
    skinningPalette: evidence.skinningPalette ? { ...evidence.skinningPalette } : undefined,
    morphTargets: [...evidence.morphTargets],
    activeMorphTargets: { ...evidence.activeMorphTargets },
    missingMorphTargets: [...evidence.missingMorphTargets],
    bounds: evidence.bounds
      ? {
          ...evidence.bounds,
          center: [...evidence.bounds.center],
          size: [...evidence.bounds.size],
          min: [...evidence.bounds.min],
          max: [...evidence.bounds.max]
        }
      : undefined,
    diagnostics: evidence.diagnostics.map((diagnostic) => ({ ...diagnostic }))
  };
}

function isRuntimeNodeEvidenceBounds(value: AuraRuntimeNodeBounds | RuntimeNodeBoundsInput): value is AuraRuntimeNodeBounds {
  return (value as AuraRuntimeNodeBounds).kind === "aura-runtime-node-bounds";
}

export function sanitizeRuntimeMorphWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 0;
  return Math.max(0, Math.min(1, weight));
}
