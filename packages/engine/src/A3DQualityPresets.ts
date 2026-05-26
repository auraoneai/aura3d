import { resolveA3DAppQualityPreset } from "@aura3d/apps";
import type { A3DAppQualityPreset, A3DAppQualitySettings } from "@aura3d/apps";

export { resolveA3DAppQualityPreset };
export type { A3DAppQualityPreset, A3DAppQualitySettings };

export const A3D_QUALITY_PRESETS: readonly A3DAppQualityPreset[] = ["draft", "balanced", "production"] as const;

export const A3D_QUALITY_PRESET_SETTINGS: Readonly<Record<A3DAppQualityPreset, A3DAppQualitySettings>> = {
  draft: resolveA3DAppQualityPreset("draft"),
  balanced: resolveA3DAppQualityPreset("balanced"),
  production: resolveA3DAppQualityPreset("production")
};
