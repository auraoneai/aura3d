// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraEnvironmentMapPreset, AuraEnvironmentNode, AuraEnvironmentOptions } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { environmentMapPresets, environments } from "./environments.composite.js";

export const envSourceBuilders = {
  studio: (options: AuraEnvironmentOptions = {}): AuraNodeBuilder<AuraEnvironmentNode> => new AuraNodeBuilder({
    kind: "environment",
    environment: "studio",
    name: options.name ?? "studio ibl environment",
    intensity: options.intensity ?? 1.15,
    color: options.color ?? "#f8fbff"
  }),
  materialLab: (options: AuraEnvironmentOptions = {}): AuraNodeBuilder<AuraEnvironmentNode> => new AuraNodeBuilder({
    kind: "environment",
    environment: "material-lab",
    name: options.name ?? "material lab ibl environment",
    intensity: options.intensity ?? 1.35,
    color: options.color ?? "#ffffff"
  }),
  productHero: (options: AuraEnvironmentOptions = {}): AuraNodeBuilder<AuraEnvironmentNode> => new AuraNodeBuilder({
    kind: "environment",
    environment: "product-hero",
    name: options.name ?? "product hero ibl environment",
    intensity: options.intensity ?? 1.2,
    color: options.color ?? "#eef6ff"
  }),
  nightCinematic: (options: AuraEnvironmentOptions = {}): AuraNodeBuilder<AuraEnvironmentNode> => new AuraNodeBuilder({
    kind: "environment",
    environment: "night-cinematic",
    name: options.name ?? "night cinematic ibl environment",
    intensity: options.intensity ?? 0.78,
    color: options.color ?? "#78d7ff"
  }),
  metalStudio: (options: AuraEnvironmentOptions = {}): AuraNodeBuilder<AuraEnvironmentNode> => new AuraNodeBuilder({
    kind: "environment",
    environment: "metal-studio",
    name: options.name ?? "metal studio ibl environment",
    intensity: options.intensity ?? 1.42,
    color: options.color ?? "#f8fbff"
  }),
  glassStudio: (options: AuraEnvironmentOptions = {}): AuraNodeBuilder<AuraEnvironmentNode> => new AuraNodeBuilder({
    kind: "environment",
    environment: "glass-studio",
    name: options.name ?? "glass studio ibl environment",
    intensity: options.intensity ?? 1.28,
    color: options.color ?? "#d8f7ff"
  }),
  presets: (): readonly AuraEnvironmentMapPreset[] => environmentMapPresets,
  forMaterial: (materialClass: "metal" | "glass" | "product" | "studio"): AuraNodeBuilder<AuraEnvironmentNode> => {
    if (materialClass === "metal") return environments.metalStudio();
    if (materialClass === "glass") return environments.glassStudio();
    if (materialClass === "product") return environments.productHero();
    return environments.studio();
  },
  /**
   * B3 root HDRI environment (muse3jsparity-PRD). The `.hdr` asset resolves
   * post-mount: first frames render the honest studio procedural fallback,
   * then the HDR→cubemap→GGX-prefilter→BRDF-LUT chain swaps in and
   * `iblPixelBacked` flips true in diagnostics. Fetch/parse failures keep the
   * fallback and warn — never a black scene, never a silent swap.
   */
  hdri: (options: AuraEnvironmentOptions & { texture: AuraAssetRef<"texture"> }): AuraNodeBuilder<AuraEnvironmentNode> => new AuraNodeBuilder({
    kind: "environment",
    environment: "hdri",
    name: options.name ?? "hdri ibl environment",
    intensity: options.intensity ?? 1,
    texture: options.texture,
    ...(options.reflectionTexture ? { reflectionTexture: options.reflectionTexture } : {}),
    ...(options.color ? { color: options.color } : {}),
    ...(options.rotation !== undefined ? { rotation: options.rotation } : {})
  }),
};
