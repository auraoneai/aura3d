import { resolveG3DAppQualityPreset } from "@galileo3d/apps";
import type { G3DAppQualityPreset, G3DAppQualitySettings } from "@galileo3d/apps";

export { resolveG3DAppQualityPreset };
export type { G3DAppQualityPreset, G3DAppQualitySettings };

export const G3D_QUALITY_PRESETS: readonly G3DAppQualityPreset[] = ["draft", "balanced", "production"] as const;

export const G3D_QUALITY_PRESET_SETTINGS: Readonly<Record<G3DAppQualityPreset, G3DAppQualitySettings>> = {
  draft: resolveG3DAppQualityPreset("draft"),
  balanced: resolveG3DAppQualityPreset("balanced"),
  production: resolveG3DAppQualityPreset("production")
};
