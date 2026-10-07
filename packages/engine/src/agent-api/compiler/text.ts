// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraRendererRuntimeObservation, ProductionRuntimePrimitiveEntry } from "../nodes/types.js";
import { describeSdfTextPixelBacking } from "@aura3d/rendering";

/**
 * G1 SDF text observation (muse3jsparity-PRD): per-resource fail-closed gate
 * (`describeSdfTextPixelBacking`) ANDed across mounted SDF resources. Layout
 * alone never backs pixels; lastOpacity is the live LOD x occlusion proof.
 */
export function createProductionTextObservation(
  entries: readonly ProductionRuntimePrimitiveEntry[]
): NonNullable<AuraRendererRuntimeObservation["text"]> {
  const sdf = entries.flatMap((entry) => entry.resources.filter((resource) => resource.sdfText !== null));
  if (sdf.length === 0) {
    return {
      sdfTexts: 0,
      textPixelBacked: false,
      quadCount: 0,
      lastOpacity: 1,
      reason: "no SDF text nodes mounted"
    };
  }
  const gates = sdf.map((resource) => describeSdfTextPixelBacking({
    atlasUploaded: resource.textureStatus === "textured" && resource.texturedMaterial !== null,
    quadsSubmitted: resource.sdfText!.lastSubmitted,
    quadCount: resource.sdfText!.quadCount
  }));
  const backed = gates.filter((gate) => gate.textPixelBacked).length;
  const quadCount = sdf.reduce((total, resource) => total + (resource.sdfText?.quadCount ?? 0), 0);
  const lastOpacity = Math.min(...sdf.map((resource) => resource.sdfText?.lastOpacity ?? 1));
  return {
    sdfTexts: sdf.length,
    textPixelBacked: backed === sdf.length,
    quadCount,
    lastOpacity,
    reason: backed === sdf.length
      ? `${backed}/${sdf.length} SDF quad sets sampled from uploaded label textures (${quadCount} quads)`
      : `${backed}/${sdf.length} SDF quad sets backed: ${gates.filter((gate) => !gate.textPixelBacked).map((gate) => gate.reason).join("; ")}`
  };
}
