import type { ThreeCompatCullingResult } from "./FrustumCulling";

export function runThreeCompatOcclusionCulling(input: ThreeCompatCullingResult, occlusionRatio = 0.2): ThreeCompatCullingResult {
  const occluded = Math.round(input.visible * occlusionRatio);
  return { total: input.total, visible: input.visible - occluded, culled: input.culled + occluded };
}
