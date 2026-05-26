export interface ThreeCompatCullingResult {
  readonly total: number;
  readonly visible: number;
  readonly culled: number;
}

export function runThreeCompatFrustumCulling(total: number, visibilityRatio = 0.62): ThreeCompatCullingResult {
  const visible = Math.round(total * visibilityRatio);
  return { total, visible, culled: total - visible };
}
