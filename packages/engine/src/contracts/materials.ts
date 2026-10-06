/**
 * C-15 — material overrides and material diagnostics (engine side, CONTRACTS.md).
 * Provider: PRD 04. Flag: A3D_QR_MATERIALS.
 */

import type { AuraColor, AuraAssetRef, AuraRuntimeNodeHandle } from "../agent-api/index";

// AuraMaterialSpec additions (PR 0a; owner tags in JSDoc):
//   blend?: AuraBlendMode (C-04, PRD 01); depthWrite?: boolean (PRD 01); ior?: number (PRD 01, reaches F0)
//   specularIntensity?: number; specularColor?: AuraColor; specularIntensityMap?, specularColorMap?: AuraAssetRef<"texture">
//   dispersion?: number; transmissionMap?, thicknessMap?: AuraAssetRef<"texture">
//   alphaMode?: "opaque" | "mask" | "blend"; alphaCutoff?: number; alphaToCoverage?: boolean; doubleSided?: boolean; unlit?: boolean
//   sampling?: AuraTextureSampling (C-12); slotSampling?: Partial<Record<AuraMaterialTextureSlot, AuraTextureSampling>>
//   practical?: boolean (PRD 10: emissive practical light scale)
export type AuraMaterialTextureSlot =
  | "baseColor" | "normal" | "metallicRoughness" | "occlusion" | "emissive"
  | "clearcoat" | "clearcoatRoughness" | "clearcoatNormal"
  | "sheenColor" | "sheenRoughness" | "specularIntensity" | "specularColor"
  | "transmission" | "thickness" | "iridescence" | "iridescenceThickness" | "anisotropy";

export interface AuraModelMaterialOverride {
  readonly target?: string | RegExp | readonly (string | RegExp)[];
  readonly color?: AuraColor; readonly colorMode?: "multiply" | "replace"; readonly replaceTextures?: boolean;
  readonly roughness?: number; readonly metallic?: number; readonly emissive?: AuraColor; readonly emissiveIntensity?: number;
  readonly clearcoat?: number; readonly clearcoatRoughness?: number; readonly envMapIntensity?: number; readonly opacity?: number;
}
// AuraModelOptions additions: materialOverrides?: readonly AuraModelMaterialOverride[]; variant?: string
export interface AuraResolvedMaterialInfo { readonly name: string; readonly featureKey: string; readonly baseColorFactor: readonly [number, number, number, number]; readonly enabledMaps: readonly string[]; readonly extensions: readonly string[]; readonly lightsEvaluated: "uniform-16" | "clustered"; readonly warnings: readonly string[]; }
export interface AuraModelMaterialHandle {
  materialNames(): readonly string[];
  materialVariants(): readonly string[];
  setMaterialVariant(name: string | null): void;
  setMaterialOverrides(o: readonly AuraModelMaterialOverride[]): void;   // idempotent, re-applied from the authored snapshot
  inspectMaterials(): readonly AuraResolvedMaterialInfo[];
}
// AuraRuntimeNodeHandle.materials?: AuraModelMaterialHandle   (via C-37 extension, model nodes only)
export interface AuraRendererMaterialOptions { readonly materialStrictness?: "warn" | "strict"; readonly materialModel?: "legacy" | "physical-r185"; readonly transmission?: "auto" | "env" | "off"; readonly alphaToCoverage?: boolean; readonly debugView?: "baseColor" | "normal" | "roughness" | "metallic" | "clearcoat" | "clearcoatRoughness" | "clearcoatRoughnessEffective" | "sheen" | "F0" | "tangent" | "anisotropyDirection"; }
export interface AuraMaterialDiagnostics { readonly programs: number; readonly programCompileMs: number; readonly transmissionTargetActive: boolean; readonly lightsDroppedByMaterial: number; readonly paths: { readonly materialModel: string; readonly transmission: string; readonly ktx2: string; readonly tangents: string }; readonly textureBytes: number; readonly textureBudgetBytes: number; readonly downscaledTextures: number; readonly issues: readonly { readonly code: string; readonly material: string; readonly message: string }[]; }

/**
 * PR 0a stub: `materialOverrides` lowers to the existing `setTint`
 * (TypedGLBActor.ts:179) for `color` only — the override seam carries the colour
 * request; `inspectMaterials` returns names and `featureKey: "legacy"`.
 */
export class StubModelMaterialHandle implements AuraModelMaterialHandle {
  private overrides: readonly AuraModelMaterialOverride[] = [];
  private variant: string | null = null;

  constructor(private readonly handle: AuraRuntimeNodeHandle | undefined, private readonly names: readonly string[] = []) {}

  materialNames(): readonly string[] { return this.names; }
  materialVariants(): readonly string[] { return []; }
  setMaterialVariant(name: string | null): void { this.variant = name; }
  setMaterialOverrides(o: readonly AuraModelMaterialOverride[]): void { this.overrides = o; }
  inspectMaterials(): readonly AuraResolvedMaterialInfo[] {
    return this.names.map((name) => ({
      name,
      featureKey: "legacy",
      baseColorFactor: [1, 1, 1, 1] as const,
      enabledMaps: [],
      extensions: [],
      lightsEvaluated: "uniform-16" as const,
      warnings: this.overrides.length > 0 || this.variant !== null ? ["STUB_MATERIAL_HANDLE"] : []
    }));
  }
}
