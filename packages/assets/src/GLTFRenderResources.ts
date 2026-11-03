import {
  Geometry,
  IndexBuffer,
  InstancedPBRMaterial,
  InstancedUnlitMaterial,
  Material,
  PBRMaterial,
  Sampler,
  SkinnedLitMaterial,
  Texture,
  TextureBinding,
  TexturedPBRMaterial,
  TexturedUnlitMaterial,
  UnlitMaterial,
  VertexBuffer,
  createExternalParityEnvironmentLighting,
  computePerspectiveCameraFrame,
  computeSkinnedMorphTargetEnvelopeBounds,
  type CameraFrameBounds,
  type CameraFrameViewport,
  type CameraLike,
  type CollectedLight,
  type EnvironmentLightingOptions,
  type ForwardShadowMapOptions,
  type PerspectiveCameraFrame,
  type PerspectiveCameraFrameOptions,
  type VertexAttributeDescriptor,
  VertexFormat,
  DEFAULT_PBR_ENVIRONMENT_INTENSITY,
  type MorphTargetDelta,
  type RenderItem,
  type RendererCameraPolicy,
  type RendererInput,
  type RendererPostProcessOptions,
  type RenderDevice,
  type RendererShadowOptions,
  type RenderSource,
  type RenderState,
  type SamplerDescriptor,
  type TextureFormat,
  type TextureMipLevelDescriptor,
  type TexturePixelData,
  type TexturedPBRMaterialOptions,
  type TexturedPBRTextureSlot,
  isTexturedPbrTextureSlotShaderActive,
  DEFAULT_TEXTURED_PBR_SHADER_NAME,
  applyTextureBudget,
  releaseTextureBudget
} from "@aura3d/rendering";
import { Bounds3 as SceneBounds3, multiplyMat4, type Mat4 } from "@aura3d/scene";
import {
  gltfRuntimeMaterialKey,
  gltfImageRequestOptions,
  gltfImageRequestProgress,
  parseGLTFRuntimeMaterialKey,
  type GLTFAsset,
  type GLTFImageAsset,
  type GLTFMaterialAsset,
  type GLTFMaterialVariantMappingAsset,
  type GLTFMeshAsset,
  type GLTFResolvedTextureInfo,
  type GLTFSceneCreateOptions,
  type GLTFTextureAsset
} from "./GLTFLoader";
import type { KTX2BasisTargetFormat, KTX2BasisTextureTranscoderOptions } from "./KTX2BasisTextureTranscoder";
import { generateMikkTSpaceTangents, mikkTSpaceAvailable } from "./MikkTSpaceTangents";
import { decodeImageInBrowser, gltfImageByteLimit, readImageBytes, resolveImageUrl } from "./gltf/ImageDecode";
import { createGLTFTextureResidencySource, gltfTextureFallback, type GLTFTextureFallback, type GLTFTextureResidencyMip } from "./gltf/GLTFTextureResidency.js";
import type { TextureResidencySource } from "./TextureResidencyController.js";
import { mergeAssetRequestOptions, redactAssetMessage, redactAssetUrl, requestIdentityDetails, validateAssetMaxBytes, type AssetLoadRequest } from "./AssetLoader";
import { redactImportCause } from "./ImportPipeline";
import type { GLTFSharedTextureLease } from "./GLTFSharedTextureCache";
import { LoadContext } from "./LoadContext";
import { AssetIntegrityError, AssetPolicyError, AssetSizeError, verifyAssetBytes } from "./LoaderFetch";

export interface DecodedGLTFImage {
  readonly width: number;
  readonly height: number;
  readonly format?: TextureFormat;
  readonly colorSpace?: "srgb" | "linear";
  readonly data?: TexturePixelData;
  readonly mipLevels?: readonly TextureMipLevelDescriptor[];
  readonly source?: TexImageSource;
  readonly fallbackData?: Uint8Array | Uint8ClampedArray;
  readonly fallbackMipLevels?: readonly TextureMipLevelDescriptor[];
}

export interface GLTFImageDecodeContext {
  readonly signal?: AbortSignal;
  readonly request?: Omit<AssetLoadRequest, "url" | "type">;
}

export type GLTFImageDecoder = (image: GLTFImageAsset, imageIndex: number, asset: GLTFAsset, context?: GLTFImageDecodeContext) => DecodedGLTFImage | Promise<DecodedGLTFImage>;

export interface GLTFRenderResourceOptions {
  readonly imageDecoder?: GLTFImageDecoder;
  readonly signal?: AbortSignal;
  readonly request?: Omit<AssetLoadRequest, "url" | "type">;
  /** Retain device-independent mip source metadata for an opted-in app. */
  readonly retainTextureResidencySources?: boolean;
  readonly ktx2BasisTargetFormat?: KTX2BasisTargetFormat;
  readonly ktx2BasisTranscoderOptions?: KTX2BasisTextureTranscoderOptions;
  readonly materialVariant?: GLTFSceneCreateOptions["materialVariant"];
  readonly sceneIndex?: GLTFSceneCreateOptions["sceneIndex"];
  readonly sceneName?: GLTFSceneCreateOptions["sceneName"];
  readonly materialRenderStateOverrides?: readonly GLTFMaterialRenderStateOverride[];
  /**
   * When `true`, a texture that fails to fetch/decode aborts the whole asset load
   * (legacy behavior). When omitted/`false` (default), the loader logs a warning
   * and substitutes a neutral 1x1 texture so the material falls back to its
   * `baseColorFactor` and the rest of the asset still loads.
   */
  readonly failOnMissingTexture?: boolean;
  /**
   * SA-04: shared GPU-texture ownership for skinned clones. When set, decoded
   * `Texture` objects are leased from this cache, so N clones of
   * one GLB decode and upload each image once. `dispose()` on the returned
   * resources releases the lease rather than disposing the textures; the cache
   * frees them when the last lease releases. Only anonymous or explicitly
   * scoped matching request policies may share. Cancellable requests and
   * requests with their own progress callbacks use private textures.
   */
  readonly sharedTextures?: import("./GLTFSharedTextureCache.js").GLTFSharedTextureCache;
  /**
   * Share a single runtime material instance across glTF materials whose definitions are identical
   * apart from their name.
   *
   * Architectural GLBs exported from level editors routinely carry `.001`/`.002` duplicates of the
   * same material: measured on `auraClashDuelStage`, **77 material slots are only 13 distinct
   * definitions**, and on `arenaNeonDowntown`, 131 slots are 14. Because the renderer's static
   * batching keys on material *identity*, those duplicates prevent batching and force one draw call
   * per slot.
   *
   * Deduplication is opt-in and compares the full glTF material definition, so two materials are only
   * merged when every factor, texture reference, and extension matches. A material that differs in any
   * respect keeps its own instance. Names remain individually addressable in `materialLibrary`, so
   * override queries and diagnostics are unaffected; only the underlying instance is shared.
   */
  readonly deduplicateIdenticalMaterials?: boolean;
  /**
   * Optional tangent-generation policy for the decode/load path (C-18). `"legacy"` forces the
   * in-repo triangle-average generator; under `A3D_QR_MATERIALS` any other value (including
   * unset) prefers MikkTSpace when the module is registered (PRD-04 P5-4).
   */
  readonly tangents?: boolean | "auto" | "generate" | "legacy";
  /** Estimated texture bytes admitted during decoding; physical GPU residency is tracked by each backend. */
  readonly textureBudget?: number;
  /**
   * Partition decode-time budget admission by the intended device. This does
   * not allocate GPU textures or reserve native residency. Omit for the
   * historical unscoped admission ledger. The caller must supply the intended
   * device; the production actor does not automatically provide one.
   */
  readonly textureBudgetDevice?: RenderDevice;
  /** Optional max texture dimension applied during resource creation (C-27 policy, PRD-04 P2-11). */
  readonly maxTextureSize?: number;
  /**
   * PRD-05 flag channel: `A3D_QR_ASSETS` state forwarded by the caller. The
   * assets package has no flag resolver of its own; flag-on enables
   * decode-time PNG/JPEG downscaling to `maxTextureSize`. Flag-off is unchanged.
   */
  readonly qrAssets?: boolean;
  /** Optional sampler anisotropy ceiling override (declaration-only seam, C-18). */
  readonly anisotropy?: number;
  /**
   * PRD-04 flag channel: `A3D_QR_MATERIALS` state forwarded by `createTypedGLBActor`. The assets
   * package has no flag resolver of its own; flag-on removes E23's cull override and uses the
   * glTF-spec default material ([1,1,1,1] / metallic 1 / roughness 1); flag-off is unchanged.
   */
  readonly materialsR185?: boolean;
  /**
   * `A3D_QR_MATERIALS_TRANSMISSION` state, forwarded by the caller (P4-3 E22 gate). Combined with
   * `materialsR185` and `transmission` it decides whether unbacked scalar-transmission materials
   * keep their authored factors instead of the legacy opaque-shell rewrite.
   */
  readonly materialsTransmission?: boolean;
  /**
   * Forwarded `renderer.material.transmission` mode (`AuraRendererMaterialOptions.transmission`):
   * `"env"` means real env-refraction transmission is available (PRD-04 P4-3).
   */
  readonly transmission?: "auto" | "env" | "off";
}

export interface GLTFMaterialRenderStateOverride {
  readonly materialName: string | RegExp;
  readonly renderState: Partial<RenderState>;
  readonly reason?: string;
}

export interface GLTFRenderResources {
  readonly scene: ReturnType<GLTFAsset["createScene"]>;
  readonly geometryLibrary: ReadonlyMap<string, Geometry>;
  readonly materialLibrary: ReadonlyMap<string, Material>;
  readonly renderableBindings: readonly GLTFRenderableBinding[];
  readonly materialFidelityDiagnostics: readonly GLTFRenderResourceMaterialFidelityDiagnostic[];
  /** PRD-04 P5: load-time lane issues (`colorspace-conflict`, `tangent-derivative-fallback`). */
  readonly loadIssues: readonly GLTFRenderResourceLoadIssue[];
  readonly morphTargetLibrary: ReadonlyMap<string, readonly MorphTargetDelta[]>;
  readonly textureLibrary: ReadonlyMap<string, Texture>;
  /** Static decoded mips, when requested; GPU residency remains device-local. */
  readonly textureResidencySources?: ReadonlyMap<Texture, TextureResidencySource<GLTFTextureResidencyMip>>;
  /** Source-backed or otherwise unsupported textures that keep ordinary uploads. */
  readonly unmanagedTextureResidency?: ReadonlyMap<Texture, string>;
  readonly bounds: CameraFrameBounds;
  collectMaterialOverrideTargets(query?: GLTFMaterialOverrideQuery): readonly GLTFMaterialOverrideTarget[];
  createCameraFrame(viewport: CameraFrameViewport, options?: PerspectiveCameraFrameOptions): PerspectiveCameraFrame;
  toRenderSource(options?: GLTFRenderSourceOptions): RenderSource;
  toRendererInput(viewport: CameraFrameViewport, options?: GLTFRendererInputOptions): GLTFRendererInput;
  /**
   * PRD-04 P2/R11: runtime `KHR_materials_variants` rebind — remaps each renderable's material key
   * to the given variant's material (creating non-resident contract variants on demand); `null`
   * restores the authored mapping. Resolves `"variant-unknown"` when no binding declares it.
   * A later selection supersedes a pending selection. Superseded or disposed operations reject
   * with an `AbortError`; other material/texture failures are propagated.
   */
  setMaterialVariant(variant: string | null): Promise<"applied" | "variant-unknown">;
  dispose(): void;
  /**
   * Drain late and shared cleanup. The first call reports synchronous disposal
   * failures; a call after rejection retries only the still-owned resources.
   */
  disposeAsync?(): Promise<void>;
}

export interface GLTFRenderableBinding {
  readonly nodeName: string;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly sourceMaterialName: string;
  readonly sourceMaterialIndex?: number;
  readonly sourceMeshIndex?: number;
  readonly primitiveIndex?: number;
  readonly materialVariants: readonly GLTFMaterialVariantMappingAsset[];
  readonly skinned: boolean;
  readonly instanced: boolean;
}

export type GLTFRenderResourceMaterialFidelityIssue =
  | "unsupported-texcoord-set"
  | "generated-tangent-uv-mismatch";

export interface GLTFRenderResourceMaterialFidelityDiagnostic {
  readonly issue: GLTFRenderResourceMaterialFidelityIssue;
  readonly slot: TexturedPBRTextureSlot | "diffuseRoughness" | "bump";
  readonly texCoord: number;
  readonly renderedTexCoord: number;
  readonly nodeName: string;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly sourceMaterialName: string;
  readonly sourceMaterialIndex?: number;
  readonly sourceMeshIndex?: number;
  readonly primitiveIndex?: number;
  readonly detail: string;
}

/**
 * PRD-04 P5: load-time lane issues surfaced through diagnostics — non-fatal deviations a
 * caller should see (`colorspace-conflict`, `tangent-derivative-fallback`).
 */
export interface GLTFRenderResourceLoadIssue {
  readonly code: "colorspace-conflict" | "tangent-derivative-fallback" | "texture-load-failed";
  readonly detail: string;
  readonly textureIndex?: number;
  readonly imageIndex?: number;
  readonly uri?: string;
  readonly reason?: string;
  readonly fallback?: boolean;
}

/** A texture could not be fetched or decoded in strict mode. */
export class GLTFTextureLoadError extends Error {
  readonly issue: GLTFRenderResourceLoadIssue;
  constructor(issue: GLTFRenderResourceLoadIssue, cause?: unknown) {
    super(issue.detail, { cause });
    this.name = "GLTFTextureLoadError";
    this.issue = issue;
  }
}

/** Texture slots read sRGB-authored data; every other slot decodes linear. */
const IMAGE_COLORSPACE_SLOTS: readonly {
  readonly slot: string;
  readonly colorSpace: "srgb" | "linear";
  readonly texture: (material: GLTFMaterialAsset) => GLTFResolvedTextureInfo | undefined;
}[] = [
  { slot: "baseColor", colorSpace: "srgb", texture: (material) => material.baseColorTexture },
  { slot: "emissive", colorSpace: "srgb", texture: (material) => material.emissiveTexture },
  { slot: "metallicRoughness", colorSpace: "linear", texture: (material) => material.metallicRoughnessTexture },
  { slot: "normal", colorSpace: "linear", texture: (material) => material.normalTexture },
  { slot: "diffuseRoughness", colorSpace: "linear", texture: (material) => material.diffuseRoughness?.texture },
  { slot: "bump", colorSpace: "linear", texture: (material) => material.bump?.texture },
  { slot: "occlusion", colorSpace: "linear", texture: (material) => material.occlusionTexture },
  { slot: "clearcoat", colorSpace: "linear", texture: (material) => material.clearcoat?.texture },
  { slot: "clearcoatRoughness", colorSpace: "linear", texture: (material) => material.clearcoat?.roughnessTexture },
  { slot: "clearcoatNormal", colorSpace: "linear", texture: (material) => material.clearcoat?.normalTexture },
  { slot: "sheenColor", colorSpace: "srgb", texture: (material) => material.sheen?.colorTexture },
  { slot: "sheenRoughness", colorSpace: "linear", texture: (material) => material.sheen?.roughnessTexture },
  { slot: "transmission", colorSpace: "linear", texture: (material) => material.transmission?.texture },
  { slot: "diffuseTransmission", colorSpace: "linear", texture: (material) => material.diffuseTransmission?.texture },
  { slot: "diffuseTransmissionColor", colorSpace: "srgb", texture: (material) => material.diffuseTransmission?.colorTexture },
  { slot: "volumeThickness", colorSpace: "linear", texture: (material) => material.volume?.thicknessTexture },
  { slot: "specular", colorSpace: "linear", texture: (material) => material.specular?.texture },
  { slot: "specularColor", colorSpace: "srgb", texture: (material) => material.specular?.colorTexture },
  { slot: "anisotropy", colorSpace: "linear", texture: (material) => material.anisotropy?.texture },
  { slot: "iridescence", colorSpace: "linear", texture: (material) => material.iridescence?.texture },
  { slot: "iridescenceThickness", colorSpace: "linear", texture: (material) => material.iridescence?.thicknessTexture },
  { slot: "sgDiffuse", colorSpace: "srgb", texture: (material) => material.pbrSpecularGlossiness?.diffuseTexture },
  { slot: "sgSpecularGlossiness", colorSpace: "linear", texture: (material) => material.pbrSpecularGlossiness?.specularGlossinessTexture }
];

/**
 * PRD-04 P5-1: per-image colour-space intent derived from material slot usage, for the C-16
 * decode path (a KTX2/Basis transcode target must be chosen before any slot samples the
 * image). An image used both sRGB and linear records a `colorspace-conflict` in
 * `conflicts`; its intent resolves `"linear"` so no gamma curve is baked into the decoded
 * payload — the per-slot usage space still applies at the `Texture` level.
 */
export function imageColorSpaceIntent(asset: GLTFAsset): {
  readonly intent: ReadonlyMap<number, "srgb" | "linear">;
  readonly conflicts: readonly { readonly image: number; readonly srgb: string; readonly linear: string }[];
} {
  const usages = new Map<number, { srgb: string[]; linear: string[] }>();
  for (const material of asset.materials) {
    for (const slot of IMAGE_COLORSPACE_SLOTS) {
      const info = slot.texture(material);
      if (!info) continue;
      const usage = usages.get(info.image) ?? { srgb: [], linear: [] };
      (slot.colorSpace === "srgb" ? usage.srgb : usage.linear).push(`${material.name}:${slot.slot}`);
      usages.set(info.image, usage);
    }
  }
  const intent = new Map<number, "srgb" | "linear">();
  const conflicts: { image: number; srgb: string; linear: string }[] = [];
  for (const [image, usage] of usages) {
    const conflict = usage.srgb.length > 0 && usage.linear.length > 0;
    intent.set(image, usage.linear.length > 0 || !conflict && usage.srgb.length === 0 ? "linear" : "srgb");
    if (conflict) conflicts.push({ image, srgb: usage.srgb.join(","), linear: usage.linear.join(",") });
  }
  return { intent, conflicts };
}

export interface GLTFMaterialOverrideQuery {
  readonly nodeName?: string | RegExp;
  readonly sourceMaterialName?: string | RegExp;
  readonly materialKey?: string | RegExp;
  readonly variant?: string;
  readonly uniqueMaterials?: boolean;
}

export interface GLTFMaterialOverrideTarget extends GLTFRenderableBinding {
  readonly material: Material;
}

export interface GLTFRendererInput extends RendererInput {
  readonly source: RenderSource;
  readonly camera: CameraLike;
  readonly frame: PerspectiveCameraFrame;
  readonly bounds: CameraFrameBounds;
}

export interface GLTFRendererInputOptions extends GLTFRenderSourceOptions {
  readonly frame?: PerspectiveCameraFrameOptions;
}

export type GLTFRenderQualityPreset = "default" | "studio-preview" | "hdr-studio-preview";

export interface GLTFRenderSourceOptions {
  readonly qualityPreset?: GLTFRenderQualityPreset;
  readonly environmentLighting?: EnvironmentLightingOptions | false;
  readonly shadowMap?: ForwardShadowMapOptions;
  readonly shadow?: RendererShadowOptions | boolean;
  readonly collectedLights?: Iterable<CollectedLight>;
  readonly postprocess?: RendererPostProcessOptions | boolean;
  readonly renderItems?: Iterable<RenderItem>;
  readonly cameraPolicy?: RendererCameraPolicy;
  readonly cameraFrameBounds?: CameraFrameBounds;
  readonly cameraFrameOptions?: PerspectiveCameraFrameOptions;
  readonly cameraPosition?: readonly [number, number, number];
  readonly frustumCulling?: boolean;
}

export interface GLTFRenderResourceDiagnosticsOptions {
  readonly label?: string;
  readonly suspectStaticNodePattern?: RegExp;
}

export interface GLTFRenderResourceDiagnostics {
  readonly label: string;
  readonly drawItems: number;
  readonly skinnedDrawItems: number;
  readonly texturedDrawItems: number;
  readonly baseColorTextureDrawItems: number;
  readonly colorBearingTextureDrawItems: number;
  readonly surfaceDetailTextureDrawItems: number;
  readonly effectiveTextureBackedDrawItems: number;
  readonly unsupportedTexCoordDrawItems: number;
  readonly generatedTangentUvMismatchDrawItems: number;
  readonly texturedSkinnedDrawItems: number;
  readonly untexturedSkinnedDrawItems: number;
  readonly fallbackWhiteDrawItems: number;
  readonly missingGeometryDrawItems: number;
  readonly missingMaterialDrawItems: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly textureBackedMaterialNames: readonly string[];
  readonly textureSlotDiagnostics: readonly GLTFRenderResourceTextureSlotDiagnostic[];
  readonly textureContributionDiagnostics: readonly GLTFRenderResourceTextureContributionDiagnostic[];
  readonly suppressedTextureSlotDiagnostics: readonly GLTFRenderResourceTextureContributionDiagnostic[];
  readonly materialFidelityDiagnostics: readonly GLTFRenderResourceMaterialFidelityDiagnostic[];
  readonly shaderActiveTextureSlotDiagnostics: readonly GLTFRenderResourceTextureSlotDiagnostic[];
  readonly shaderInactiveTextureSlotDiagnostics: readonly GLTFRenderResourceTextureSlotDiagnostic[];
  readonly fallbackWhiteMaterialNames: readonly string[];
  readonly skinnedLabels: readonly string[];
  readonly untexturedSkinnedLabels: readonly string[];
  readonly fallbackWhiteLabels: readonly string[];
  readonly missingGeometryLabels: readonly string[];
  readonly missingMaterialLabels: readonly string[];
  readonly suspectStaticLabels: readonly string[];
}

export interface GLTFRenderResourceTextureSlotDiagnostic {
  readonly slot: TexturedPBRTextureSlot;
  readonly drawItems: number;
  readonly materialNames: readonly string[];
  readonly labels: readonly string[];
}

export type GLTFRenderResourceTextureContribution = "color-bearing" | "surface-detail" | "suppressed";

export interface GLTFRenderResourceTextureContributionDiagnostic extends GLTFRenderResourceTextureSlotDiagnostic {
  readonly contribution: GLTFRenderResourceTextureContribution;
}

type GLTFTextureColorSpace = "srgb" | "linear";
type GLTFTextureGetter = (info: GLTFResolvedTextureInfo, colorSpace: GLTFTextureColorSpace, fallback?: GLTFTextureFallback) => Promise<Texture>;

const GLTF_DIAGNOSTIC_TEXTURE_BINDINGS: readonly (readonly [slot: TexturedPBRTextureSlot, textureParameter: string, enabledParameter: string])[] = [
  ["baseColor", "u_baseColorTexture", "u_baseColorTextureEnabled"],
  ["normal", "u_normalTexture", "u_normalTextureEnabled"],
  ["metallicRoughness", "u_metallicRoughnessTexture", "u_metallicRoughnessTextureEnabled"],
  ["occlusion", "u_occlusionTexture", "u_occlusionTextureEnabled"],
  ["emissive", "u_emissiveTexture", "u_emissiveTextureEnabled"],
  ["clearcoat", "u_clearcoatTexture", "u_clearcoatTextureEnabled"],
  ["clearcoatRoughness", "u_clearcoatRoughnessTexture", "u_clearcoatRoughnessTextureEnabled"],
  ["clearcoatNormal", "u_clearcoatNormalTexture", "u_clearcoatNormalTextureEnabled"],
  ["transmission", "u_transmissionTexture", "u_transmissionTextureEnabled"],
  ["diffuseTransmission", "u_diffuseTransmissionTexture", "u_diffuseTransmissionTextureEnabled"],
  ["diffuseTransmissionColor", "u_diffuseTransmissionColorTexture", "u_diffuseTransmissionColorTextureEnabled"],
  ["volumeThickness", "u_volumeThicknessTexture", "u_volumeThicknessTextureEnabled"],
  ["specular", "u_specularTexture", "u_specularTextureEnabled"],
  ["specularColor", "u_specularColorTexture", "u_specularColorTextureEnabled"],
  ["sheenColor", "u_sheenColorTexture", "u_sheenColorTextureEnabled"],
  ["sheenRoughness", "u_sheenRoughnessTexture", "u_sheenRoughnessTextureEnabled"],
  ["anisotropy", "u_anisotropyTexture", "u_anisotropyTextureEnabled"],
  ["iridescence", "u_iridescenceTexture", "u_iridescenceTextureEnabled"],
  ["iridescenceThickness", "u_iridescenceThicknessTexture", "u_iridescenceThicknessTextureEnabled"]
];

export const DEFAULT_GLTF_RENDER_ENVIRONMENT_LIGHTING: EnvironmentLightingOptions = {
  color: [0.72, 0.74, 0.78],
  intensity: 0.38,
  proceduralMap: {
    skyColor: [0.62, 0.72, 0.9],
    horizonColor: [0.9, 0.82, 0.66],
    groundColor: [0.16, 0.16, 0.18],
    specularColor: [1, 0.92, 0.78],
    intensity: 0.42,
    specularIntensity: 0.7
  }
};

export const DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING: EnvironmentLightingOptions = {
  color: [0.82, 0.84, 0.88],
  intensity: 0.5,
  proceduralMap: {
    skyColor: [0.72, 0.82, 0.95],
    horizonColor: [1, 0.9, 0.72],
    groundColor: [0.12, 0.13, 0.15],
    specularColor: [1, 0.95, 0.82],
    intensity: 0.62,
    specularIntensity: 1.15
  }
};

export function createDefaultGLTFHdrStudioPreviewEnvironmentLighting(): EnvironmentLightingOptions {
  return createExternalParityEnvironmentLighting("studio").lighting;
}

export const DEFAULT_GLTF_STUDIO_PREVIEW_POSTPROCESS: RendererPostProcessOptions = {
  targetFormat: "rgba8",
  toneMapping: {
    exposure: 1.18,
    operator: "filmic",
    inputColorSpace: "linear",
    outputColorSpace: "srgb"
  },
  colorGrade: {
    contrast: 1.08,
    saturation: 1.06,
    vibrance: 0.1,
    vignette: 0.18,
    sharpening: 0.28
  },
  bloom: {
    threshold: 0.82,
    intensity: 0.08,
    radius: 1
  },
  fxaa: {
    edgeThreshold: 0.08,
    subpixelBlend: 0.55
  }
};

export const DEFAULT_GLTF_HDR_STUDIO_PREVIEW_POSTPROCESS: RendererPostProcessOptions = {
  targetFormat: "rgba16f",
  toneMapping: {
    exposure: 1.12,
    whitePoint: 1.25,
    operator: "filmic",
    inputColorSpace: "linear",
    outputColorSpace: "srgb"
  },
  colorGrade: {
    contrast: 1.1,
    saturation: 1.06,
    vibrance: 0.12,
    vignette: 0.16,
    sharpening: 0.32
  },
  bloom: {
    threshold: 0.9,
    intensity: 0.12,
    radius: 1
  },
  fxaa: {
    edgeThreshold: 0.08,
    subpixelBlend: 0.55
  }
};

export const DEFAULT_GLTF_STUDIO_PREVIEW_FRAME: PerspectiveCameraFrameOptions = {
  paddingRatio: 0.16,
  yawRadians: -0.38,
  pitchRadians: -0.16,
  nearPadding: 0.18,
  farPadding: 2.4
};

// Cache scope includes parsed-asset and decoder identity, not only image index.
// A shared cache can be handed to several independently loaded documents.
const gltfResourceObjectIds = new WeakMap<object, number>();
// Source admission and native GPU residency have different lifetimes. A scope
// keeps these decoded texture estimates separate from the backend ledger.
const gltfDecodeBudgetScope = {};
class GLTFTextureBudgetDeviceDisposedError extends Error {
  readonly code = "GLTF_TEXTURE_BUDGET_DEVICE_DISPOSED";
  constructor() {
    super("The intended glTF texture budget device is disposed.");
    this.name = "GLTFTextureBudgetDeviceDisposedError";
  }
}
function assertGLTFTextureBudgetDevice(device: RenderDevice | undefined): void {
  if (device?.disposed) throw new GLTFTextureBudgetDeviceDisposedError();
}
let nextGLTFResourceObjectId = 0;
function gltfResourceObjectId(value: object | undefined): number {
  if (!value) return 0;
  let id = gltfResourceObjectIds.get(value);
  if (id === undefined) { id = ++nextGLTFResourceObjectId; gltfResourceObjectIds.set(value, id); }
  return id;
}

export async function createGLTFRenderResources(
  asset: GLTFAsset,
  options: GLTFRenderResourceOptions = {}
): Promise<GLTFRenderResources & { disposeAsync(): Promise<void> }> {
  // The owner of the admission must stay stable even if a caller reuses or
  // mutates its options while an asynchronous image decode is in flight.
  const capturedOptions = { ...options };
  const transcoderOwner = capturedOptions.ktx2BasisTranscoderOptions;
  const transcoderOptions = transcoderOwner && {
    ...transcoderOwner,
    ...(transcoderOwner.workerAssets ? { workerAssets: { ...transcoderOwner.workerAssets } } : {})
  };
  const decodeBaseOptions = transcoderOptions ? { ...capturedOptions, ktx2BasisTranscoderOptions: transcoderOptions } : capturedOptions;
  const textureBudgetDevice = decodeBaseOptions.textureBudgetDevice;
  const textureBudget = decodeBaseOptions.textureBudget;
  const maxTextureSize = decodeBaseOptions.maxTextureSize;
  const workerAssets = transcoderOptions?.workerAssets;
  // Fold mutable codec settings into the hashed request identity, not the
  // visible cache key, so changed settings cannot reuse an earlier decode.
  const transcoderIdentity = transcoderOptions && [
    gltfResourceObjectId(transcoderOwner), transcoderOptions.targetFormat, transcoderOptions.colorSpace,
    transcoderOptions.maxDimension === undefined ? "unset" : `set:${transcoderOptions.maxDimension}`,
    transcoderOptions.transcoderUrl, transcoderOptions.includeFallback,
    transcoderOptions.workerCount === undefined ? "unset" : `set:${transcoderOptions.workerCount}`,
    gltfResourceObjectId(transcoderOptions.workerPool), gltfResourceObjectId(transcoderOptions.onCleanupPending),
    workerAssets && [workerAssets.basisScript, workerAssets.basisModule, workerAssets.basisWasm, workerAssets.basisWorker,
      workerAssets.dracoModule, workerAssets.dracoWasm, workerAssets.meshoptModule]
  ];
  assertGLTFTextureBudgetDevice(textureBudgetDevice);
  const geometryLibrary = new Map<string, Geometry>();
  const ownedGeometries = new Set<Geometry>();
  const materialLibrary = new Map<string, Material>();
  const morphTargetLibrary = new Map<string, readonly MorphTargetDelta[]>();
  const textureLibrary = new Map<string, Texture>();
  const textureByImage = new Map<string, Promise<Texture>>();
  // This must be keyed by image, not texture: multiple texture definitions
  // can alias the same image and the first caller owns the shared decode.
  const requiredAnimationImages = new Set(asset.requiredTextureAnimationTargets?.map((target) => target.imageIndex) ?? []);
  const textureResidencySources = new Map<Texture, TextureResidencySource<GLTFTextureResidencyMip>>();
  const unmanagedTextureResidency = new Map<Texture, string>();
  // Bind the later decode to the same mutable request containers that are
  // fingerprinted for sharing, even if the caller edits them while we await.
  const request = decodeBaseOptions.request ? { ...decodeBaseOptions.request, ...mergeAssetRequestOptions({}, decodeBaseOptions.request) } : undefined;
  validateAssetMaxBytes(request?.maxBytes);
  const imageMaxBytes = gltfImageByteLimit(asset, request?.maxBytes);
  const signal = new LoadContext({ signal: decodeBaseOptions.signal }).signalFor(request?.signal);
  throwIfResourceAborted(signal);
  const lifetime = new AbortController();
  const lifetimeSignal = new LoadContext({ signal: lifetime.signal }).signalFor(signal)!;
  const ownedMaterials = new Set<Material>();
  // Shared texture factories cannot independently cancel or report progress
  // to per-call callbacks. The inherited callback belongs to the asset itself
  // and is common to every resource using that same asset.
  const privateTextures = new Set<Texture>();
  const onProgress = request?.onProgress ?? gltfImageRequestProgress(asset);
  const scene = asset.createScene({
    ...(options.materialVariant ? { materialVariant: options.materialVariant } : {}),
    ...(options.sceneIndex !== undefined ? { sceneIndex: options.sceneIndex } : {}),
    ...(options.sceneName !== undefined ? { sceneName: options.sceneName } : {})
  });
  // Each eligible resource pins the cache even before a deferred material
  // variant starts a decode. Individual image policies are checked separately.
  let sharedTextureLease: GLTFSharedTextureLease | null = null;

  // P5-1: per-image colour-space intent, resolved once from material slot usage and passed
  // into the C-16 decode options (`ktx2BasisTranscoderOptions.colorSpace`) so a
  // once-per-image transcode knows the intended space. Conflicts become `loadIssues`.
  const colorSpaceIntent = imageColorSpaceIntent(asset);
  const loadIssues: GLTFRenderResourceLoadIssue[] = colorSpaceIntent.conflicts.map((conflict) => ({
    code: "colorspace-conflict" as const,
    detail: `glTF image ${conflict.image} is used as sRGB (${conflict.srgb}) and linear (${conflict.linear}); decoding as linear.`
  }));
  const decodeOptionsForImage = (imageIndex: number): GLTFRenderResourceOptions =>
    decodeBaseOptions.materialsR185 === true
      ? {
          ...decodeBaseOptions,
          ktx2BasisTranscoderOptions: {
            ...decodeBaseOptions.ktx2BasisTranscoderOptions,
            // Flag-on only: pre-intent decode options stay byte-identical off-flag.
            colorSpace: colorSpaceIntent.intent.get(imageIndex) ?? "linear"
          } as GLTFRenderResourceOptions["ktx2BasisTranscoderOptions"]
        }
      : decodeBaseOptions;

  const getTexture: GLTFTextureGetter = async (info, colorSpace, fallback = "factor") => {
    throwIfResourceAborted(lifetimeSignal);
    const textureAsset = asset.textures[info.texture];
    const image = asset.images[info.image];
    if (!textureAsset || !image) {
      throw new Error(`glTF material texture ${info.texture} references missing image ${info.image}`);
    }
    // A single glTF image can serve normal and scalar slots. Their neutral
    // samples differ, so an opted-in app needs distinct logical textures.
    const cacheKey = `${textureCacheKey(info.image, colorSpace)}${options.retainTextureResidencySources ? `:${fallback}` : ""}`;
    let texturePromise = textureByImage.get(cacheKey);
    if (!texturePromise) {
      const createTexture = async (
        textureSignal: AbortSignal | undefined,
        effectiveRequest: GLTFImageDecodeContext["request"]
      ): Promise<Texture> => {
        const decoder = decodeBaseOptions.imageDecoder ?? ((sourceImage, imageIndex, sourceAsset) => decodeImageInBrowser(sourceImage, imageIndex, sourceAsset, { ...decodeOptionsForImage(imageIndex), request: effectiveRequest, signal: textureSignal }));
        let decodeImage = image;
        const externalUri = image.uri && !image.uri.startsWith("data:") ? image.uri : undefined;
        // An external URI the loader can resolve is always read through the
        // document's request contract (origins, credentials, headers, size,
        // integrity), so a custom decoder never performs an unpoliced fetch.
        // Only a URI the loader cannot resolve (a decoder-private scheme) is
        // handed over as-is, and never when integrity is required.
        let resolvableExternal = false;
        if (externalUri && decodeBaseOptions.imageDecoder && !image.data) {
          try { resolveImageUrl(asset.url, externalUri); resolvableExternal = true; } catch { /* Decoder-private URI. */ }
        }
        if (decodeBaseOptions.imageDecoder && (effectiveRequest?.maxBytes !== undefined || resolvableExternal || (externalUri && effectiveRequest?.integrity))) {
          // Give custom decoders a bounded snapshot when a byte policy applies,
          // and never hand them unverified external bytes.
          const data = await readImageBytes(asset, image, { signal: textureSignal, request: effectiveRequest });
          if (externalUri && effectiveRequest?.integrity) await verifyAssetBytes(data, effectiveRequest.integrity, externalUri);
          throwIfResourceAborted(textureSignal);
          decodeImage = { ...image, data };
        }
        const decoded = await decodeWithCancellation(
          Promise.resolve().then(() => {
            throwIfResourceAborted(textureSignal);
            return decoder(decodeImage, info.image, asset, { signal: textureSignal, request: effectiveRequest });
          }), textureSignal
        );
        let texture: Texture | undefined;
        try {
          throwIfResourceAborted(textureSignal);
          assertGLTFTextureBudgetDevice(textureBudgetDevice);
          texture = new Texture({
            width: decoded.width,
            height: decoded.height,
            ...(decoded.format ? { format: decoded.format } : {}),
            colorSpace,
            label: textureAsset.name,
            ...(decoded.mipLevels ? { mipLevels: decoded.mipLevels } : decoded.data ? { data: decoded.data } : { source: decoded.source }),
            ...(decoded.fallbackData ? { fallbackData: decoded.fallbackData } : {}),
            ...(decoded.fallbackMipLevels ? { fallbackMipLevels: decoded.fallbackMipLevels } : {})
          });
          const budgeted = textureBudget !== undefined || maxTextureSize !== undefined
            ? applyTextureBudget(texture, {
                ...(textureBudget !== undefined ? { textureBudgetBytes: textureBudget } : {}),
                ...(maxTextureSize !== undefined ? { maxTextureSize } : {})
              }, textureBudgetDevice, textureBudgetDevice ? gltfDecodeBudgetScope : undefined)
            : texture;
          if (budgeted !== texture) texture.dispose();
          if (textureBudget !== undefined || maxTextureSize !== undefined) {
            budgeted.onDispose(() => releaseTextureBudget(budgeted, textureBudgetDevice, textureBudgetDevice ? gltfDecodeBudgetScope : undefined));
          }
          budgeted.onDispose(() => closeDecodedImage(decoded));
          return budgeted;
        } catch (error) {
          texture?.dispose();
          closeDecodedImage(decoded);
          throw error;
        }
      };
      texturePromise = (async () => {
        try {
          const externalUri = image.uri && !image.uri.startsWith("data:") ? image.uri : undefined;
          // Retain the document's inherited transport policy for embedded
          // images too; the absence of an override does not imply anonymity.
          const imagePolicy = gltfImageRequestOptions(asset, externalUri ?? asset.url, request);
          const identityRequest = imageMaxBytes === undefined ? imagePolicy : { ...imagePolicy, maxBytes: imageMaxBytes };
          const effectiveRequest = externalUri
            ? { ...identityRequest, ...(onProgress ? { onProgress } : {}) }
            : imageMaxBytes === undefined ? request : { ...request, maxBytes: imageMaxBytes };
          if (sharedTextureLease) {
            let imageUrl: string | undefined;
            try { imageUrl = externalUri ? resolveImageUrl(asset.url, externalUri) : asset.url; }
            catch { /* A custom decoder may handle an otherwise unresolvable URI privately. */ }
            if (imageUrl !== undefined) {
              const identity = await requestIdentityDetails(identityRequest, JSON.stringify([imageUrl, request?.format ?? null, transcoderIdentity]));
              throwIfResourceAborted(lifetimeSignal);
              if (identity.reusable) {
                const sharedKey = [gltfResourceObjectId(asset), gltfResourceObjectId(decodeBaseOptions.imageDecoder),
                  decodeBaseOptions.ktx2BasisTargetFormat ?? "",
                  decodeBaseOptions.materialsR185 === true, decodeBaseOptions.qrAssets === true, maxTextureSize ?? "",
                  textureBudget ?? "", gltfResourceObjectId(textureBudgetDevice), cacheKey, identity.key].join(":");
                return await waitForResource(sharedTextureLease.getOrCreate(sharedKey, () => createTexture(undefined, effectiveRequest)), lifetimeSignal);
              }
            }
          }
          const texture = await createTexture(lifetimeSignal, effectiveRequest);
          privateTextures.add(texture);
          if (lifetimeSignal.aborted) {
            texture.dispose();
            privateTextures.delete(texture);
            throwIfResourceAborted(lifetimeSignal);
          }
          return texture;
        } catch (error) {
          // Security, size and cancellation failures must never turn into a
          // successful-looking fallback, even when permissive mode is enabled.
          const errorUrls = image.uri ? [asset.url, image.uri] : [asset.url];
          reportLateResourceFailure(error, lifetimeSignal, errorUrls);
          if (lifetimeSignal.aborted && !isExpectedResourceCancellation(error, lifetimeSignal)) throw error;
          throwIfResourceAborted(lifetimeSignal);
          if (isTexturePolicyOrAbortError(error)) throw error;
          const sanitizedCause = redactImportCause(error, errorUrls);
          const reason = safeTextureErrorReason(sanitizedCause);
          const uri = image.uri ? redactAssetUrl(image.uri) : undefined;
          const strict = options.failOnMissingTexture === true || requiredAnimationImages.has(info.image);
          const issue: GLTFRenderResourceLoadIssue = {
            code: "texture-load-failed", textureIndex: info.texture, imageIndex: info.image,
            ...(uri ? { uri } : {}), reason, fallback: !strict,
            detail: `glTF texture ${info.texture} (image ${info.image}) failed: ${reason}`
          };
          if (strict) {
            const safeCause = sanitizedCause instanceof Error ? sanitizedCause : new Error(reason);
            safeCause.name = safeCause.name.slice(0, 128);
            safeCause.message = reason;
            throw new GLTFTextureLoadError(issue, safeCause);
          }
          loadIssues.push(issue);
          warnMissingGLTFTexture(textureAsset.name, uri, reason);
          const missing = createFallbackTexture(textureAsset.name, colorSpace, options.retainTextureResidencySources ? fallback : "factor");
          privateTextures.add(missing);
          return missing;
        }
      })();
      textureByImage.set(cacheKey, texturePromise);
      const pendingTexture = texturePromise;
      void pendingTexture.catch(() => {
        if (!lifetimeSignal.aborted && textureByImage.get(cacheKey) === pendingTexture) textureByImage.delete(cacheKey);
      });
    }
    const texture = await waitForResource(texturePromise, lifetimeSignal);
    throwIfResourceAborted(lifetimeSignal);
    assertGLTFTextureBudgetDevice(textureBudgetDevice);
    if (options.retainTextureResidencySources && !textureResidencySources.has(texture) && !unmanagedTextureResidency.has(texture)) {
      const source = createGLTFTextureResidencySource(texture, fallback);
      if (source) textureResidencySources.set(texture, source);
      else unmanagedTextureResidency.set(texture, "decoded texture has no supported retained 2D mip bytes");
    }
    setTextureLibraryEntry(textureLibrary, textureAsset.name, colorSpace, texture);
    return texture;
  };

  // When deduplication is enabled, materials with identical definitions share one runtime instance
  // so renderer static batching (which keys on material identity) can collapse them. Declared before
  // the try block so `setMaterialVariant` (R11) can rebuild missing contract variants on rebind.
  const sharedMaterials = options.deduplicateIdenticalMaterials
    ? new Map<string, Promise<Material>>()
    : null;
  const ownMaterial = (created: Promise<Material>): Promise<Material> => created.then((material) => {
    if (lifetimeSignal.aborted) {
      try { material.dispose(); }
      catch (error) { ownedMaterials.add(material); reportLateResourceFailure(error, lifetimeSignal, [asset.url]); throw error; }
      throwIfResourceAborted(lifetimeSignal);
    }
    ownedMaterials.add(material);
    return material;
  }, (error: unknown) => {
    reportLateResourceFailure(error, lifetimeSignal, [asset.url]);
    throw error;
  });
  const buildMaterial = (
    material: (typeof asset.materials)[number],
    contract: Parameters<typeof createMaterial>[3]
  ): Promise<Material> => {
    if (!sharedMaterials) {
      return ownMaterial(createMaterial(asset, material, getTexture, contract, options.materialRenderStateOverrides, options.materialsR185, { materialsTransmission: options.materialsTransmission, transmission: options.transmission }, (failed) => ownedMaterials.add(failed)));
    }
    // The contract participates in the key: the same glTF material under two different runtime
    // contracts (skinned vs instanced, for example) must not collapse into one instance.
    const key = identicalMaterialKey(material, contract);
    const existing = sharedMaterials.get(key);
    if (existing) return existing;
    const created = ownMaterial(createMaterial(asset, material, getTexture, contract, options.materialRenderStateOverrides, options.materialsR185, { materialsTransmission: options.materialsTransmission, transmission: options.transmission }, (failed) => ownedMaterials.add(failed)));
    sharedMaterials.set(key, created);
    void created.catch(() => {
      if (!lifetimeSignal.aborted && sharedMaterials.get(key) === created) sharedMaterials.delete(key);
    });
    return created;
  };

  try {
    if (decodeBaseOptions.sharedTextures && !signal && !decodeBaseOptions.ktx2BasisTranscoderOptions?.signal && !request?.onProgress) {
      const documentRequest = gltfImageRequestOptions(asset, asset.url, request);
      const documentIdentity = await requestIdentityDetails(documentRequest, asset.url);
      throwIfResourceAborted(lifetimeSignal);
      if (documentIdentity.reusable) sharedTextureLease = decodeBaseOptions.sharedTextures.acquire();
    }
    // P5-4: under `A3D_QR_MATERIALS` prefer MikkTSpace-generated tangents (r185's frame) over
    // the legacy triangle-average generator, unless `tangents === "legacy"` or the MikkTSpace
    // module is not registered. `tangent-derivative-fallback` is reported inside createGeometry
    // only when a tangent-needing program lands on the derivative frame.
    const tangentGeneration = {
      useMikkTSpace: options.materialsR185 === true && options.tangents !== "legacy" && mikkTSpaceAvailable(),
      mikkTSpaceWanted: options.materialsR185 === true && options.tangents !== "legacy"
    };
    for (const mesh of asset.meshes) {
      const materials = [materialForMesh(asset, mesh, options.materialVariant),
        ...(mesh.materialIndex === undefined ? [] : [asset.materials[mesh.materialIndex]]),
        ...mesh.materialVariants.map((mapping) => asset.materials[mapping.materialIndex])];
      const geometry = await createGeometry(mesh, materials, tangentGeneration, loadIssues);
      ownedGeometries.add(geometry);
      geometryLibrary.set(mesh.name, geometry);
      if (mesh.morphTargets.length > 0) {
        morphTargetLibrary.set(mesh.name, mesh.morphTargets.map((target) => ({
          ...(target.name ? { name: target.name } : {}),
          positions: target.positions,
          normals: target.normals,
          tangents: target.tangents
        })));
      }
    }

    const runtimeMaterialContracts = new Map<string, ReturnType<typeof parseGLTFRuntimeMaterialKey>>();
    for (const { renderable } of scene.collectRenderables()) {
      const parsed = parseGLTFRuntimeMaterialKey(renderable.material);
      runtimeMaterialContracts.set(renderable.material, {
        material: parsed.material,
        contract: {
          ...parsed.contract,
          ...(renderable.skinning ? { skinned: true } : {}),
          ...(renderable.instanceTransforms ? { instanced: true } : {})
        }
      });
    }
    const materialTasks: Promise<void>[] = [];
    for (const material of asset.materials) {
      const runtimeKeys = [...runtimeMaterialContracts.entries()].filter(([, runtime]) => runtime.material === material.name);
      if (runtimeKeys.length === 0) {
        materialTasks.push(buildMaterial(material, {}).then((runtimeMaterial) => {
          materialLibrary.set(material.name, runtimeMaterial);
        }));
        continue;
      }
      for (const [key, runtime] of runtimeKeys) {
        materialTasks.push(buildMaterial(material, runtime.contract).then((runtimeMaterial) => {
          materialLibrary.set(key, runtimeMaterial);
        }));
      }
    }
    const materialResults = await Promise.allSettled(materialTasks);
    const failedMaterial = materialResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failedMaterial) throw failedMaterial.reason;
    throwIfResourceAborted(signal);

    for (const mesh of asset.meshes) {
      for (const [key, runtime] of runtimeMaterialContracts) {
        if (runtime.material === mesh.material && !materialLibrary.has(key)) {
          const material = createDefaultGLTFMaterial(mesh, runtime.contract, options.materialsR185);
          ownedMaterials.add(material);
          materialLibrary.set(key, material);
        }
      }
      if (!materialLibrary.has(mesh.material)) {
        const material = createDefaultGLTFMaterial(mesh, {}, options.materialsR185);
        ownedMaterials.add(material);
        materialLibrary.set(mesh.material, material);
      }
    }
  } catch (error) {
    lifetime.abort(resourceDisposedError());
    try { disposeGLTFRenderResourceMaps(ownedGeometries, ownedMaterials, privateTextures, () => sharedTextureLease?.release()); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "glTF resource creation and cleanup failed"); }
    throw error;
  }
  const bounds = computeGLTFRenderResourceBounds(scene, geometryLibrary, morphTargetLibrary);
  const renderableBindings = createGLTFRenderableBindings(asset, scene);
  const materialFidelityDiagnostics = createGLTFMaterialFidelityDiagnostics(asset, renderableBindings, options.materialVariant);
  let variantOperation: AbortController | undefined;
  // Superseding a selection cancels only its wait: a material already being
  // built can be reused by the next selection of the same runtime contract.
  const variantMaterialBuilds = new Map<string, Promise<Material>>();
  const variantMaterial = (key: string, create: () => Promise<Material>): Promise<Material> => {
    const existing = variantMaterialBuilds.get(key);
    if (existing) return existing;
    const pending = create();
    variantMaterialBuilds.set(key, pending);
    void pending.catch(() => {
      if (!lifetimeSignal.aborted && variantMaterialBuilds.get(key) === pending) variantMaterialBuilds.delete(key);
    });
    return pending;
  };

  let startedDisposal = false;
  let disposing = false;
  let sharedReleased = false;
  let syncFailure: unknown;
  let disposal: Promise<void> | undefined;
  let disposalFailed = false;
  let variantCleanup: Promise<void> | undefined;
  const disposeOwned = (): void => disposeGLTFRenderResourceMaps(ownedGeometries, ownedMaterials, privateTextures, () => {
    if (sharedReleased) return;
    sharedTextureLease?.release();
    sharedReleased = true;
  });
  const dispose = (): void => {
    if (startedDisposal) return;
    startedDisposal = true;
    disposing = true;
    try {
      // Local shared-texture waits abort promptly; the last cache lease
      // independently drains the shared factory itself.
      const pendingWork = [...new Set([...variantMaterialBuilds.values(), ...textureByImage.values()])];
      variantCleanup = Promise.allSettled(pendingWork).then((results) => {
        const failures = results.filter((result): result is PromiseRejectedResult =>
          result.status === "rejected" && !isExpectedResourceCancellation(result.reason, lifetimeSignal)
        ).map((result) => result.reason);
        if (failures.length) throw new AggregateError([...new Set(failures)], "Late glTF resource cleanup failed");
      });
      void variantCleanup.catch(() => {});
      lifetime.abort(resourceDisposedError());
      variantOperation = undefined;
      sharedMaterials?.clear();
      variantMaterialBuilds.clear();
      textureByImage.clear();
      disposeOwned();
    }
    catch (error) { syncFailure = error; throw error; }
    finally { disposing = false; }
  };
  const disposeAsync = (): Promise<void> => {
    if (disposing) {
      const pending = Promise.resolve().then(disposeAsync);
      void pending.catch(() => {});
      return pending;
    }
    if (disposal && !disposalFailed) return disposal;
    const retry = disposalFailed;
    disposalFailed = false;
    if (!startedDisposal) {
      try { dispose(); } catch { /* The same failure is reported below. */ }
    } else if (retry) {
      disposing = true;
      try { disposeOwned(); } catch (error) { syncFailure = error; }
      finally { disposing = false; }
    }
    const failure = syncFailure;
    syncFailure = undefined;
    let sharedCleanup: Promise<void> | undefined;
    try { sharedCleanup = sharedReleased ? sharedTextureLease?.releaseAsync?.() : undefined; }
    catch (error) { sharedCleanup = Promise.reject(error); }
    disposal = Promise.allSettled([sharedCleanup, retry ? undefined : variantCleanup]).then((results) => {
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason);
      if (failure !== undefined) failures.unshift(failure);
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, "glTF resource disposal failed");
    }).catch((error: unknown) => { disposalFailed = true; throw error; });
    void disposal.catch(() => {});
    return disposal;
  };

  return {
    scene,
    geometryLibrary,
    materialLibrary,
    renderableBindings,
    materialFidelityDiagnostics,
    loadIssues,
    morphTargetLibrary,
    textureLibrary,
    ...(options.retainTextureResidencySources ? { textureResidencySources, unmanagedTextureResidency } : {}),
    bounds,
    collectMaterialOverrideTargets: (query = {}) => collectGLTFMaterialOverrideTargets(renderableBindings, materialLibrary, query),
    createCameraFrame: (viewport, frameOptions = {}) => computePerspectiveCameraFrame(bounds, viewport, defaultGLTFCameraFrameOptions(bounds, frameOptions)),
    toRenderSource: (sourceOptions = {}) => createGLTFRenderSource({
      scene,
      geometryLibrary,
      materialLibrary,
      morphTargetLibrary,
      bounds
    }, sourceOptions),
    toRendererInput: (viewport, inputOptions = {}) => {
      const { frame: frameOptions, ...sourceOptions } = inputOptions;
      const qualityPreset = sourceOptions.qualityPreset ?? "studio-preview";
      const frame = computePerspectiveCameraFrame(bounds, viewport, defaultGLTFCameraFrameOptions(bounds, frameOptions));
      return {
        source: createGLTFRenderSource({
          scene,
          geometryLibrary,
          materialLibrary,
          morphTargetLibrary,
          bounds
        }, {
          ...sourceOptions,
          qualityPreset,
          cameraPosition: sourceOptions.cameraPosition ?? frame.cameraPosition,
          cameraPolicy: sourceOptions.cameraPolicy ?? "require"
        }),
        camera: {
          viewProjectionMatrix: frame.viewProjectionMatrix,
          viewMatrix: frame.viewMatrix,
          projectionMatrix: frame.projectionMatrix
        },
        frame,
        bounds
      };
    },
    setMaterialVariant: (variant) => {
      if (lifetimeSignal.aborted) return Promise.reject(lifetimeSignal.reason);
      if (variant !== null && !renderableBindings.some((binding) => binding.materialVariants.some((entry) => entry.variant === variant))) {
        return Promise.resolve("variant-unknown");
      }
      variantOperation?.abort(variantSupersededError());
      const operation = new AbortController();
      variantOperation = operation;
      const abortForLifetime = () => operation.abort(lifetimeSignal.reason);
      lifetimeSignal.addEventListener("abort", abortForLifetime, { once: true });
      return applyGLTFMaterialVariant({ asset, scene, materialLibrary, renderableBindings, buildMaterial,
        ownMaterial, variantMaterial, variant, signal: operation.signal }).finally(() => {
        lifetimeSignal.removeEventListener("abort", abortForLifetime);
        if (variantOperation === operation) variantOperation = undefined;
      });
    },
    dispose,
    disposeAsync
  };
}

/**
 * PRD-04 P2/R11: KHR_materials_variants rebinding without a pipeline rebuild — the actor's variant
 * switch remaps each renderable's material key. Meshes lacking a mapping for the active variant
 * keep their authored material per the glTF spec; `null` restores the authored mapping.
 */
async function applyGLTFMaterialVariant(options: {
  readonly asset: GLTFAsset;
  readonly scene: ReturnType<GLTFAsset["createScene"]>;
  readonly materialLibrary: Map<string, Material>;
  readonly renderableBindings: readonly GLTFRenderableBinding[];
  readonly buildMaterial: (
    material: GLTFMaterialAsset,
    contract: { readonly skinned?: boolean; readonly instanced?: boolean }
  ) => Promise<Material>;
  readonly ownMaterial: (created: Promise<Material>) => Promise<Material>;
  readonly variantMaterial: (key: string, create: () => Promise<Material>) => Promise<Material>;
  readonly variant: string | null;
  readonly signal: AbortSignal;
}): Promise<"applied" | "variant-unknown"> {
  const { asset, scene, materialLibrary, renderableBindings, buildMaterial, ownMaterial, variantMaterial, variant, signal } = options;
  throwIfResourceAborted(signal);
  if (variant !== null
    && !renderableBindings.some((binding) => binding.materialVariants.some((entry) => entry.variant === variant))) {
    return "variant-unknown";
  }
  const meshByGeometry = new Map(asset.meshes.map((mesh) => [mesh.name, mesh]));
  const tasks = new Map<string, Promise<Material>>();
  const rebindings: { renderable: { material: string }; key: string }[] = [];
  scene.collectRenderables().forEach(({ renderable }, index) => {
    const binding = renderableBindings[index];
    const mesh = meshByGeometry.get(renderable.geometry);
    if (!binding || !mesh) return;
    const parsed = parseGLTFRuntimeMaterialKey(renderable.material);
    const contract = {
      ...parsed.contract,
      ...(renderable.skinning ? { skinned: true } : {}),
      ...(renderable.instanceTransforms ? { instanced: true } : {})
    };
    const mapping = variant === null
      ? undefined
      : mesh.materialVariants.find((entry) => entry.variant === variant);
    const targetName = mapping?.material ?? binding.sourceMaterialName;
    const key = gltfRuntimeMaterialKey(targetName, contract);
    if (!materialLibrary.has(key) && !tasks.has(key)) {
      const materialDef = asset.materials.find((entry) => entry.name === targetName);
      tasks.set(key, variantMaterial(key, () => materialDef
        ? buildMaterial(materialDef, contract)
        : ownMaterial(Promise.resolve(createDefaultGLTFMaterial({ ...mesh, material: targetName }, contract)))));
    }
    rebindings.push({ renderable: renderable as { material: string }, key });
  });
  const entries = [...tasks.entries()];
  const results = await waitForResource(Promise.allSettled(entries.map(([, task]) => task)), signal);
  throwIfResourceAborted(signal);
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason;
  for (let index = 0; index < entries.length; index += 1) {
    materialLibrary.set(entries[index]![0], (results[index] as PromiseFulfilledResult<Material>).value);
  }
  for (const { renderable, key } of rebindings) renderable.material = key;
  return "applied";
}

function createGLTFRenderableBindings(
  asset: GLTFAsset,
  scene: ReturnType<GLTFAsset["createScene"]>
): readonly GLTFRenderableBinding[] {
  const meshByGeometry = new Map(asset.meshes.map((mesh) => [mesh.name, mesh]));
  return scene.collectRenderables().map(({ node, renderable }) => {
    const mesh = meshByGeometry.get(renderable.geometry);
    const materialKey = renderable.material;
    const parsedMaterial = parseGLTFRuntimeMaterialKey(materialKey);
    return {
      nodeName: node.name,
      geometryKey: renderable.geometry,
      materialKey,
      sourceMaterialName: parsedMaterial.material,
      ...(mesh?.materialIndex !== undefined ? { sourceMaterialIndex: mesh.materialIndex } : {}),
      ...(mesh?.sourceMeshIndex !== undefined ? { sourceMeshIndex: mesh.sourceMeshIndex } : {}),
      ...(mesh?.primitiveIndex !== undefined ? { primitiveIndex: mesh.primitiveIndex } : {}),
      materialVariants: mesh?.materialVariants ?? [],
      skinned: Boolean(renderable.skinning),
      instanced: Boolean(renderable.instanceTransforms)
    };
  });
}

function createGLTFMaterialFidelityDiagnostics(
  asset: GLTFAsset,
  bindings: readonly GLTFRenderableBinding[],
  materialVariant: string | undefined
): readonly GLTFRenderResourceMaterialFidelityDiagnostic[] {
  const diagnostics: GLTFRenderResourceMaterialFidelityDiagnostic[] = [];
  const meshByGeometry = new Map(asset.meshes.map((mesh) => [mesh.name, mesh]));
  for (const binding of bindings) {
    const mesh = meshByGeometry.get(binding.geometryKey);
    if (!mesh) continue;
    const material = materialForMesh(asset, mesh, materialVariant);
    if (!material) continue;
    for (const { slot, info, tangentSpace } of materialTextureInfosBySlot(material)) {
      const renderedTexCoord = renderTexCoord(info.texCoord);
      if (info.texCoord > 1) {
        diagnostics.push({
          issue: "unsupported-texcoord-set",
          slot,
          texCoord: info.texCoord,
          renderedTexCoord,
          ...materialFidelityBindingFields(binding),
          detail: `glTF ${slot} texture requests TEXCOORD_${info.texCoord}, but current WebGL render resources only bind TEXCOORD_0 and TEXCOORD_1; the shader samples TEXCOORD_${renderedTexCoord}.`
        });
      }
      if (tangentSpace && mesh.tangents.length === 0 && info.texCoord > 0) {
        diagnostics.push({
          issue: "generated-tangent-uv-mismatch",
          slot,
          texCoord: info.texCoord,
          renderedTexCoord,
          ...materialFidelityBindingFields(binding),
          detail: `glTF ${slot} texture samples TEXCOORD_${info.texCoord}, but generated tangents are derived from TEXCOORD_0 when source tangents are absent.`
        });
      }
    }
  }
  return diagnostics;
}

function materialFidelityBindingFields(binding: GLTFRenderableBinding): Omit<GLTFRenderResourceMaterialFidelityDiagnostic, "issue" | "slot" | "texCoord" | "renderedTexCoord" | "detail"> {
  return {
    nodeName: binding.nodeName,
    geometryKey: binding.geometryKey,
    materialKey: binding.materialKey,
    sourceMaterialName: binding.sourceMaterialName,
    ...(binding.sourceMaterialIndex !== undefined ? { sourceMaterialIndex: binding.sourceMaterialIndex } : {}),
    ...(binding.sourceMeshIndex !== undefined ? { sourceMeshIndex: binding.sourceMeshIndex } : {}),
    ...(binding.primitiveIndex !== undefined ? { primitiveIndex: binding.primitiveIndex } : {})
  };
}

function collectGLTFMaterialOverrideTargets(
  bindings: readonly GLTFRenderableBinding[],
  materialLibrary: ReadonlyMap<string, Material>,
  query: GLTFMaterialOverrideQuery
): readonly GLTFMaterialOverrideTarget[] {
  const uniqueMaterials = query.uniqueMaterials ?? true;
  const seen = new Set<string>();
  const targets: GLTFMaterialOverrideTarget[] = [];
  for (const binding of bindings) {
    if (!matchesGLTFMaterialOverrideQuery(binding, query)) continue;
    if (uniqueMaterials && seen.has(binding.materialKey)) continue;
    const material = materialLibrary.get(binding.materialKey);
    if (!material) continue;
    seen.add(binding.materialKey);
    targets.push({ ...binding, material });
  }
  return targets;
}

function matchesGLTFMaterialOverrideQuery(binding: GLTFRenderableBinding, query: GLTFMaterialOverrideQuery): boolean {
  if (query.nodeName && !matchesTextOrPattern(binding.nodeName, query.nodeName)) return false;
  if (query.sourceMaterialName && !matchesTextOrPattern(binding.sourceMaterialName, query.sourceMaterialName)) return false;
  if (query.materialKey && !matchesTextOrPattern(binding.materialKey, query.materialKey)) return false;
  if (query.variant && !binding.materialVariants.some((variant) => variant.variant === query.variant)) return false;
  return true;
}

function matchesTextOrPattern(value: string, matcher: string | RegExp): boolean {
  return typeof matcher === "string" ? value === matcher : matcher.test(value);
}

export function createGLTFRenderSource(
  resources: Pick<GLTFRenderResources, "scene" | "geometryLibrary" | "materialLibrary" | "morphTargetLibrary" | "bounds">,
  options: GLTFRenderSourceOptions = {}
): RenderSource {
  const qualityPreset = options.qualityPreset ?? "studio-preview";
  const environmentLighting = options.environmentLighting === false
    ? false
    : options.environmentLighting ?? cloneEnvironmentLighting(defaultEnvironmentLightingForPreset(qualityPreset));
  const postprocess = options.postprocess !== undefined
    ? options.postprocess
    : qualityPreset !== "default"
      ? cloneRendererPostprocess(defaultPostprocessForPreset(qualityPreset))
      : undefined;
  return {
    scene: resources.scene,
    geometryLibrary: resources.geometryLibrary,
    materialLibrary: resources.materialLibrary,
    morphTargetLibrary: resources.morphTargetLibrary,
    ...(options.renderItems ? { renderItems: options.renderItems } : {}),
    ...(environmentLighting !== undefined ? { environmentLighting } : {}),
    ...(options.shadowMap ? { shadowMap: options.shadowMap } : {}),
    ...(options.shadow !== undefined ? { shadow: options.shadow } : {}),
    ...(options.collectedLights ? { collectedLights: options.collectedLights } : {}),
    ...(postprocess !== undefined ? { postprocess } : {}),
    ...(options.cameraPolicy ? { cameraPolicy: options.cameraPolicy } : {}),
    ...(options.cameraFrameBounds ? { cameraFrameBounds: options.cameraFrameBounds } : { cameraFrameBounds: resources.bounds }),
    ...(options.cameraFrameOptions ? { cameraFrameOptions: options.cameraFrameOptions } : {}),
    ...(options.cameraPosition ? { cameraPosition: options.cameraPosition } : {}),
    ...(options.frustumCulling !== undefined ? { frustumCulling: options.frustumCulling } : {})
  };
}

export function createGLTFRenderResourceDiagnostics(
  resources: Pick<GLTFRenderResources, "scene" | "geometryLibrary" | "materialLibrary"> & Partial<Pick<GLTFRenderResources, "textureLibrary" | "materialFidelityDiagnostics">>,
  options: GLTFRenderResourceDiagnosticsOptions = {}
): GLTFRenderResourceDiagnostics {
  const label = options.label ?? "gltf-render-resources";
  const textureBackedMaterialNames = new Set<string>();
  const textureSlotDiagnostics = new Map<string, { drawItems: number; materialNames: Set<string>; labels: string[] }>();
  const textureContributionDiagnostics = new Map<string, { drawItems: number; materialNames: Set<string>; labels: string[] }>();
  const suppressedTextureSlotDiagnostics = new Map<string, { drawItems: number; materialNames: Set<string>; labels: string[] }>();
  const shaderActiveTextureSlotDiagnostics = new Map<string, { drawItems: number; materialNames: Set<string>; labels: string[] }>();
  const shaderInactiveTextureSlotDiagnostics = new Map<string, { drawItems: number; materialNames: Set<string>; labels: string[] }>();
  const fallbackWhiteMaterialNames = new Set<string>();
  const skinnedLabels: string[] = [];
  const untexturedSkinnedLabels: string[] = [];
  const fallbackWhiteLabels: string[] = [];
  const missingGeometryLabels: string[] = [];
  const missingMaterialLabels: string[] = [];
  const suspectStaticLabels: string[] = [];
  let drawItems = 0;
  let skinnedDrawItems = 0;
  let texturedDrawItems = 0;
  let baseColorTextureDrawItems = 0;
  let colorBearingTextureDrawItems = 0;
  let surfaceDetailTextureDrawItems = 0;
  let effectiveTextureBackedDrawItems = 0;
  let texturedSkinnedDrawItems = 0;
  let missingGeometryDrawItems = 0;
  let missingMaterialDrawItems = 0;

  resources.scene.updateWorldTransforms();
  for (const { node, renderable } of resources.scene.collectRenderables()) {
    const itemLabel = `${node.name}:${renderable.geometry}`;
    const geometry = resources.geometryLibrary.get(renderable.geometry);
    const material = resources.materialLibrary.get(renderable.material);
    if (!geometry) {
      missingGeometryDrawItems += 1;
      missingGeometryLabels.push(itemLabel);
    }
    if (!material) {
      missingMaterialDrawItems += 1;
      missingMaterialLabels.push(itemLabel);
    }
    if (!geometry || !material) continue;

    drawItems += 1;
    const isSkinned = Boolean(renderable.skinning);
    const validTextureSlots = GLTF_DIAGNOSTIC_TEXTURE_BINDINGS.filter(([, textureParameter, enabledParameter]) =>
      materialHasValidTextureBinding(material, textureParameter, enabledParameter)
    );
    const hasAnyTexture = validTextureSlots.length > 0;
    const hasBaseColorTexture = materialHasValidTextureBinding(material, "u_baseColorTexture", "u_baseColorTextureEnabled");
    if (isSkinned) {
      skinnedDrawItems += 1;
      skinnedLabels.push(itemLabel);
    }
    if (hasAnyTexture) {
      texturedDrawItems += 1;
      textureBackedMaterialNames.add(material.name);
    }
    let hasEffectiveBaseColorTexture = false;
    let hasColorBearingTexture = false;
    let hasSurfaceDetailTexture = false;
    for (const [slot] of validTextureSlots) {
      addTextureSlotDiagnostic(textureSlotDiagnostics, slot, material.name, itemLabel);
      const shaderActive = materialSamplesTextureSlot(material, slot);
      const shaderSlotMap = shaderActive ? shaderActiveTextureSlotDiagnostics : shaderInactiveTextureSlotDiagnostics;
      addTextureSlotDiagnostic(shaderSlotMap, slot, material.name, itemLabel);
      const contribution = shaderActive ? textureContributionForSlot(material, slot) : "suppressed";
      if (contribution === "color-bearing") {
        hasColorBearingTexture = true;
        if (slot === "baseColor") hasEffectiveBaseColorTexture = true;
        addTextureContributionDiagnostic(textureContributionDiagnostics, contribution, slot, material.name, itemLabel);
      } else if (contribution === "surface-detail") {
        hasSurfaceDetailTexture = true;
        addTextureContributionDiagnostic(textureContributionDiagnostics, contribution, slot, material.name, itemLabel);
      } else {
        addTextureContributionDiagnostic(suppressedTextureSlotDiagnostics, contribution, slot, material.name, itemLabel);
      }
    }
    if (hasEffectiveBaseColorTexture) baseColorTextureDrawItems += 1;
    if (hasColorBearingTexture) colorBearingTextureDrawItems += 1;
    if (hasSurfaceDetailTexture) surfaceDetailTextureDrawItems += 1;
    if (hasColorBearingTexture || hasSurfaceDetailTexture) effectiveTextureBackedDrawItems += 1;
    if (isSkinned && hasBaseColorTexture) texturedSkinnedDrawItems += 1;
    if (isSkinned && !hasBaseColorTexture) untexturedSkinnedLabels.push(itemLabel);
    if (isFallbackWhiteRuntimeMaterial(material)) {
      fallbackWhiteLabels.push(itemLabel);
      fallbackWhiteMaterialNames.add(material.name);
    }
    if (!isSkinned && options.suspectStaticNodePattern?.test(node.name)) suspectStaticLabels.push(itemLabel);
  }

  return {
    label,
    drawItems,
    skinnedDrawItems,
    texturedDrawItems,
    baseColorTextureDrawItems,
    colorBearingTextureDrawItems,
    surfaceDetailTextureDrawItems,
    effectiveTextureBackedDrawItems,
    unsupportedTexCoordDrawItems: countDistinctMaterialFidelityDrawItems(resources.materialFidelityDiagnostics, "unsupported-texcoord-set"),
    generatedTangentUvMismatchDrawItems: countDistinctMaterialFidelityDrawItems(resources.materialFidelityDiagnostics, "generated-tangent-uv-mismatch"),
    texturedSkinnedDrawItems,
    untexturedSkinnedDrawItems: untexturedSkinnedLabels.length,
    fallbackWhiteDrawItems: fallbackWhiteLabels.length,
    missingGeometryDrawItems,
    missingMaterialDrawItems,
    materialCount: resources.materialLibrary.size,
    textureCount: resources.textureLibrary?.size ?? 0,
    textureBackedMaterialNames: [...textureBackedMaterialNames].sort(),
    textureSlotDiagnostics: [...textureSlotDiagnostics.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([slot, diagnostics]) => ({
        slot: slot as TexturedPBRTextureSlot,
        drawItems: diagnostics.drawItems,
        materialNames: [...diagnostics.materialNames].sort(),
        labels: [...diagnostics.labels].sort()
      })),
    textureContributionDiagnostics: mapTextureContributionDiagnostics(textureContributionDiagnostics),
    suppressedTextureSlotDiagnostics: mapTextureContributionDiagnostics(suppressedTextureSlotDiagnostics),
    materialFidelityDiagnostics: resources.materialFidelityDiagnostics ?? [],
    shaderActiveTextureSlotDiagnostics: [...shaderActiveTextureSlotDiagnostics.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([slot, diagnostics]) => ({
        slot: slot as TexturedPBRTextureSlot,
        drawItems: diagnostics.drawItems,
        materialNames: [...diagnostics.materialNames].sort(),
        labels: [...diagnostics.labels].sort()
      })),
    shaderInactiveTextureSlotDiagnostics: [...shaderInactiveTextureSlotDiagnostics.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([slot, diagnostics]) => ({
        slot: slot as TexturedPBRTextureSlot,
        drawItems: diagnostics.drawItems,
        materialNames: [...diagnostics.materialNames].sort(),
        labels: [...diagnostics.labels].sort()
      })),
    fallbackWhiteMaterialNames: [...fallbackWhiteMaterialNames].sort(),
    skinnedLabels,
    untexturedSkinnedLabels,
    fallbackWhiteLabels,
    missingGeometryLabels,
    missingMaterialLabels,
    suspectStaticLabels
  };
}

function defaultEnvironmentLightingForPreset(preset: GLTFRenderQualityPreset): EnvironmentLightingOptions {
  if (preset === "hdr-studio-preview") return createDefaultGLTFHdrStudioPreviewEnvironmentLighting();
  if (preset === "studio-preview") return DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING;
  return DEFAULT_GLTF_RENDER_ENVIRONMENT_LIGHTING;
}

function addTextureSlotDiagnostic(
  diagnosticsBySlot: Map<string, { drawItems: number; materialNames: Set<string>; labels: string[] }>,
  slot: TexturedPBRTextureSlot,
  materialName: string,
  itemLabel: string
): void {
  let diagnostics = diagnosticsBySlot.get(slot);
  if (!diagnostics) {
    diagnostics = { drawItems: 0, materialNames: new Set(), labels: [] };
    diagnosticsBySlot.set(slot, diagnostics);
  }
  diagnostics.drawItems += 1;
  diagnostics.materialNames.add(materialName);
  diagnostics.labels.push(itemLabel);
}

function addTextureContributionDiagnostic(
  diagnosticsByContributionSlot: Map<string, { drawItems: number; materialNames: Set<string>; labels: string[] }>,
  contribution: GLTFRenderResourceTextureContribution,
  slot: TexturedPBRTextureSlot,
  materialName: string,
  itemLabel: string
): void {
  addTextureSlotDiagnostic(diagnosticsByContributionSlot, `${contribution}:${slot}` as TexturedPBRTextureSlot, materialName, itemLabel);
}

function mapTextureContributionDiagnostics(
  diagnosticsByContributionSlot: Map<string, { drawItems: number; materialNames: Set<string>; labels: string[] }>
): readonly GLTFRenderResourceTextureContributionDiagnostic[] {
  return [...diagnosticsByContributionSlot.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, diagnostics]) => {
      const [contribution, slot] = key.split(":") as [GLTFRenderResourceTextureContribution, TexturedPBRTextureSlot];
      return {
        contribution,
        slot,
        drawItems: diagnostics.drawItems,
        materialNames: [...diagnostics.materialNames].sort(),
        labels: [...diagnostics.labels].sort()
      };
    });
}

function countDistinctMaterialFidelityDrawItems(
  diagnostics: readonly GLTFRenderResourceMaterialFidelityDiagnostic[] | undefined,
  issue: GLTFRenderResourceMaterialFidelityIssue
): number {
  if (!diagnostics) return 0;
  const labels = new Set<string>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.issue !== issue) continue;
    labels.add(`${diagnostic.nodeName}:${diagnostic.geometryKey}:${diagnostic.materialKey}`);
  }
  return labels.size;
}

function textureContributionForSlot(
  material: Material,
  slot: TexturedPBRTextureSlot
): GLTFRenderResourceTextureContribution {
  switch (slot) {
    case "baseColor":
    case "diffuseTransmissionColor":
    case "specularColor":
    case "sheenColor":
      return "color-bearing";
    case "emissive":
      return materialHasEmissiveContribution(material) ? "color-bearing" : "suppressed";
    case "normal":
      return numericMaterialParameter(material, "u_normalScale", 1) > 0.001 ? "surface-detail" : "suppressed";
    case "occlusion":
      return numericMaterialParameter(material, "u_occlusionStrength", 1) > 0.001 ? "surface-detail" : "suppressed";
    default:
      return "surface-detail";
  }
}

function numericMaterialParameter(material: Material, name: string, fallback: number): number {
  const value = material.getParameter(name);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function materialHasEmissiveContribution(material: Material): boolean {
  const strength = numericMaterialParameter(material, "u_emissiveStrength", 1);
  const color = material.getParameter("u_emissiveColor");
  if (strength <= 0.001) return false;
  if ((Array.isArray(color) || ArrayBuffer.isView(color)) && color.length >= 3) {
    return Math.max(Number(color[0]) || 0, Number(color[1]) || 0, Number(color[2]) || 0) > 0.001;
  }
  return true;
}

function materialSamplesTextureSlot(material: Material, slot: TexturedPBRTextureSlot): boolean {
  if (material.shaderKey !== DEFAULT_TEXTURED_PBR_SHADER_NAME) return true;
  return isTexturedPbrTextureSlotShaderActive(slot, material.shaderVariant);
}

function materialHasValidTextureBinding(material: Material, textureParameter: string, enabledParameter: string): boolean {
  const enabled = material.getParameter(enabledParameter);
  const binding = material.getParameter(textureParameter);
  const enabledByMaterial = enabled === undefined || enabled === 1;
  return enabledByMaterial
    && binding instanceof TextureBinding
    && Boolean(binding.texture)
    && !isGeneratedFallbackTexture(binding.texture)
    && binding.validate().ok;
}

function isFallbackWhiteRuntimeMaterial(material: Material): boolean {
  const baseColor = material.getParameter("u_baseColor");
  const metallic = numericMaterialParameter(material, "u_metallic", 0);
  const roughness = numericMaterialParameter(material, "u_roughness", 1);
  const transmission = numericMaterialParameter(material, "u_transmissionFactor", 0)
    + numericMaterialParameter(material, "u_diffuseTransmissionFactor", 0);
  const hasTexture = materialHasValidTextureBinding(material, "u_baseColorTexture", "u_baseColorTextureEnabled")
    || materialHasValidTextureBinding(material, "u_texture", "u_textureEnabled");
  return !hasTexture
    && transmission <= 0.001
    && !(metallic >= 0.9 && roughness <= 0.25)
    && (Array.isArray(baseColor) || ArrayBuffer.isView(baseColor))
    && baseColor.length >= 4
    && baseColor[0] >= 0.98
    && baseColor[1] >= 0.98
    && baseColor[2] >= 0.98
    && baseColor[3] >= 0.98;
}

function isGeneratedFallbackTexture(texture: Texture | null | undefined): boolean {
  if (!texture) return true;
  return /^default-(?:white|linear-white|flat-normal|metallic-roughness|occlusion|emissive|clearcoat|transmission|diffuse-transmission|volume-thickness|specular|sheen|anisotropy|iridescence)/.test(texture.label);
}

function defaultPostprocessForPreset(preset: Exclude<GLTFRenderQualityPreset, "default">): RendererPostProcessOptions {
  return preset === "hdr-studio-preview"
    ? DEFAULT_GLTF_HDR_STUDIO_PREVIEW_POSTPROCESS
    : DEFAULT_GLTF_STUDIO_PREVIEW_POSTPROCESS;
}

function cloneEnvironmentLighting(environment: EnvironmentLightingOptions): EnvironmentLightingOptions {
  return {
    color: [...environment.color] as [number, number, number],
    intensity: environment.intensity,
    ...(environment.proceduralMap
      ? {
          proceduralMap: {
            skyColor: [...environment.proceduralMap.skyColor] as [number, number, number],
            horizonColor: [...environment.proceduralMap.horizonColor] as [number, number, number],
            groundColor: [...environment.proceduralMap.groundColor] as [number, number, number],
            specularColor: [...environment.proceduralMap.specularColor] as [number, number, number],
            intensity: environment.proceduralMap.intensity,
            specularIntensity: environment.proceduralMap.specularIntensity
          }
        }
      : {}),
    ...(environment.environmentMapTexture ? { environmentMapTexture: environment.environmentMapTexture } : {}),
    ...(environment.environmentCubeMapTexture ? { environmentCubeMapTexture: environment.environmentCubeMapTexture } : {}),
    ...(environment.environmentMapIntensity !== undefined ? { environmentMapIntensity: environment.environmentMapIntensity } : {}),
    ...(environment.environmentMapSpecularIntensity !== undefined ? { environmentMapSpecularIntensity: environment.environmentMapSpecularIntensity } : {}),
    ...(environment.environmentMapRotation !== undefined ? { environmentMapRotation: environment.environmentMapRotation } : {}),
    ...(environment.environmentMapMipCount !== undefined ? { environmentMapMipCount: environment.environmentMapMipCount } : {}),
    ...(environment.environmentMapEncoding ? { environmentMapEncoding: environment.environmentMapEncoding } : {}),
    ...(environment.environmentBrdfLutTexture ? { environmentBrdfLutTexture: environment.environmentBrdfLutTexture } : {})
  };
}

function cloneRendererPostprocess(postprocess: RendererPostProcessOptions): RendererPostProcessOptions {
  return {
    ...(postprocess.targetFormat ? { targetFormat: postprocess.targetFormat } : {}),
    ...(postprocess.toneMapping !== undefined
      ? { toneMapping: typeof postprocess.toneMapping === "object" ? { ...postprocess.toneMapping } : postprocess.toneMapping }
      : {}),
    ...(postprocess.colorGrade !== undefined
      ? { colorGrade: typeof postprocess.colorGrade === "object" ? { ...postprocess.colorGrade } : postprocess.colorGrade }
      : {}),
    ...(postprocess.bloom !== undefined
      ? { bloom: typeof postprocess.bloom === "object" ? { ...postprocess.bloom } : postprocess.bloom }
      : {}),
    ...(postprocess.chromaticAberration !== undefined
      ? { chromaticAberration: typeof postprocess.chromaticAberration === "object" ? { ...postprocess.chromaticAberration } : postprocess.chromaticAberration }
      : {}),
    ...(postprocess.filmGrain !== undefined
      ? { filmGrain: typeof postprocess.filmGrain === "object" ? { ...postprocess.filmGrain } : postprocess.filmGrain }
      : {}),
    ...(postprocess.depthOfField !== undefined
      ? { depthOfField: postprocess.depthOfField === false ? false : { ...postprocess.depthOfField } }
      : {}),
    ...(postprocess.motionBlur !== undefined
      ? { motionBlur: postprocess.motionBlur === false ? false : { ...postprocess.motionBlur } }
      : {}),
    ...(postprocess.ssao !== undefined
      ? { ssao: postprocess.ssao === false ? false : { ...postprocess.ssao } }
      : {}),
    ...(postprocess.ssr !== undefined
      ? { ssr: postprocess.ssr === false ? false : { ...postprocess.ssr } }
      : {}),
    ...(postprocess.taa !== undefined
      ? { taa: postprocess.taa === false ? false : { ...postprocess.taa } }
      : {}),
    ...(postprocess.outline !== undefined
      ? { outline: typeof postprocess.outline === "object" ? { ...postprocess.outline } : postprocess.outline }
      : {}),
    ...(postprocess.fxaa !== undefined
      ? { fxaa: typeof postprocess.fxaa === "object" ? { ...postprocess.fxaa } : postprocess.fxaa }
      : {})
  };
}

function defaultGLTFCameraMinDistance(bounds: CameraFrameBounds): number {
  const sizeX = Math.max(0, bounds.max[0] - bounds.min[0]);
  const sizeY = Math.max(0, bounds.max[1] - bounds.min[1]);
  const sizeZ = Math.max(0, bounds.max[2] - bounds.min[2]);
  const diagonal = Math.hypot(sizeX, sizeY, sizeZ);
  return Math.max(1.2, diagonal * 0.5);
}

function defaultGLTFCameraFrameOptions(
  bounds: CameraFrameBounds,
  overrides: PerspectiveCameraFrameOptions = {}
): PerspectiveCameraFrameOptions {
  return {
    ...DEFAULT_GLTF_STUDIO_PREVIEW_FRAME,
    minDistance: defaultGLTFCameraMinDistance(bounds),
    ...overrides
  };
}

function computeGLTFRenderResourceBounds(
  scene: GLTFRenderResources["scene"],
  geometryLibrary: ReadonlyMap<string, Geometry>,
  morphTargetLibrary: ReadonlyMap<string, readonly MorphTargetDelta[]>
): CameraFrameBounds {
  scene.updateWorldTransforms();
  let bounds: SceneBounds3 | undefined;
  for (const { node, renderable } of scene.collectRenderables()) {
    const geometry = geometryLibrary.get(renderable.geometry);
    if (!geometry) continue;
    const envelope = computeSkinnedMorphTargetEnvelopeBounds(geometry, renderable.skinning, morphTargetLibrary.get(renderable.geometry));
    const local = new SceneBounds3(
      [envelope.min[0], envelope.min[1], envelope.min[2]],
      [envelope.max[0], envelope.max[1], envelope.max[2]]
    );
    const worldBounds = renderable.instanceTransforms
      ? transformInstancedBounds(local, node.transform.worldMatrix, renderable.instanceTransforms)
      : local.transform(node.transform.worldMatrix);
    bounds = bounds ? bounds.union(worldBounds) : worldBounds;
  }
  if (!bounds || bounds.isEmpty()) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  return {
    min: [bounds.min[0], bounds.min[1], bounds.min[2]],
    max: [bounds.max[0], bounds.max[1], bounds.max[2]]
  };
}

function transformInstancedBounds(
  local: SceneBounds3,
  modelMatrix: Mat4,
  instanceTransforms: Float32Array | readonly number[]
): SceneBounds3 {
  let bounds = new SceneBounds3();
  for (let offset = 0; offset + 15 < instanceTransforms.length; offset += 16) {
    bounds = bounds.union(local.transform(multiplyMat4(modelMatrix, toMat4(instanceTransforms.slice(offset, offset + 16)))));
  }
  return bounds;
}

function toMat4(values: Float32Array | readonly number[]): Mat4 {
  const array = Array.from(values);
  if (array.length !== 16 || array.some((value) => !Number.isFinite(value))) {
    throw new Error("glTF render resource instance transform must be a finite mat4.");
  }
  return array as Mat4;
}

function disposeGLTFRenderResourceMaps(
  ownedGeometries: Set<Geometry>,
  ownedMaterials: Set<Material>,
  privateTextures: Set<Texture>,
  releaseShared: () => void
): void {
  const errors: unknown[] = [];
  const cleanup = (work: () => void): void => { try { work(); } catch (error) { errors.push(error); } };
  const cleanupOwned = <T extends { readonly disposed: boolean; dispose(): void }>(owned: Set<T>): void => {
    for (const resource of owned) {
      try {
        if (!resource.disposed) resource.dispose();
        if (!resource.disposed) throw new Error("glTF resource disposal is in progress");
        owned.delete(resource);
      } catch (error) {
        try { if (resource.disposed) owned.delete(resource); } catch { /* Retain an uncertain resource. */ }
        errors.push(error);
      }
    }
  };
  cleanupOwned(ownedGeometries);
  cleanupOwned(ownedMaterials);
  // Fallbacks remain private even when successful decodes use a shared lease.
  cleanupOwned(privateTextures);
  cleanup(releaseShared);
  if (errors.length) throw new AggregateError(errors, "glTF resource disposal failed");
}

function materialForMesh(
  asset: GLTFAsset,
  mesh: GLTFMeshAsset,
  materialVariant: string | undefined
): GLTFMaterialAsset | undefined {
  const materialIndex = materialVariant
    ? mesh.materialVariants.find((mapping) => mapping.variant === materialVariant)?.materialIndex ?? mesh.materialIndex
    : mesh.materialIndex;
  return materialIndex === undefined ? undefined : asset.materials[materialIndex];
}

interface GLTFTangentGenerationContext {
  readonly useMikkTSpace: boolean;
  readonly mikkTSpaceWanted: boolean;
}

async function createGeometry(
  mesh: GLTFMeshAsset,
  materials: readonly (GLTFMaterialAsset | undefined)[],
  tangentGeneration: GLTFTangentGenerationContext,
  loadIssues: GLTFRenderResourceLoadIssue[]
): Promise<Geometry> {
  // Variant switches reuse this geometry. Include every selectable material's
  // attribute needs, not only those of the material active during creation.
  const usedTexCoordSets = new Set(materials.flatMap((material) => [...usedRenderTexCoordSets(material)]));
  const material = materials[0];
  const texcoords = selectRenderTexcoords(mesh, material, 0);
  const texcoords1 = usedTexCoordSets.has(1) ? selectRenderTexcoords(mesh, material, 1) : [];
  const needsUv = usedTexCoordSets.size > 0 || texcoords.length > 0;
  const needsUv1 = texcoords1.length > 0;
  const needsNormal = mesh.normals.length > 0 || needsUv || materials.some(materialNeedsNormals);
  const needsTangent = mesh.tangents.length > 0 || (needsUv && materials.some((candidate) => materialNeedsTangents(candidate) || (candidate !== undefined && !candidate.unlit)));
  const needsColor = mesh.colors.length > 0;
  const needsSkinning = mesh.skinIndex !== undefined || mesh.joints.length > 0 || mesh.weights.length > 0;
  const format = vertexFormatForGLTFMesh(needsNormal, needsUv, needsTangent, needsUv1, needsColor, needsSkinning);
  const renderNormals = needsNormal && mesh.normals.length === 0
    ? generateMeshNormals(mesh.positions, mesh.indices, mesh.topology)
    : mesh.normals;
  // Generate the tangent frame in the UV space the normal map samples
  // (glTF 2.0 normalTextureInfo.texCoord). A TEXCOORD_1 normal map on a mesh
  // without TEXCOORD_0 must not derive tangents from the empty set 0.
  const tangentTexCoord = material?.normalTexture?.texCoord ?? material?.clearcoat?.normalTexture?.texCoord ?? 0;
  const tangentTexcoords = tangentTexCoord === 1 && texcoords1.length > 0 ? texcoords1 : texcoords;
  const renderTangents = needsTangent && mesh.tangents.length === 0
    ? await generateRenderTangents(mesh, tangentTexcoords, renderNormals, tangentGeneration)
    : mesh.tangents;
  /*
   * P5-4: `tangent-derivative-fallback` is reported only when a generated program will
   * actually use the derivative frame — the material needs a tangent frame but the produced
   * vertex format carries no tangent attribute (e.g. a normal-mapped mesh without UVs).
   * A successful MikkTSpace->legacy fallback still produces the generated-attribute path.
   */
  if (tangentGeneration.mikkTSpaceWanted && materials.some(materialNeedsTangents) && !format.hasAttribute("tangent")) {
    loadIssues.push({
      code: "tangent-derivative-fallback",
      detail: `glTF mesh ${mesh.name}: material needs a tangent frame but no tangent attribute was produced; the generated program uses the derivative frame.`
    });
  }
  const vertices = new VertexBuffer(format, mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 1) {
    vertices.setAttribute(index, "position", mesh.positions[index]!);
    if (format.hasAttribute("normal")) {
      vertices.setAttribute(index, "normal", renderNormals[index] ?? [0, 0, 1]);
    }
    if (format.hasAttribute("tangent")) {
      vertices.setAttribute(index, "tangent", renderTangents[index] ?? fallbackTangent(renderNormals[index]));
    }
    if (format.hasAttribute("uv")) {
      vertices.setAttribute(index, "uv", texcoords[index] ?? [0, 0]);
    }
    if (format.hasAttribute("uv1")) {
      vertices.setAttribute(index, "uv1", texcoords1[index] ?? texcoords[index] ?? [0, 0]);
    }
    if (format.hasAttribute("color")) {
      vertices.setAttribute(index, "color", mesh.colors[index] ?? [1, 1, 1, 1]);
    }
    if (format.hasAttribute("joints")) {
      vertices.setAttribute(index, "joints", mesh.joints[index] ?? [0, 0, 0, 0]);
      vertices.setAttribute(index, "weights", mesh.weights[index] ?? [0, 0, 0, 0]);
    }
  }
  const indices = mesh.indices && mesh.indices.length > 0 ? new IndexBuffer(mesh.indices, mesh.positions.length) : null;
  return new Geometry(vertices, indices, mesh.topology, mesh.geometry.bounds);
}

function generateMeshNormals(
  positions: readonly (readonly [number, number, number])[],
  indices: readonly number[] | undefined,
  topology: Geometry["topology"]
): readonly (readonly [number, number, number])[] {
  const normals = Array.from({ length: positions.length }, () => [0, 0, 0] as [number, number, number]);
  if (topology !== "triangles") {
    return normals.map(() => [0, 0, 1] as const);
  }
  const triangleIndices = indices && indices.length > 0 ? indices : positions.map((_, index) => index);
  for (let offset = 0; offset + 2 < triangleIndices.length; offset += 3) {
    const ia = triangleIndices[offset]!;
    const ib = triangleIndices[offset + 1]!;
    const ic = triangleIndices[offset + 2]!;
    const a = positions[ia];
    const b = positions[ib];
    const c = positions[ic];
    if (!a || !b || !c) continue;
    const normal = cross3(subtract3(b, a), subtract3(c, a));
    normals[ia] = add3(normals[ia]!, normal);
    normals[ib] = add3(normals[ib]!, normal);
    normals[ic] = add3(normals[ic]!, normal);
  }
  return normals.map((normal) => normalize3(normal));
}

/**
 * P5-4: tangent generation for a mesh with no authored TANGENT. MikkTSpace when the lane flag
 * asked for it and the module is registered; otherwise the legacy triangle-average generator.
 * The `tangent-derivative-fallback` load issue is reported by the caller — only when the
 * produced vertex format leaves a tangent-needing program on the derivative frame.
 */
async function generateRenderTangents(
  mesh: GLTFMeshAsset,
  texcoords: readonly (readonly [number, number])[],
  renderNormals: readonly (readonly [number, number, number])[],
  tangentGeneration: GLTFTangentGenerationContext
): Promise<readonly (readonly [number, number, number, number])[]> {
  if (tangentGeneration.useMikkTSpace) {
    try {
      const generated = await generateMikkTSpaceTangents({
        positions: flatten3(mesh.positions),
        normals: flatten3(renderNormals),
        uvs: flatten2(texcoords),
        ...(mesh.indices && mesh.indices.length > 0 ? { indices: new Uint32Array(mesh.indices) } : {})
      });
      // The MikkTSpace helper unwelds indexed input (output is per-index, xyzw); scatter back
      // per vertex — last write wins, matching how indexed TANGENT attributes behave.
      const count = mesh.positions.length;
      const rows: [number, number, number, number][] = Array.from({ length: count }, () => [0, 0, 0, 1]);
      if (mesh.indices && mesh.indices.length > 0) {
        mesh.indices.forEach((vertexIndex, i) => {
          rows[vertexIndex] = [generated[i * 4] ?? 0, generated[i * 4 + 1] ?? 0, generated[i * 4 + 2] ?? 0, generated[i * 4 + 3] ?? 1];
        });
      } else {
        for (let i = 0; i < count; i += 1) {
          rows[i] = [generated[i * 4] ?? 0, generated[i * 4 + 1] ?? 0, generated[i * 4 + 2] ?? 0, generated[i * 4 + 3] ?? 1];
        }
      }
      return rows;
    } catch {
      // MikkTSpace failure falls back to the legacy generator silently — the program still
      // runs the generated-attribute path (P5-4 reports the issue only for the derivative path).
    }
  }
  return generateMeshTangents(mesh.positions, texcoords, mesh.indices, mesh.topology, renderNormals);
}

function flatten3(rows: readonly (readonly [number, number, number])[]): Float32Array {
  const flat = new Float32Array(rows.length * 3);
  rows.forEach(([x, y, z], i) => { flat[i * 3] = x; flat[i * 3 + 1] = y; flat[i * 3 + 2] = z; });
  return flat;
}

function flatten2(rows: readonly (readonly [number, number])[]): Float32Array {
  const flat = new Float32Array(rows.length * 2);
  rows.forEach(([x, y], i) => { flat[i * 2] = x; flat[i * 2 + 1] = y; });
  return flat;
}

function generateMeshTangents(
  positions: readonly (readonly [number, number, number])[],
  texcoords: readonly (readonly [number, number])[],
  indices: readonly number[] | undefined,
  topology: Geometry["topology"],
  normals: readonly (readonly [number, number, number])[]
): readonly (readonly [number, number, number, number])[] {
  const tangents = Array.from({ length: positions.length }, () => [0, 0, 0] as [number, number, number]);
  const bitangents = Array.from({ length: positions.length }, () => [0, 0, 0] as [number, number, number]);
  if (topology !== "triangles" || texcoords.length === 0) {
    return normals.map((normal) => fallbackTangent(normal));
  }
  const triangleIndices = indices && indices.length > 0 ? indices : positions.map((_, index) => index);
  for (let offset = 0; offset + 2 < triangleIndices.length; offset += 3) {
    const ia = triangleIndices[offset]!;
    const ib = triangleIndices[offset + 1]!;
    const ic = triangleIndices[offset + 2]!;
    const a = positions[ia];
    const b = positions[ib];
    const c = positions[ic];
    const uva = texcoords[ia];
    const uvb = texcoords[ib];
    const uvc = texcoords[ic];
    if (!a || !b || !c || !uva || !uvb || !uvc) continue;
    const edge1 = subtract3(b, a);
    const edge2 = subtract3(c, a);
    const duv1: readonly [number, number] = [uvb[0] - uva[0], uvb[1] - uva[1]];
    const duv2: readonly [number, number] = [uvc[0] - uva[0], uvc[1] - uva[1]];
    const determinant = duv1[0] * duv2[1] - duv2[0] * duv1[1];
    if (Math.abs(determinant) <= 1e-8) continue;
    const scale = 1 / determinant;
    const tangent = scale3(subtract3(scale3(edge1, duv2[1]), scale3(edge2, duv1[1])), scale);
    const bitangent = scale3(subtract3(scale3(edge2, duv1[0]), scale3(edge1, duv2[0])), scale);
    tangents[ia] = add3(tangents[ia]!, tangent);
    tangents[ib] = add3(tangents[ib]!, tangent);
    tangents[ic] = add3(tangents[ic]!, tangent);
    bitangents[ia] = add3(bitangents[ia]!, bitangent);
    bitangents[ib] = add3(bitangents[ib]!, bitangent);
    bitangents[ic] = add3(bitangents[ic]!, bitangent);
  }
  return tangents.map((tangent, index) => {
    const normal = normals[index] ?? [0, 0, 1];
    const orthogonal = subtract3(tangent, scale3(normal, dot3(normal, tangent)));
    if (length3(orthogonal) <= 1e-8) return fallbackTangent(normal);
    const normalized = normalize3(orthogonal);
    const handedness = dot3(cross3(normal, normalized), bitangents[index] ?? [0, 1, 0]) < 0 ? -1 : 1;
    return [normalized[0], normalized[1], normalized[2], handedness] as const;
  });
}

function subtract3(left: readonly [number, number, number], right: readonly [number, number, number]): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function add3(left: readonly [number, number, number], right: readonly [number, number, number]): [number, number, number] {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function scale3(value: readonly [number, number, number], scalar: number): [number, number, number] {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function dot3(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross3(left: readonly [number, number, number], right: readonly [number, number, number]): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function length3(value: readonly [number, number, number]): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize3(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = length3(value);
  if (length <= 1e-8) return [0, 0, 1];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function fallbackTangent(normal: readonly [number, number, number] | undefined): readonly [number, number, number, number] {
  const n = normal ?? [0, 0, 1];
  const reference: readonly [number, number, number] = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const tangent = normalize3(cross3(reference, n));
  return [tangent[0], tangent[1], tangent[2], 1];
}

function selectRenderTexcoords(
  mesh: GLTFMeshAsset,
  material: GLTFMaterialAsset | undefined,
  setIndex: number
): readonly (readonly [number, number])[] {
  const selected = mesh.texcoordSets[setIndex];
  if (selected && selected.length > 0) return selected;
  if (setIndex > 0) {
    throw new Error(`glTF mesh ${mesh.name} material ${mesh.material} references missing TEXCOORD_${setIndex}`);
  }
  return mesh.texcoords;
}

function usedRenderTexCoordSets(material: GLTFMaterialAsset | undefined): ReadonlySet<number> {
  const sets = new Set<number>();
  const infos = material ? materialTextureInfos(material) : [];
  for (const info of infos) {
    if (info.texCoord <= 1) sets.add(info.texCoord);
  }
  if (sets.size === 0 && infos.length > 0) sets.add(0);
  return sets;
}

function materialTextureInfos(material: GLTFMaterialAsset): readonly GLTFResolvedTextureInfo[] {
  return materialTextureInfosBySlot(material).map(({ info }) => info);
}

function materialTextureInfosBySlot(material: GLTFMaterialAsset): readonly {
  readonly slot: TexturedPBRTextureSlot | "diffuseRoughness" | "bump";
  readonly info: GLTFResolvedTextureInfo;
  readonly tangentSpace: boolean;
}[] {
  return [
    material.baseColorTexture ? { slot: "baseColor", info: material.baseColorTexture, tangentSpace: false } : undefined,
    material.metallicRoughnessTexture ? { slot: "metallicRoughness", info: material.metallicRoughnessTexture, tangentSpace: false } : undefined,
    material.normalTexture ? { slot: "normal", info: material.normalTexture, tangentSpace: true } : undefined,
    material.diffuseRoughness?.texture ? { slot: "diffuseRoughness", info: material.diffuseRoughness.texture, tangentSpace: false } : undefined,
    material.bump?.texture ? { slot: "bump", info: material.bump.texture, tangentSpace: false } : undefined,
    material.occlusionTexture ? { slot: "occlusion", info: material.occlusionTexture, tangentSpace: false } : undefined,
    material.emissiveTexture ? { slot: "emissive", info: material.emissiveTexture, tangentSpace: false } : undefined,
    material.clearcoat?.texture ? { slot: "clearcoat", info: material.clearcoat.texture, tangentSpace: false } : undefined,
    material.clearcoat?.roughnessTexture ? { slot: "clearcoatRoughness", info: material.clearcoat.roughnessTexture, tangentSpace: false } : undefined,
    material.clearcoat?.normalTexture ? { slot: "clearcoatNormal", info: material.clearcoat.normalTexture, tangentSpace: true } : undefined,
    material.transmission?.texture ? { slot: "transmission", info: material.transmission.texture, tangentSpace: false } : undefined,
    material.diffuseTransmission?.texture ? { slot: "diffuseTransmission", info: material.diffuseTransmission.texture, tangentSpace: false } : undefined,
    material.diffuseTransmission?.colorTexture ? { slot: "diffuseTransmissionColor", info: material.diffuseTransmission.colorTexture, tangentSpace: false } : undefined,
    material.volume?.thicknessTexture ? { slot: "volumeThickness", info: material.volume.thicknessTexture, tangentSpace: false } : undefined,
    material.specular?.texture ? { slot: "specular", info: material.specular.texture, tangentSpace: false } : undefined,
    material.specular?.colorTexture ? { slot: "specularColor", info: material.specular.colorTexture, tangentSpace: false } : undefined,
    material.sheen?.colorTexture ? { slot: "sheenColor", info: material.sheen.colorTexture, tangentSpace: false } : undefined,
    material.sheen?.roughnessTexture ? { slot: "sheenRoughness", info: material.sheen.roughnessTexture, tangentSpace: false } : undefined,
    material.anisotropy?.texture ? { slot: "anisotropy", info: material.anisotropy.texture, tangentSpace: false } : undefined,
    material.iridescence?.texture ? { slot: "iridescence", info: material.iridescence.texture, tangentSpace: false } : undefined,
    material.iridescence?.thicknessTexture ? { slot: "iridescenceThickness", info: material.iridescence.thicknessTexture, tangentSpace: false } : undefined
  ].filter((entry): entry is {
    readonly slot: TexturedPBRTextureSlot | "diffuseRoughness" | "bump";
    readonly info: GLTFResolvedTextureInfo;
    readonly tangentSpace: boolean;
  } => entry !== undefined);
}

function materialNeedsNormals(material: GLTFMaterialAsset | undefined): boolean {
  return material === undefined || !material.unlit;
}

function materialNeedsTangents(material: GLTFMaterialAsset | undefined): boolean {
  return Boolean(material?.normalTexture || material?.clearcoat?.normalTexture);
}

function vertexFormatForGLTFMesh(needsNormal: boolean, needsUv: boolean, needsTangent: boolean, needsUv1: boolean, needsColor: boolean, needsSkinning: boolean): VertexFormat {
  if (!needsColor && !needsSkinning && !needsUv1) {
    if (needsUv && needsTangent) return VertexFormat.P3N3T4T2;
    if (needsUv) return needsNormal ? VertexFormat.P3N3T2 : new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "uv", components: 2, offset: 12 }
    ], 20);
    return needsNormal ? VertexFormat.P3N3 : VertexFormat.P3;
  }
  if (!needsColor && needsSkinning && !needsUv) return needsNormal ? VertexFormat.P3N3J4W4 : VertexFormat.P3J4W4;
  const attributes: VertexAttributeDescriptor[] = [{ semantic: "position", components: 3, offset: 0 }];
  let offset = 12;
  if (needsNormal) {
    attributes.push({ semantic: "normal", components: 3, offset });
    offset += 12;
  }
  if (needsTangent) {
    attributes.push({ semantic: "tangent", components: 4, offset });
    offset += 16;
  }
  if (needsUv) {
    attributes.push({ semantic: "uv", components: 2, offset });
    offset += 8;
  }
  if (needsUv1) {
    attributes.push({ semantic: "uv1", components: 2, offset });
    offset += 8;
  }
  if (needsColor) {
    attributes.push({ semantic: "color", components: 4, offset });
    offset += 16;
  }
  if (needsSkinning) {
    attributes.push({ semantic: "joints", components: 4, offset });
    offset += 16;
    attributes.push({ semantic: "weights", components: 4, offset });
    offset += 16;
  }
  return new VertexFormat(attributes, offset);
}

/**
 * A stable key identifying a glTF material definition, ignoring only its name.
 *
 * Two materials share a runtime instance only when this key matches, so every factor, texture
 * reference, alpha mode, and extension must agree. The runtime contract is folded in because the same
 * definition under a different contract (skinned versus instanced, for example) compiles differently.
 */
function identicalMaterialKey(material: { readonly name?: string }, contract: unknown): string {
  const definition = { ...(material as Record<string, unknown>) };
  delete definition.name;
  return `${stableJson(definition)}|${stableJson(contract)}`;
}

/** JSON with deterministically ordered keys, so key equality does not depend on property order. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return nested;
  });
}

async function createMaterial(
  asset: GLTFAsset,
  material: GLTFMaterialAsset,
  getTexture: GLTFTextureGetter,
  options: { readonly skinned?: boolean; readonly instanced?: boolean } = {},
  renderStateOverrides: readonly GLTFMaterialRenderStateOverride[] = [],
  materialsR185 = false,
  qrTransmission?: Omit<GLTFTransmissionQrContext, "materialsR185">,
  retainFailedMaterial?: (material: Material) => void
): Promise<Material> {
  const qr: GLTFTransmissionQrContext = { ...qrTransmission, materialsR185 };
  const renderState = renderStateForGLTFMaterial(material, renderStateOverrides, materialsR185, qrTransmission);
  // Extension bindings can fail after construction; release the partial material.
  const finishMaterial = async (runtimeMaterial: Material): Promise<Material> => {
    try {
      applyAlphaCutoff(runtimeMaterial, material);
      await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture, qr);
      return runtimeMaterial;
    } catch (error) {
      try { runtimeMaterial.dispose(); }
      catch (cleanupError) {
        retainFailedMaterial?.(runtimeMaterial);
        throw new AggregateError([error, cleanupError], "glTF material creation and cleanup failed");
      }
      throw error;
    }
  };
  if (options.skinned && !material.unlit) {
    const [
      baseColorTexture,
      normalTexture,
      metallicRoughnessTexture,
      occlusionTexture,
      emissiveTexture,
      diffuseRoughnessTexture,
      bumpTexture,
      clearcoatTexture,
      clearcoatNormalTexture,
      sheenColorTexture,
      sheenRoughnessTexture,
      transmissionTexture,
      iridescenceTexture,
      iridescenceThicknessTexture,
      anisotropyTexture,
      volumeThicknessTexture
    ] = await Promise.all([
      material.baseColorTexture
        ? createTextureBinding(asset, material.baseColorTexture, "srgb", getTexture, "u_baseColorTexture")
        : Promise.resolve(undefined),
      material.normalTexture
        ? createTextureBinding(asset, material.normalTexture, "linear", getTexture, "u_normalTexture", createNormalSampler(asset, material))
        : Promise.resolve(undefined),
      material.metallicRoughnessTexture
        ? createTextureBinding(asset, material.metallicRoughnessTexture, "linear", getTexture, "u_metallicRoughnessTexture")
        : Promise.resolve(undefined),
      material.occlusionTexture
        ? createTextureBinding(asset, material.occlusionTexture, "linear", getTexture, "u_occlusionTexture")
        : Promise.resolve(undefined),
      material.emissiveTexture
        ? createTextureBinding(asset, material.emissiveTexture, "srgb", getTexture, "u_emissiveTexture")
        : Promise.resolve(undefined),
      material.diffuseRoughness?.texture
        ? createTextureBinding(asset, material.diffuseRoughness.texture, "linear", getTexture, "u_diffuseRoughnessTexture")
        : Promise.resolve(undefined),
      material.bump?.texture
        ? createTextureBinding(asset, material.bump.texture, "linear", getTexture, "u_bumpTexture")
        : Promise.resolve(undefined),
      material.clearcoat?.texture
        ? createTextureBinding(asset, material.clearcoat.texture, "linear", getTexture, "u_clearcoatTexture")
        : Promise.resolve(undefined),
      material.clearcoat?.normalTexture
        ? createTextureBinding(asset, material.clearcoat.normalTexture, "linear", getTexture, "u_clearcoatNormalTexture", createNormalSamplerForInfo(asset, material.clearcoat.normalTexture))
        : Promise.resolve(undefined),
      material.sheen?.colorTexture
        ? createTextureBinding(asset, material.sheen.colorTexture, "srgb", getTexture, "u_sheenColorTexture")
        : Promise.resolve(undefined),
      material.sheen?.roughnessTexture
        ? createTextureBinding(asset, material.sheen.roughnessTexture, "linear", getTexture, "u_sheenRoughnessTexture")
        : Promise.resolve(undefined),
      material.transmission?.texture
        ? createTextureBinding(asset, material.transmission.texture, "linear", getTexture, "u_transmissionTexture")
        : Promise.resolve(undefined),
      material.iridescence?.texture
        ? createTextureBinding(asset, material.iridescence.texture, "linear", getTexture, "u_iridescenceTexture")
        : Promise.resolve(undefined),
      material.iridescence?.thicknessTexture
        ? createTextureBinding(asset, material.iridescence.thicknessTexture, "linear", getTexture, "u_iridescenceThicknessTexture")
        : Promise.resolve(undefined),
      material.anisotropy?.texture
        ? createTextureBinding(asset, material.anisotropy.texture, "linear", getTexture, "u_anisotropyTexture")
        : Promise.resolve(undefined),
      material.volume?.thicknessTexture
        ? createTextureBinding(asset, material.volume.thicknessTexture, "linear", getTexture, "u_volumeThicknessTexture")
        : Promise.resolve(undefined)
    ]);
    const runtimeMaterial = new SkinnedLitMaterial({
      name: material.name,
      renderState,
      baseColor: material.baseColorFactor,
      baseColorTexture,
      baseColorTextureOffset: material.baseColorTexture?.transform?.offset,
      baseColorTextureScale: material.baseColorTexture?.transform?.scale,
      baseColorTextureRotation: material.baseColorTexture?.transform?.rotation,
      normalTexture,
      normalScale: renderNormalScale(asset, material),
      metallicRoughnessTexture,
      occlusionTexture,
      occlusionStrength: material.occlusionTexture?.strength,
      emissiveTexture,
      diffuseRoughness: material.diffuseRoughness?.factor ?? 0,
      diffuseRoughnessTexture,
      diffuseRoughnessTextureTexCoord: renderTexCoord(material.diffuseRoughness?.texture?.texCoord ?? 0),
      bumpFactor: material.bump?.factor ?? 0,
      bumpTexture,
      bumpTextureTexCoord: renderTexCoord(material.bump?.texture?.texCoord ?? 0),
      metallic: material.metallicFactor,
      roughness: material.roughnessFactor,
      emissiveColor: material.emissiveFactor,
      emissiveStrength: material.emissiveStrength,
      clearcoatTexture,
      clearcoatNormalTexture,
      sheenColorTexture,
      sheenRoughnessTexture,
      transmissionTexture,
      iridescenceTexture,
      iridescenceThicknessTexture,
      anisotropyTexture,
      volumeThicknessTexture,
      ...pbrExtensionScalarOptions(material, qr)
    });
    return finishMaterial(runtimeMaterial);
  }
  if (options.instanced && material.unlit && !material.baseColorTexture) {
    const runtimeMaterial = new InstancedUnlitMaterial({
      name: material.name,
      color: material.baseColorFactor,
      renderState
    });
    return finishMaterial(runtimeMaterial);
  }
  if (material.unlit) {
    if (material.baseColorTexture) {
      const texture = await getTexture(material.baseColorTexture, "srgb");
      const runtimeMaterial = new TexturedUnlitMaterial({
        name: material.name,
        texture,
        sampler: createSampler(asset.textures[material.baseColorTexture.texture]),
        textureTransform: material.baseColorTexture.transform,
        color: material.baseColorFactor,
        renderState
      });
      return finishMaterial(runtimeMaterial);
    }
    const runtimeMaterial = new UnlitMaterial({
      name: material.name,
      color: material.baseColorFactor,
      renderState
    });
    return finishMaterial(runtimeMaterial);
  }
  if (options.instanced && !requiresTexturedPBRMaterial(material, false)) {
    const diffuseRoughnessTexture = material.diffuseRoughness?.texture
      ? await createTextureBinding(asset, material.diffuseRoughness.texture, "linear", getTexture, "u_diffuseRoughnessTexture") : undefined;
    const bumpTexture = material.bump?.texture
      ? await createTextureBinding(asset, material.bump.texture, "linear", getTexture, "u_bumpTexture") : undefined;
    const runtimeMaterial = new InstancedPBRMaterial({
      name: material.name,
      renderState,
      baseColor: material.baseColorFactor,
      metallic: material.metallicFactor,
      roughness: material.roughnessFactor,
      emissiveColor: material.emissiveFactor,
      emissiveStrength: material.emissiveStrength,
      diffuseRoughness: material.diffuseRoughness?.factor ?? 0,
      diffuseRoughnessTexture,
      diffuseRoughnessTextureTexCoord: renderTexCoord(material.diffuseRoughness?.texture?.texCoord ?? 0),
      bumpFactor: material.bump?.factor ?? 0,
      bumpTexture,
      bumpTextureTexCoord: renderTexCoord(material.bump?.texture?.texCoord ?? 0)
    });
    return finishMaterial(runtimeMaterial);
  }
  if (requiresTexturedPBRMaterial(material)) {
    const baseColorTexture = material.baseColorTexture ? await getTexture(material.baseColorTexture, "srgb") : undefined;
    const normalTexture = material.normalTexture ? await getTexture(material.normalTexture, "linear", "normal") : undefined;
    const metallicRoughnessTexture = material.metallicRoughnessTexture ? await getTexture(material.metallicRoughnessTexture, "linear") : undefined;
    const occlusionTexture = material.occlusionTexture ? await getTexture(material.occlusionTexture, "linear") : undefined;
    const emissiveTexture = material.emissiveTexture ? await getTexture(material.emissiveTexture, "srgb") : undefined;
    const diffuseRoughnessTexture = material.diffuseRoughness?.texture ? await getTexture(material.diffuseRoughness.texture, "linear") : undefined;
    const bumpTexture = material.bump?.texture ? await getTexture(material.bump.texture, "linear", "bump") : undefined;
    const extensionTextureOptions = await pbrExtensionTextureOptions(asset, material, getTexture);
    const runtimeMaterial = new TexturedPBRMaterial({
      name: material.name,
      renderState,
      baseColor: renderPbrBaseColorFactor(material, qr),
      metallic: material.metallicFactor,
      roughness: renderPbrRoughnessFactor(material, qr),
      emissiveColor: material.emissiveFactor,
      emissiveStrength: material.emissiveStrength,
      diffuseRoughness: material.diffuseRoughness?.factor ?? 0,
      diffuseRoughnessTexture,
      diffuseRoughnessSampler: material.diffuseRoughness?.texture ? createSamplerForInfo(asset, material.diffuseRoughness.texture) : undefined,
      diffuseRoughnessTextureTransform: material.diffuseRoughness?.texture?.transform,
      bumpFactor: material.bump?.factor ?? 0,
      bumpTexture,
      bumpSampler: material.bump?.texture ? createSamplerForInfo(asset, material.bump.texture) : undefined,
      bumpTextureTransform: material.bump?.texture?.transform,
      textureTexCoords: pbrTextureTexCoords(material),
      ...pbrExtensionScalarOptions(material, qr),
      ...extensionTextureOptions,
      baseColorTexture,
      baseColorSampler: createSampler(material.baseColorTexture ? asset.textures[material.baseColorTexture.texture] : undefined),
      baseColorTextureTransform: material.baseColorTexture?.transform,
      normalTexture,
      normalSampler: createNormalSampler(asset, material),
      normalTextureTransform: material.normalTexture?.transform,
      normalScale: renderNormalScale(asset, material),
      metallicRoughnessTexture,
      metallicRoughnessSampler: createSampler(material.metallicRoughnessTexture ? asset.textures[material.metallicRoughnessTexture.texture] : undefined),
      metallicRoughnessTextureTransform: material.metallicRoughnessTexture?.transform,
      occlusionTexture,
      occlusionSampler: createSampler(material.occlusionTexture ? asset.textures[material.occlusionTexture.texture] : undefined),
      occlusionTextureTransform: material.occlusionTexture?.transform,
      occlusionStrength: material.occlusionTexture?.strength,
      emissiveTexture,
      emissiveSampler: createSampler(material.emissiveTexture ? asset.textures[material.emissiveTexture.texture] : undefined),
      emissiveTextureTransform: material.emissiveTexture?.transform
    });
    return finishMaterial(runtimeMaterial);
  }
  if (material.baseColorTexture) {
    const texture = await getTexture(material.baseColorTexture, "srgb");
    const runtimeMaterial = new TexturedUnlitMaterial({
      name: material.name,
      texture,
      sampler: createSampler(asset.textures[material.baseColorTexture.texture]),
      textureTransform: material.baseColorTexture.transform,
      color: material.baseColorFactor,
      renderState
    });
    return finishMaterial(runtimeMaterial);
  }
  const runtimeMaterial = new PBRMaterial({
    name: material.name,
    renderState,
    baseColor: renderPbrBaseColorFactor(material, qr),
    metallic: material.metallicFactor,
    roughness: renderPbrRoughnessFactor(material, qr),
    emissiveColor: material.emissiveFactor,
    emissiveStrength: material.emissiveStrength,
    diffuseRoughness: material.diffuseRoughness?.factor ?? 0,
    bumpFactor: material.bump?.factor ?? 0,
    ...pbrExtensionScalarOptions(material, qr)
  });
  return finishMaterial(runtimeMaterial);
}

function createDefaultGLTFMaterial(
  mesh: GLTFMeshAsset,
  options: { readonly instanced?: boolean; readonly skinned?: boolean } = {},
  materialsR185 = false
): Material {
  // Use a neutral light-gray base color instead of glTF-spec white ([1,1,1,1])
  // so missing-material fallbacks do not blow out as bright white artifacts.
  // PRD-04 P2-12/E23: flag-on uses the glTF-spec default ([1,1,1,1], roughness 1).
  // T0-18(a): metallic stays 0, not the spec's 1 — a fully metallic surface has
  // no diffuse response and renders near-black until a C-09 probe/IBL is bound;
  // restore spec metallic once environment lighting is guaranteed on this path.
  const defaults = materialsR185 ? {
    name: mesh.material,
    baseColor: [1, 1, 1, 1] as const,
    metallic: 0,
    roughness: 1,
    environmentIntensity: DEFAULT_PBR_ENVIRONMENT_INTENSITY
  } as const : {
    name: mesh.material,
    baseColor: [0.76, 0.74, 0.72, 1] as const,
    metallic: 0,
    roughness: 0.85,
    environmentIntensity: DEFAULT_PBR_ENVIRONMENT_INTENSITY
  } as const;
  if (options.skinned) {
    return new SkinnedLitMaterial(defaults);
  }
  if (options.instanced) {
    return new InstancedPBRMaterial(defaults);
  }
  return new PBRMaterial(defaults);
}

/**
 * baseColorFactor alpha at or above this value is treated as fully opaque when
 * deciding whether a `BLEND` material is a spurious-blend (ghost) case. 8-bit
 * authoring rounds 255/255 to 1.0 but tools occasionally emit 0.996 (254/255),
 * so we allow a small epsilon while still catching genuine fades.
 */
const BLEND_OPAQUE_ALPHA_THRESHOLD = 0.996;

export function renderStateForGLTFMaterial(
  material: GLTFMaterialAsset,
  overrides: readonly GLTFMaterialRenderStateOverride[] = [],
  materialsR185 = false,
  qrTransmission?: Omit<GLTFTransmissionQrContext, "materialsR185">
): Partial<RenderState> {
  const qr: GLTFTransmissionQrContext = { ...qrTransmission, materialsR185 };
  const blend = requiresTransparentRenderState(material, qr);
  // PRD-04 P2-12/E23: the double-sided + metallic + clearcoat back-face cull is a fudge;
  // flag-on honours authored doubleSided.
  const cullBack = usesUnbackedScalarTransmission(material, qr)
    || (!materialsR185 && usesOpaqueDoubleSidedClearcoatShell(material));
  // P5-5 (C-04): under the lane flag a MASK material requests alpha-to-coverage. The material
  // RenderState type predates C-04's `RenderCommandState.alphaToCoverage`, so the field rides
  // the state object at runtime (validateRenderState preserves unknown keys); the
  // `prd04.alphaToCoverage` feature reads it and only honours it when the tier has MSAA
  // samples. Flag-off omits the key entirely.
  const baseState: Partial<RenderState> & { alphaToCoverage?: boolean } = {
    cullMode: cullBack ? "back" : material.doubleSided ? "none" : "back",
    blend,
    depthWrite: !blend,
    ...(materialsR185 && material.alphaMode === "MASK" ? { alphaToCoverage: true } : {})
  };
  const override = overrides.find((entry) => matchesTextOrPattern(material.name, entry.materialName));
  return override ? { ...baseState, ...override.renderState } : baseState;
}

function requiresTransparentRenderState(material: GLTFMaterialAsset, qr?: GLTFTransmissionQrContext): boolean {
  if (material.alphaMode === "BLEND") return !isEffectivelyOpaqueBlendMaterial(material);
  if (material.alphaMode !== "OPAQUE") return false;
  if (usesUnbackedScalarTransmission(material, qr)) return false;
  // E22: on the real path transmissive items ride the C-01 `transmission` phase
  // queue (blend must stay off — the sorter rejects blended transmission), not
  // the legacy transparent queue.
  if (qrTransmissionRealPath(qr)) return false;
  return materialHasTransmissionOrVolume(material);
}

/**
 * Many catalog GLBs (notably Sketchfab exports) spuriously tag fully opaque
 * materials with `alphaMode: "BLEND"`. The standard glTF blend equation over a
 * fully opaque surface (baseColorFactor alpha == 1, no texel alpha in use) is a
 * no-op, but enabling blend disables depth writes — so those characters render
 * as translucent "ghosts" with broken depth sorting.
 *
 * When a BLEND material is provably opaque we treat it as OPAQUE (blend off,
 * depthWrite on). The check is deliberately conservative: anything that could
 * carry real transparency — alpha factor < 1, transmission/volume, or a
 * meaningful alphaCutoff — keeps blending.
 *
 * Known edge case: a baseColorTexture's own alpha channel cannot be inspected
 * here (images are decoded asynchronously and channel-usage is not tracked on
 * the material), so a BLEND material that relies purely on per-texel texture
 * alpha while keeping baseColorFactor alpha == 1 would be flattened to opaque.
 * That pattern is rare in the wild (such assets normally use MASK or set the
 * factor alpha < 1), and the override path (renderStateOverrides /
 * GLTFMaterialRenderStateOverride) remains available to force blend back on.
 */
function isEffectivelyOpaqueBlendMaterial(material: GLTFMaterialAsset): boolean {
  if (material.alphaMode !== "BLEND") return false;
  if (material.baseColorFactor[3] < BLEND_OPAQUE_ALPHA_THRESHOLD) return false;
  // Conservative: if a baseColorTexture is present, retain blending — the texture may
  // carry per-texel alpha that we cannot inspect here. Flattening would depth-sort it
  // as opaque and cause ghosting / overlay artifacts.
  if (material.baseColorTexture) return false;
  if (materialHasTransmissionOrVolume(material)) return false;
  return true;
}

function materialHasTransmissionOrVolume(material: GLTFMaterialAsset): boolean {
  return (material.transmission?.factor ?? 0) > 0.001
    || (material.diffuseTransmission?.factor ?? 0) > 0.001
    || (material.volume?.thicknessFactor ?? 0) > 0.001
    || material.volume?.thicknessTexture !== undefined;
}

/**
 * P4-3 QR context for transmission-path decisions (forwarded flags + renderer mode — the
 * assets package never resolves `A3D_QR_*` itself).
 */
export interface GLTFTransmissionQrContext {
  readonly materialsR185?: boolean;
  readonly materialsTransmission?: boolean;
  readonly transmission?: "auto" | "env" | "off";
}

/**
 * E22 gate (PRD-04 P4-3): real transmission rendering exists — so the legacy
 * unbacked-scalar-transmission rewrite must not run — exactly when
 * `A3D_QR_MATERIALS` **and** `A3D_QR_MATERIALS_TRANSMISSION` are on **and**
 * `renderer.transmission === "env"` (the env-refraction path).
 * T0-18(b): `programCacheSlot.provided` is not evidence — it is true whenever
 * the prd01 barrel loaded, which skipped E22 even though the scene-copy path
 * did not draw. `"auto"` keeps the E22 rewrite until the transmission target
 * is bound end-to-end on generated programs (04-S10).
 */
function qrTransmissionRealPath(qr?: GLTFTransmissionQrContext): boolean {
  return qr?.materialsR185 === true
    && qr?.materialsTransmission === true
    && qr.transmission === "env";
}

function usesUnbackedScalarTransmission(material: GLTFMaterialAsset, qr?: GLTFTransmissionQrContext): boolean {
  const unbacked = material.alphaMode === "OPAQUE"
    && (material.transmission?.factor ?? 0) > 0.001
    && material.transmission?.texture === undefined
    && material.diffuseTransmission === undefined
    && material.volume === undefined;
  // E22 path-gated skip: real transmission handles the material; no rewrite.
  if (unbacked && qrTransmissionRealPath(qr)) return false;
  return unbacked;
}

function usesOpaqueDoubleSidedClearcoatShell(material: GLTFMaterialAsset): boolean {
  return material.alphaMode === "OPAQUE"
    && material.doubleSided
    && (material.clearcoat?.factor ?? 0) > 0.001
    && material.metallicFactor > 0.35
    && material.roughnessFactor <= 0.42;
}

function renderPbrBaseColorFactor(material: GLTFMaterialAsset, qr?: GLTFTransmissionQrContext): readonly [number, number, number, number] {
  if (!usesUnbackedScalarTransmission(material, qr)) return material.baseColorFactor;
  const maxColor = Math.max(material.baseColorFactor[0], material.baseColorFactor[1], material.baseColorFactor[2]);
  if (maxColor < 0.8) return material.baseColorFactor;
  return [0.028, 0.036, 0.044, material.baseColorFactor[3]];
}

function renderPbrRoughnessFactor(material: GLTFMaterialAsset, qr?: GLTFTransmissionQrContext): number {
  if (!usesUnbackedScalarTransmission(material, qr)) return material.roughnessFactor;
  return Math.max(material.roughnessFactor, 0.72);
}

function applyAlphaCutoff(runtimeMaterial: Material, material: GLTFMaterialAsset): void {
  runtimeMaterial.setParameter("u_alphaCutoff", material.alphaMode === "MASK" ? material.alphaCutoff : 0);
}

function renderNormalScale(asset: GLTFAsset, material: GLTFMaterialAsset): number | undefined {
  return renderNormalMapScale(asset, material.normalTexture);
}

function createNormalSampler(asset: GLTFAsset, material: GLTFMaterialAsset): Sampler {
  const texture = material.normalTexture ? asset.textures[material.normalTexture.texture] : undefined;
  return createNormalMapSampler(texture);
}

function createNormalSamplerForInfo(asset: GLTFAsset, info: GLTFResolvedTextureInfo | undefined): Sampler {
  const texture = info ? asset.textures[info.texture] : undefined;
  return createNormalMapSampler(texture);
}

function renderNormalMapScale(asset: GLTFAsset, info: (GLTFResolvedTextureInfo & { readonly scale: number }) | undefined): number | undefined {
  if (!info) return undefined;
  return info.scale;
}

function createNormalMapSampler(texture: GLTFTextureAsset | undefined): Sampler {
  const sampler = createSampler(texture);
  if (!usesNearestSampler(texture)) return sampler;
  return new Sampler({
    minFilter: "linear-mipmap-linear",
    magFilter: "linear",
    addressU: sampler.addressU,
    addressV: sampler.addressV,
    maxAnisotropy: sampler.maxAnisotropy
  });
}

function usesNearestSampler(texture: GLTFTextureAsset | undefined): boolean {
  const sampler = createSampler(texture);
  return sampler.magFilter === "nearest" || sampler.minFilter.startsWith("nearest");
}

function pbrExtensionScalarOptions(material: GLTFMaterialAsset, qr?: GLTFTransmissionQrContext): {
  readonly clearcoatFactor?: number;
  readonly clearcoatRoughnessFactor?: number;
  readonly transmissionFactor?: number;
  readonly diffuseTransmissionFactor?: number;
  readonly diffuseTransmissionColorFactor?: readonly [number, number, number];
  readonly transmissionFallbackEnergy?: number;
  readonly volumeThicknessFactor?: number;
  readonly volumeAttenuationDistance?: number;
  readonly volumeAttenuationColor?: readonly [number, number, number];
  readonly ior?: number;
  readonly specularFactor?: number;
  readonly specularColorFactor?: readonly [number, number, number];
  readonly sheenColorFactor?: readonly [number, number, number];
  readonly sheenRoughnessFactor?: number;
  readonly anisotropyStrength?: number;
  readonly anisotropyRotation?: number;
  readonly iridescenceFactor?: number;
  readonly iridescenceIor?: number;
  readonly iridescenceThicknessMinimum?: number;
  readonly iridescenceThicknessMaximum?: number;
  readonly dispersion?: number;
} {
  return {
    ...(material.clearcoat ? {
      clearcoatFactor: material.clearcoat.factor,
      clearcoatRoughnessFactor: renderClearcoatRoughnessFactor(material)
    } : {}),
    ...(material.transmission ? {
      transmissionFactor: usesUnbackedScalarTransmission(material, qr) ? 0 : material.transmission.factor,
      transmissionFallbackEnergy: renderTransmissionFallbackEnergy(material, qr)
    } : {}),
    ...(material.diffuseTransmission ? {
      diffuseTransmissionFactor: material.diffuseTransmission.factor,
      diffuseTransmissionColorFactor: material.diffuseTransmission.colorFactor
    } : {}),
    ...(material.volume ? {
      volumeThicknessFactor: material.volume.thicknessFactor,
      volumeAttenuationDistance: renderVolumeAttenuationDistance(material.volume.attenuationDistance),
      volumeAttenuationColor: material.volume.attenuationColor
    } : {}),
    ...(material.ior !== undefined ? { ior: material.ior } : {}),
    ...(material.specular ? {
      specularFactor: material.specular.factor,
      specularColorFactor: renderSpecularColorFactor(material.specular.colorFactor)
    } : {}),
    ...(material.sheen ? {
      sheenColorFactor: material.sheen.colorFactor,
      sheenRoughnessFactor: material.sheen.roughnessFactor
    } : {}),
    ...(material.anisotropy ? {
      anisotropyStrength: material.anisotropy.strength,
      anisotropyRotation: material.anisotropy.rotation
    } : {}),
    ...(material.iridescence ? {
      iridescenceFactor: material.iridescence.factor,
      iridescenceIor: material.iridescence.ior,
      iridescenceThicknessMinimum: material.iridescence.thicknessMinimum,
      iridescenceThicknessMaximum: material.iridescence.thicknessMaximum
    } : {}),
    ...(material.dispersion !== undefined ? {
      dispersion: material.dispersion
    } : {})
  };
}

async function pbrExtensionTextureOptions(
  asset: GLTFAsset,
  material: GLTFMaterialAsset,
  getTexture: GLTFTextureGetter
): Promise<Partial<TexturedPBRMaterialOptions>> {
  const clearcoatTexture = material.clearcoat?.texture;
  const clearcoatRoughnessTexture = material.clearcoat?.roughnessTexture;
  const clearcoatNormalTexture = material.clearcoat?.normalTexture;
  const transmissionTexture = material.transmission?.texture;
  const diffuseTransmissionTexture = material.diffuseTransmission?.texture;
  const diffuseTransmissionColorTexture = material.diffuseTransmission?.colorTexture;
  const volumeThicknessTexture = material.volume?.thicknessTexture;
  const specularTexture = material.specular?.texture;
  const specularColorTexture = material.specular?.colorTexture;
  const sheenColorTexture = material.sheen?.colorTexture;
  const sheenRoughnessTexture = material.sheen?.roughnessTexture;
  const anisotropyTexture = material.anisotropy?.texture;
  const iridescenceTexture = material.iridescence?.texture;
  const iridescenceThicknessTexture = material.iridescence?.thicknessTexture;

  return {
    ...(clearcoatTexture ? {
      clearcoatTexture: await getTexture(clearcoatTexture, "linear"),
      clearcoatSampler: createSamplerForInfo(asset, clearcoatTexture),
      clearcoatTextureTransform: clearcoatTexture.transform
    } : {}),
    ...(clearcoatRoughnessTexture ? {
      clearcoatRoughnessTexture: await getTexture(clearcoatRoughnessTexture, "linear"),
      clearcoatRoughnessSampler: createSamplerForInfo(asset, clearcoatRoughnessTexture),
      clearcoatRoughnessTextureTransform: clearcoatRoughnessTexture.transform
    } : {}),
    ...(clearcoatNormalTexture ? {
      clearcoatNormalTexture: await getTexture(clearcoatNormalTexture, "linear", "normal"),
      clearcoatNormalSampler: createNormalSamplerForInfo(asset, clearcoatNormalTexture),
      clearcoatNormalTextureTransform: clearcoatNormalTexture.transform,
      clearcoatNormalScale: renderNormalMapScale(asset, clearcoatNormalTexture)
    } : {}),
    ...(transmissionTexture ? {
      transmissionTexture: await getTexture(transmissionTexture, "linear"),
      transmissionSampler: createSamplerForInfo(asset, transmissionTexture),
      transmissionTextureTransform: transmissionTexture.transform
    } : {}),
    ...(diffuseTransmissionTexture ? {
      diffuseTransmissionTexture: await getTexture(diffuseTransmissionTexture, "linear"),
      diffuseTransmissionSampler: createSamplerForInfo(asset, diffuseTransmissionTexture),
      diffuseTransmissionTextureTransform: diffuseTransmissionTexture.transform
    } : {}),
    ...(diffuseTransmissionColorTexture ? {
      diffuseTransmissionColorTexture: await getTexture(diffuseTransmissionColorTexture, "srgb"),
      diffuseTransmissionColorSampler: createSamplerForInfo(asset, diffuseTransmissionColorTexture),
      diffuseTransmissionColorTextureTransform: diffuseTransmissionColorTexture.transform
    } : {}),
    ...(volumeThicknessTexture ? {
      volumeThicknessTexture: await getTexture(volumeThicknessTexture, "linear"),
      volumeThicknessSampler: createSamplerForInfo(asset, volumeThicknessTexture),
      volumeThicknessTextureTransform: volumeThicknessTexture.transform
    } : {}),
    ...(specularTexture ? {
      specularTexture: await getTexture(specularTexture, "linear"),
      specularSampler: createSamplerForInfo(asset, specularTexture),
      specularTextureTransform: specularTexture.transform
    } : {}),
    ...(specularColorTexture ? {
      specularColorTexture: await getTexture(specularColorTexture, "srgb"),
      specularColorSampler: createSamplerForInfo(asset, specularColorTexture),
      specularColorTextureTransform: specularColorTexture.transform
    } : {}),
    ...(sheenColorTexture ? {
      sheenColorTexture: await getTexture(sheenColorTexture, "srgb"),
      sheenColorSampler: createSamplerForInfo(asset, sheenColorTexture),
      sheenColorTextureTransform: sheenColorTexture.transform
    } : {}),
    ...(sheenRoughnessTexture ? {
      sheenRoughnessTexture: await getTexture(sheenRoughnessTexture, "linear"),
      sheenRoughnessSampler: createSamplerForInfo(asset, sheenRoughnessTexture),
      sheenRoughnessTextureTransform: sheenRoughnessTexture.transform
    } : {}),
    ...(anisotropyTexture ? {
      anisotropyTexture: await getTexture(anisotropyTexture, "linear", "anisotropy"),
      anisotropySampler: createSamplerForInfo(asset, anisotropyTexture),
      anisotropyTextureTransform: anisotropyTexture.transform
    } : {}),
    ...(iridescenceTexture ? {
      iridescenceTexture: await getTexture(iridescenceTexture, "linear"),
      iridescenceSampler: createSamplerForInfo(asset, iridescenceTexture),
      iridescenceTextureTransform: iridescenceTexture.transform
    } : {}),
    ...(iridescenceThicknessTexture ? {
      iridescenceThicknessTexture: await getTexture(iridescenceThicknessTexture, "linear"),
      iridescenceThicknessSampler: createSamplerForInfo(asset, iridescenceThicknessTexture),
      iridescenceThicknessTextureTransform: iridescenceThicknessTexture.transform
    } : {})
  };
}

function renderTransmissionFallbackEnergy(material: GLTFMaterialAsset, qr?: GLTFTransmissionQrContext): number {
  const usesUnbackedCutoutTransmission = material.alphaMode === "MASK" && material.transmission?.texture === undefined && material.volume === undefined;
  return usesUnbackedCutoutTransmission || usesUnbackedScalarTransmission(material, qr) ? 0 : 0.08;
}

function pbrTextureTexCoords(material: GLTFMaterialAsset): Partial<Record<TexturedPBRTextureSlot, number>> {
  return {
    ...(material.baseColorTexture ? { baseColor: renderTexCoord(material.baseColorTexture.texCoord) } : {}),
    ...(material.normalTexture ? { normal: renderTexCoord(material.normalTexture.texCoord) } : {}),
    ...(material.diffuseRoughness?.texture ? { diffuseRoughness: renderTexCoord(material.diffuseRoughness.texture.texCoord) } : {}),
    ...(material.bump?.texture ? { bump: renderTexCoord(material.bump.texture.texCoord) } : {}),
    ...(material.metallicRoughnessTexture ? { metallicRoughness: renderTexCoord(material.metallicRoughnessTexture.texCoord) } : {}),
    ...(material.occlusionTexture ? { occlusion: renderTexCoord(material.occlusionTexture.texCoord) } : {}),
    ...(material.emissiveTexture ? { emissive: renderTexCoord(material.emissiveTexture.texCoord) } : {}),
    ...(material.clearcoat?.texture ? { clearcoat: renderTexCoord(material.clearcoat.texture.texCoord) } : {}),
    ...(material.clearcoat?.roughnessTexture ? { clearcoatRoughness: renderTexCoord(material.clearcoat.roughnessTexture.texCoord) } : {}),
    ...(material.clearcoat?.normalTexture ? { clearcoatNormal: renderTexCoord(material.clearcoat.normalTexture.texCoord) } : {}),
    ...(material.transmission?.texture ? { transmission: renderTexCoord(material.transmission.texture.texCoord) } : {}),
    ...(material.diffuseTransmission?.texture ? { diffuseTransmission: renderTexCoord(material.diffuseTransmission.texture.texCoord) } : {}),
    ...(material.diffuseTransmission?.colorTexture ? { diffuseTransmissionColor: renderTexCoord(material.diffuseTransmission.colorTexture.texCoord) } : {}),
    ...(material.volume?.thicknessTexture ? { volumeThickness: renderTexCoord(material.volume.thicknessTexture.texCoord) } : {}),
    ...(material.specular?.texture ? { specular: renderTexCoord(material.specular.texture.texCoord) } : {}),
    ...(material.specular?.colorTexture ? { specularColor: renderTexCoord(material.specular.colorTexture.texCoord) } : {}),
    ...(material.sheen?.colorTexture ? { sheenColor: renderTexCoord(material.sheen.colorTexture.texCoord) } : {}),
    ...(material.sheen?.roughnessTexture ? { sheenRoughness: renderTexCoord(material.sheen.roughnessTexture.texCoord) } : {}),
    ...(material.anisotropy?.texture ? { anisotropy: renderTexCoord(material.anisotropy.texture.texCoord) } : {}),
    ...(material.iridescence?.texture ? { iridescence: renderTexCoord(material.iridescence.texture.texCoord) } : {}),
    ...(material.iridescence?.thicknessTexture ? { iridescenceThickness: renderTexCoord(material.iridescence.thicknessTexture.texCoord) } : {})
  };
}

function renderTexCoord(texCoord: number): number {
  return texCoord === 1 ? 1 : 0;
}

async function applyPBRExtensionParameters(
  asset: GLTFAsset,
  runtimeMaterial: Material,
  material: GLTFMaterialAsset,
  getTexture: GLTFTextureGetter,
  qr?: GLTFTransmissionQrContext
): Promise<void> {
  // These bindings are consumed by the renderer once its matching shader and
  // feature paths are available. Until then the support matrix must remain
  // parse-only and required declarations must still be rejected.
  runtimeMaterial.setParameter("u_diffuseRoughness", material.diffuseRoughness?.factor ?? 0);
  runtimeMaterial.setParameter("u_diffuseRoughnessTextureEnabled", material.diffuseRoughness?.texture ? 1 : 0);
  runtimeMaterial.setParameter("u_bumpFactor", material.bump?.factor ?? 0);
  runtimeMaterial.setParameter("u_bumpTextureEnabled", material.bump?.texture ? 1 : 0);
  if (material.diffuseRoughness?.texture) {
    await setTextureParameter(asset, runtimeMaterial, "u_diffuseRoughnessTexture", material.diffuseRoughness.texture, "linear", getTexture);
  }
  if (material.bump?.texture) {
    await setTextureParameter(asset, runtimeMaterial, "u_bumpTexture", material.bump.texture, "linear", getTexture);
  }
  if (material.clearcoat) {
    runtimeMaterial.setParameter("u_clearcoatFactor", material.clearcoat.factor);
    runtimeMaterial.setParameter("u_clearcoatRoughnessFactor", renderClearcoatRoughnessFactor(material));
    if (material.clearcoat.texture) {
      await setTextureParameter(asset, runtimeMaterial, "u_clearcoatTexture", material.clearcoat.texture, "linear", getTexture);
    }
    if (material.clearcoat.roughnessTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_clearcoatRoughnessTexture", material.clearcoat.roughnessTexture, "linear", getTexture);
    }
    if (material.clearcoat.normalTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_clearcoatNormalTexture", material.clearcoat.normalTexture, "linear", getTexture);
      runtimeMaterial.setParameter("u_clearcoatNormalScale", renderNormalMapScale(asset, material.clearcoat.normalTexture) ?? material.clearcoat.normalTexture.scale);
    }
  }
  if (material.transmission) {
    runtimeMaterial.setParameter("u_transmissionFactor", usesUnbackedScalarTransmission(material, qr) ? 0 : material.transmission.factor);
    if (material.transmission.texture) {
      await setTextureParameter(asset, runtimeMaterial, "u_transmissionTexture", material.transmission.texture, "linear", getTexture);
    }
  }
  if (material.diffuseTransmission) {
    runtimeMaterial.setParameter("u_diffuseTransmissionFactor", material.diffuseTransmission.factor);
    runtimeMaterial.setParameter("u_diffuseTransmissionColorFactor", material.diffuseTransmission.colorFactor);
    if (material.diffuseTransmission.texture) {
      await setTextureParameter(asset, runtimeMaterial, "u_diffuseTransmissionTexture", material.diffuseTransmission.texture, "linear", getTexture);
    }
    if (material.diffuseTransmission.colorTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_diffuseTransmissionColorTexture", material.diffuseTransmission.colorTexture, "srgb", getTexture);
    }
  }
  if (material.volume) {
    runtimeMaterial.setParameter("u_volumeThicknessFactor", material.volume.thicknessFactor);
    runtimeMaterial.setParameter("u_volumeAttenuationDistance", renderVolumeAttenuationDistance(material.volume.attenuationDistance));
    runtimeMaterial.setParameter("u_volumeAttenuationColor", material.volume.attenuationColor);
    if (material.volume.thicknessTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_volumeThicknessTexture", material.volume.thicknessTexture, "linear", getTexture);
    }
  }
  if (material.ior !== undefined) {
    runtimeMaterial.setParameter("u_ior", material.ior);
  }
  if (material.specular) {
    runtimeMaterial.setParameter("u_specularFactor", material.specular.factor);
    runtimeMaterial.setParameter("u_specularColorFactor", renderSpecularColorFactor(material.specular.colorFactor));
    if (material.specular.texture) {
      await setTextureParameter(asset, runtimeMaterial, "u_specularTexture", material.specular.texture, "linear", getTexture);
    }
    if (material.specular.colorTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_specularColorTexture", material.specular.colorTexture, "srgb", getTexture);
    }
  }
  if (material.sheen) {
    runtimeMaterial.setParameter("u_sheenColorFactor", material.sheen.colorFactor);
    runtimeMaterial.setParameter("u_sheenRoughnessFactor", material.sheen.roughnessFactor);
    if (material.sheen.colorTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_sheenColorTexture", material.sheen.colorTexture, "srgb", getTexture);
    }
    if (material.sheen.roughnessTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_sheenRoughnessTexture", material.sheen.roughnessTexture, "linear", getTexture);
    }
  }
  if (material.anisotropy) {
    runtimeMaterial.setParameter("u_anisotropyStrength", material.anisotropy.strength);
    runtimeMaterial.setParameter("u_anisotropyRotation", material.anisotropy.rotation);
    if (material.anisotropy.texture) {
      await setTextureParameter(asset, runtimeMaterial, "u_anisotropyTexture", material.anisotropy.texture, "linear", getTexture);
    }
  }
  if (material.iridescence) {
    runtimeMaterial.setParameter("u_iridescenceFactor", material.iridescence.factor);
    runtimeMaterial.setParameter("u_iridescenceIor", material.iridescence.ior);
    runtimeMaterial.setParameter("u_iridescenceThicknessMinimum", material.iridescence.thicknessMinimum);
    runtimeMaterial.setParameter("u_iridescenceThicknessMaximum", material.iridescence.thicknessMaximum);
    if (material.iridescence.texture) {
      await setTextureParameter(asset, runtimeMaterial, "u_iridescenceTexture", material.iridescence.texture, "linear", getTexture);
    }
    if (material.iridescence.thicknessTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_iridescenceThicknessTexture", material.iridescence.thicknessTexture, "linear", getTexture);
    }
  }
  if (material.dispersion !== undefined) {
    runtimeMaterial.setParameter("u_dispersion", material.dispersion);
  }
}

function renderClearcoatRoughnessFactor(material: GLTFMaterialAsset): number {
  return material.clearcoat?.roughnessFactor ?? 0;
}

async function setTextureParameter(
  asset: GLTFAsset,
  runtimeMaterial: Material,
  uniformName: string,
  info: GLTFResolvedTextureInfo,
  colorSpace: GLTFTextureColorSpace,
  getTexture: GLTFTextureGetter,
  sampler?: Sampler
): Promise<void> {
  runtimeMaterial.setParameter(uniformName, await createTextureBinding(asset, info, colorSpace, getTexture, uniformName, sampler));
  runtimeMaterial.setParameter(`${uniformName}Offset`, info.transform?.offset ?? [0, 0]);
  runtimeMaterial.setParameter(`${uniformName}Scale`, info.transform?.scale ?? [1, 1]);
  runtimeMaterial.setParameter(`${uniformName}Rotation`, info.transform?.rotation ?? 0);
  runtimeMaterial.setParameter(`${uniformName}TexCoord`, renderTexCoord(info.texCoord));
}

async function createTextureBinding(
  asset: GLTFAsset,
  info: GLTFResolvedTextureInfo,
  colorSpace: GLTFTextureColorSpace,
  getTexture: GLTFTextureGetter,
  uniformName = `gltf-texture-${info.texture}`,
  sampler?: Sampler
): Promise<TextureBinding> {
  return new TextureBinding({
    name: uniformName,
    texture: await getTexture(info, colorSpace, textureFallbackForUniform(uniformName)),
    sampler: sampler ?? createSampler(asset.textures[info.texture]),
    required: true,
    expectedColorSpace: colorSpace,
    transform: info.transform
  });
}

function textureFallbackForUniform(name: string): GLTFTextureFallback {
  if (name === "u_normalTexture" || name === "u_clearcoatNormalTexture") return "normal";
  if (name === "u_bumpTexture") return "bump";
  if (name === "u_anisotropyTexture") return "anisotropy";
  return "factor";
}

function requiresTexturedPBRMaterial(material: GLTFMaterialAsset, includeDetailTextures = true): boolean {
  return Boolean(
    material.baseColorTexture ||
    material.normalTexture ||
    material.metallicRoughnessTexture ||
    material.occlusionTexture ||
    material.emissiveTexture ||
    (includeDetailTextures && (material.diffuseRoughness?.texture || material.bump?.texture)) ||
    material.clearcoat?.texture ||
    material.clearcoat?.roughnessTexture ||
    material.clearcoat?.normalTexture ||
    material.transmission?.texture ||
    material.diffuseTransmission?.texture ||
    material.diffuseTransmission?.colorTexture ||
    material.volume?.thicknessTexture ||
    material.specular?.texture ||
    material.specular?.colorTexture ||
    material.sheen?.colorTexture ||
    material.sheen?.roughnessTexture ||
    material.anisotropy?.texture ||
    material.iridescence?.texture ||
    material.iridescence?.thicknessTexture
  );
}

function renderVolumeAttenuationDistance(distance: number): number {
  return distance === Number.POSITIVE_INFINITY ? 1_000_000 : distance;
}

function renderSpecularColorFactor(value: readonly [number, number, number]): readonly [number, number, number] {
  return [clampNonNegative(value[0]), clampNonNegative(value[1]), clampNonNegative(value[2])];
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampNonNegative(value: number): number {
  return Math.max(0, value);
}

function textureCacheKey(imageIndex: number, colorSpace: GLTFTextureColorSpace): string {
  return `${imageIndex}:${colorSpace}`;
}

function setTextureLibraryEntry(textureLibrary: Map<string, Texture>, textureName: string, colorSpace: GLTFTextureColorSpace, texture: Texture): void {
  const existing = textureLibrary.get(textureName);
  if (!existing) {
    textureLibrary.set(textureName, texture);
    return;
  }
  if (existing === texture) return;
  const keyedName = textureLibraryKey(textureLibrary, textureName, colorSpace);
  if (textureLibrary.get(keyedName) !== texture) {
    textureLibrary.set(keyedName, texture);
  }
}

function textureLibraryKey(textureLibrary: ReadonlyMap<string, Texture>, textureName: string, colorSpace: GLTFTextureColorSpace): string {
  if (!textureLibrary.has(textureName)) return textureName;
  return `${textureName}:${colorSpace}`;
}

function createSampler(texture: GLTFTextureAsset | undefined): Sampler {
  const descriptor = texture?.samplerDescriptor;
  const samplerDescriptor: SamplerDescriptor = descriptor
    ? {
        minFilter: descriptor.minFilter,
        magFilter: descriptor.magFilter,
        addressU: descriptor.addressU,
        addressV: descriptor.addressV,
        maxAnisotropy: 8
      }
    : {
        minFilter: "linear-mipmap-linear",
        magFilter: "linear",
        addressU: "repeat",
        addressV: "repeat",
        maxAnisotropy: 8
      };
  return new Sampler(samplerDescriptor);
}

function createSamplerForInfo(asset: GLTFAsset, info: GLTFResolvedTextureInfo): Sampler {
  return createSampler(asset.textures[info.texture]);
}

function createFallbackTexture(label: string, colorSpace: GLTFTextureColorSpace, fallback: GLTFTextureFallback = "factor"): Texture {
  return new Texture({
    width: 1,
    height: 1,
    colorSpace,
    label: `${label} (missing-texture-fallback)`,
    data: new Uint8Array(gltfTextureFallback(fallback))
  });
}

function throwIfResourceAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("glTF resource creation aborted", "AbortError");
}

function resourceDisposedError(): Error {
  const error = new Error("glTF render resources were disposed");
  error.name = "AbortError";
  return error;
}

function variantSupersededError(): Error {
  const error = new Error("glTF material variant selection was superseded");
  error.name = "AbortError";
  return error;
}

function isExpectedResourceCancellation(error: unknown, signal: AbortSignal): boolean {
  if (error === signal.reason) return true;
  try { return error instanceof Error && !(error instanceof AggregateError) && error.name === "AbortError"; }
  catch { return false; }
}

function reportLateResourceFailure(error: unknown, signal: AbortSignal, urls: readonly string[]): void {
  if (!signal.aborted || isExpectedResourceCancellation(error, signal)) return;
  console.error("Late glTF resource cleanup failed", redactImportCause(error, urls));
}

/** Cancel this consumer's wait without cancelling a shared factory or its other subscribers. */
function waitForResource<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    pending.then((value) => {
      signal.removeEventListener("abort", abort);
      resolve(value);
    }, (error) => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}

function closeDecodedImage(decoded: DecodedGLTFImage): void {
  const source = decoded.source as (TexImageSource & { close?: () => void }) | undefined;
  try { if (source && typeof source.close === "function") source.close(); }
  catch { /* Cleanup must not replace the original decode or cancellation error. */ }
}

/** An injected decoder may ignore the signal, so dispose any late result. */
function decodeWithCancellation(pending: Promise<DecodedGLTFImage>, signal?: AbortSignal): Promise<DecodedGLTFImage> {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      reject(signal.reason ?? new DOMException("glTF image decode aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    pending.then((decoded) => {
      signal.removeEventListener("abort", abort);
      if (settled) { closeDecodedImage(decoded); return; }
      settled = true;
      resolve(decoded);
    }, (error) => {
      signal.removeEventListener("abort", abort);
      if (!settled) { settled = true; reject(error); }
    });
  });
}

function isTexturePolicyOrAbortError(error: unknown): boolean {
  try {
    if (error instanceof AssetIntegrityError || error instanceof AssetPolicyError || error instanceof AssetSizeError) return true;
    if (!(error instanceof Error)) return false;
  } catch {
    // An uninspectable exception may be a policy failure: do not fall back.
    return true;
  }
  try {
    return ["AssetIntegrityError", "AssetPolicyError", "AssetSizeError", "AbortError", "TextureBudgetExceededError", "GLTFTextureBudgetDeviceDisposedError"].includes(error.name);
  } catch { return false; }
}

function safeTextureErrorReason(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return redactAssetMessage(reason).slice(0, 2048);
}

function warnMissingGLTFTexture(textureName: string, imageUri: string | undefined, reason: string): void {
  if (typeof console === "undefined" || typeof console.warn !== "function") return;
  const source = imageUri ? ` (${imageUri})` : "";
  console.warn(
    `glTF texture "${redactAssetMessage(textureName).slice(0, 256)}"${source} could not be loaded; falling back to baseColorFactor. Reason: ${reason}`
  );
}
