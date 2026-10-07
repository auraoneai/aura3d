// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraColor, AuraEnvironmentMapPreset, AuraEnvironmentNode, AuraVec3 } from "./types.js";
import type { AuraEnvironmentOptions } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { environmentMapPresets, environments } from "./environments.composite.js";

// ---------- PRD-02 §7 — environment sources (CCR-02-2 additions) ----------

export type AuraEnvironmentPresetName = "neutral" | "studio" | "outdoor" | "sunset" | "night" | "indoor";

export interface AuraEnvironmentBackgroundOptions {
  /** Draw the environment behind the scene. Default: true for preset/hdri/capture, false for neutral and legacy aliases. */
  readonly visible?: boolean;
  /** 0 = sharp; 1 = roughest mip. Default 0. */
  readonly blurriness?: number;
  /** Multiplier on background radiance only. Default 1. */
  readonly intensity?: number;
  /** Radians; defaults to the environment rotation. */
  readonly rotation?: number;
}

/**
 * CCR-02-2 (pending merge into the index.ts types section): until it lands,
 * `AuraEnvironmentNodeV2` carries the additive fields and widened
 * `environment` union. The C-36 environment handler reads this type.
 * Builders below cast the literal into the frozen `AuraEnvironmentNode`;
 * the runtime object keeps the V2 fields verbatim.
 */
export interface AuraEnvironmentNodeV2 extends Omit<AuraEnvironmentNode, "environment"> {
  readonly environment:
    | AuraEnvironmentNode["environment"]
    | "preset" | "neutral" | "none" | "capture";
  readonly preset?: AuraEnvironmentPresetName;
  readonly diffuseIntensity?: number;
  readonly specularIntensity?: number;
  readonly background?: boolean | AuraEnvironmentBackgroundOptions;
  readonly capture?: {
    readonly position?: AuraVec3;
    readonly resolution?: 64 | 128 | 256;
    readonly update?: "once" | "on-demand" | { readonly everyNFrames: number };
    readonly include?: "sky-only" | "all";
  };
}

export interface AuraEnvironmentOptionsV2 {
  readonly name?: string;
  /** Scales diffuse and specular IBL. Default 1. */
  readonly intensity?: number;
  /** Default = intensity. */
  readonly diffuseIntensity?: number;
  /** Default = intensity. */
  readonly specularIntensity?: number;
  /** Radians about +Y. */
  readonly rotation?: number;
  readonly background?: boolean | AuraEnvironmentBackgroundOptions;
  /** Legacy tint; multiplies radiance. Deprecated for presets. */
  readonly color?: AuraColor;
}

function envV2<T extends AuraEnvironmentNodeV2>(node: T): AuraNodeBuilder<AuraEnvironmentNode> {
  // The frozen AuraEnvironmentNode type does not know the V2 members yet
  // (CCR-02-2); the emitted object keeps them verbatim for the C-36 handler.
  return new AuraNodeBuilder<AuraEnvironmentNode>(node as unknown as AuraEnvironmentNode);
}

export const prd02EnvironmentBuilders = {
  /** Real prebaked HDRI preset (§6.2); background on by default. */
  preset: (name: AuraEnvironmentPresetName, options: AuraEnvironmentOptionsV2 = {}): AuraNodeBuilder<AuraEnvironmentNode> => envV2({
    kind: "environment",
    environment: "preset",
    preset: name,
    name: options.name ?? `${name} ibl environment`,
    intensity: options.intensity ?? 1,
    ...(options.diffuseIntensity !== undefined ? { diffuseIntensity: options.diffuseIntensity } : {}),
    ...(options.specularIntensity !== undefined ? { specularIntensity: options.specularIntensity } : {}),
    ...(options.rotation !== undefined ? { rotation: options.rotation } : {}),
    ...(options.background !== undefined ? { background: options.background } : { background: true }),
    ...(options.color ? { color: options.color } : {})
  }),
  /** Code-generated RoomEnvironment probe; the implicit default (background off). */
  neutral: (options: AuraEnvironmentOptionsV2 = {}): AuraNodeBuilder<AuraEnvironmentNode> => envV2({
    kind: "environment",
    environment: "neutral",
    name: options.name ?? "neutral room environment",
    intensity: options.intensity ?? 1,
    ...(options.diffuseIntensity !== undefined ? { diffuseIntensity: options.diffuseIntensity } : {}),
    ...(options.specularIntensity !== undefined ? { specularIntensity: options.specularIntensity } : {}),
    ...(options.rotation !== undefined ? { rotation: options.rotation } : {}),
    background: options.background ?? false,
    ...(options.color ? { color: options.color } : {})
  }),
  /** Explicit zero-IBL opt-out (stylized/unlit scenes). */
  none: (options: { readonly name?: string } = {}): AuraNodeBuilder<AuraEnvironmentNode> => envV2({
    kind: "environment",
    environment: "none",
    name: options.name ?? "no environment",
    intensity: 0,
    background: false
  }),
  /** Capture scene content (C-21 sky / biome sky) into the environment probe. */
  capture: (options: AuraEnvironmentOptionsV2 & {
    readonly position?: AuraVec3;
    readonly resolution?: 64 | 128 | 256;
    readonly update?: "once" | "on-demand" | { readonly everyNFrames: number };
    readonly include?: "sky-only" | "all";
  } = {}): AuraNodeBuilder<AuraEnvironmentNode> => envV2({
    kind: "environment",
    environment: "capture",
    name: options.name ?? "captured environment",
    intensity: options.intensity ?? 1,
    ...(options.diffuseIntensity !== undefined ? { diffuseIntensity: options.diffuseIntensity } : {}),
    ...(options.specularIntensity !== undefined ? { specularIntensity: options.specularIntensity } : {}),
    ...(options.rotation !== undefined ? { rotation: options.rotation } : {}),
    ...(options.background !== undefined ? { background: options.background } : { background: true }),
    ...(options.color ? { color: options.color } : {}),
    capture: {
      ...(options.position ? { position: options.position } : {}),
      ...(options.resolution !== undefined ? { resolution: options.resolution } : {}),
      ...(options.update !== undefined ? { update: options.update } : {}),
      include: options.include ?? "sky-only"
    }
  }),
  /** User HDRI with the extended options (background on by default). */
  hdri: (options: AuraEnvironmentOptionsV2 & {
    readonly texture: AuraAssetRef<"texture">;
    readonly reflectionTexture?: AuraAssetRef<"texture">;
  }): AuraNodeBuilder<AuraEnvironmentNode> => envV2({
    kind: "environment",
    environment: "hdri",
    name: options.name ?? "hdri ibl environment",
    intensity: options.intensity ?? 1,
    texture: options.texture,
    ...(options.reflectionTexture ? { reflectionTexture: options.reflectionTexture } : {}),
    ...(options.diffuseIntensity !== undefined ? { diffuseIntensity: options.diffuseIntensity } : {}),
    ...(options.specularIntensity !== undefined ? { specularIntensity: options.specularIntensity } : {}),
    ...(options.rotation !== undefined ? { rotation: options.rotation } : {}),
    ...(options.background !== undefined ? { background: options.background } : { background: true }),
    ...(options.color ? { color: options.color } : {})
  })
} as const;

const legacyAlias = (preset: AuraEnvironmentPresetName, label: string) =>
  (options: AuraEnvironmentOptionsV2 = {}): AuraNodeBuilder<AuraEnvironmentNode> => envV2({
    kind: "environment",
    environment: "preset",
    preset,
    name: options.name ?? label,
    intensity: options.intensity ?? 1,
    ...(options.color ? { color: options.color } : {}),
    // §11: legacy aliases keep the clear colour — background off.
    background: options.background ?? false
  });

export const envSourceBuilders = {
  // §11 aliases: emit preset nodes; flag-off resolves via the additive
  // "preset" → "studio" key in the legacy preset table.
  studio: legacyAlias("studio", "studio ibl environment"),
  materialLab: legacyAlias("studio", "material lab ibl environment"),
  productHero: legacyAlias("studio", "product hero ibl environment"),
  nightCinematic: legacyAlias("night", "night cinematic ibl environment"),
  metalStudio: legacyAlias("studio", "metal studio ibl environment"),
  glassStudio: legacyAlias("studio", "glass studio ibl environment"),
  presets: (): readonly AuraEnvironmentMapPreset[] => environmentMapPresets,
  forMaterial: (materialClass: "metal" | "glass" | "product" | "studio"): AuraNodeBuilder<AuraEnvironmentNode> => {
    if (materialClass === "metal") return environments.metalStudio();
    if (materialClass === "glass") return environments.glassStudio();
    if (materialClass === "product") return environments.productHero();
    return environments.studio();
  },
  // PRD-02 environment sources: preset/neutral/none/capture + extended hdri
  // (supersedes the B3 `hdri` above — options are a superset, §11).
  ...prd02EnvironmentBuilders
};
