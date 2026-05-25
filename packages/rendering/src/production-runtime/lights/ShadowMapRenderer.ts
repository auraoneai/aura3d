import type { Light } from '../scene/Lights';
export interface ShadowMapPlan { readonly lightId: string; readonly resolution: number; readonly bias: number; }
export function createShadowMapPlans(lights: readonly Light[], resolution = 2048): readonly ShadowMapPlan[] {
  return lights.filter((light) => light.castsShadow).map((light) => ({ lightId: light.id, resolution, bias: light.type === 'directional' ? 0.0008 : 0.002 }));
}
