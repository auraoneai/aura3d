export interface V5CullingResult {
  readonly total: number;
  readonly visible: number;
  readonly culled: number;
}

export function runV5FrustumCulling(total: number, visibilityRatio = 0.62): V5CullingResult {
  const visible = Math.round(total * visibilityRatio);
  return { total, visible, culled: total - visible };
}
