import type { V5CullingResult } from "./FrustumCulling";

export function runV5OcclusionCulling(input: V5CullingResult, occlusionRatio = 0.2): V5CullingResult {
  const occluded = Math.round(input.visible * occlusionRatio);
  return { total: input.total, visible: input.visible - occluded, culled: input.culled + occluded };
}
