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
  DEFAULT_TEXTURED_PBR_SHADER_NAME
} from "@aura3d/rendering";
import { Bounds3 as SceneBounds3, multiplyMat4, type Mat4 } from "@aura3d/scene";
import {
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
import { transcodeKTX2BasisTexture, type KTX2BasisTargetFormat, type KTX2BasisTextureTranscoderOptions } from "./KTX2BasisTextureTranscoder";

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

export type GLTFImageDecoder = (image: GLTFImageAsset, imageIndex: number, asset: GLTFAsset) => DecodedGLTFImage | Promise<DecodedGLTFImage>;

export interface GLTFRenderResourceOptions {
  readonly imageDecoder?: GLTFImageDecoder;
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
  readonly morphTargetLibrary: ReadonlyMap<string, readonly MorphTargetDelta[]>;
  readonly textureLibrary: ReadonlyMap<string, Texture>;
  readonly bounds: CameraFrameBounds;
  collectMaterialOverrideTargets(query?: GLTFMaterialOverrideQuery): readonly GLTFMaterialOverrideTarget[];
  createCameraFrame(viewport: CameraFrameViewport, options?: PerspectiveCameraFrameOptions): PerspectiveCameraFrame;
  toRenderSource(options?: GLTFRenderSourceOptions): RenderSource;
  toRendererInput(viewport: CameraFrameViewport, options?: GLTFRendererInputOptions): GLTFRendererInput;
  dispose(): void;
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
  readonly slot: TexturedPBRTextureSlot;
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

export async function createGLTFRenderResources(
  asset: GLTFAsset,
  options: GLTFRenderResourceOptions = {}
): Promise<GLTFRenderResources> {
  const geometryLibrary = new Map<string, Geometry>();
  const materialLibrary = new Map<string, Material>();
  const morphTargetLibrary = new Map<string, readonly MorphTargetDelta[]>();
  const textureLibrary = new Map<string, Texture>();
  const textureByImage = new Map<string, Promise<Texture>>();
  const scene = asset.createScene({
    ...(options.materialVariant ? { materialVariant: options.materialVariant } : {}),
    ...(options.sceneIndex !== undefined ? { sceneIndex: options.sceneIndex } : {}),
    ...(options.sceneName !== undefined ? { sceneName: options.sceneName } : {})
  });

  const getTexture = async (info: GLTFResolvedTextureInfo, colorSpace: GLTFTextureColorSpace): Promise<Texture> => {
    const textureAsset = asset.textures[info.texture];
    const image = asset.images[info.image];
    if (!textureAsset || !image) {
      throw new Error(`glTF material texture ${info.texture} references missing image ${info.image}`);
    }
    const cacheKey = textureCacheKey(info.image, colorSpace);
    const existing = textureByImage.get(cacheKey);
    if (existing) {
      const texture = await existing;
      setTextureLibraryEntry(textureLibrary, textureAsset.name, colorSpace, texture);
      return texture;
    }
    const decoder = options.imageDecoder ?? ((sourceImage, imageIndex, sourceAsset) => decodeImageInBrowser(sourceImage, imageIndex, sourceAsset, options));
    const texturePromise = (async () => {
      const decoded = await decoder(image, info.image, asset);
      return new Texture({
        width: decoded.width,
        height: decoded.height,
        ...(decoded.format ? { format: decoded.format } : {}),
        colorSpace,
        label: textureAsset.name,
        ...(decoded.mipLevels ? { mipLevels: decoded.mipLevels } : decoded.data ? { data: decoded.data } : { source: decoded.source }),
        ...(decoded.fallbackData ? { fallbackData: decoded.fallbackData } : {}),
        ...(decoded.fallbackMipLevels ? { fallbackMipLevels: decoded.fallbackMipLevels } : {})
      });
    })();
    textureByImage.set(cacheKey, texturePromise);
    try {
      const texture = await texturePromise;
      setTextureLibraryEntry(textureLibrary, textureAsset.name, colorSpace, texture);
      return texture;
    } catch (error) {
      textureByImage.delete(cacheKey);
      if (options.failOnMissingTexture) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : String(error);
      warnMissingGLTFTexture(textureAsset.name, image.uri, reason);
      const fallback = createFallbackTexture(textureAsset.name, colorSpace);
      const fallbackPromise = Promise.resolve(fallback);
      textureByImage.set(cacheKey, fallbackPromise);
      setTextureLibraryEntry(textureLibrary, textureAsset.name, colorSpace, fallback);
      return fallback;
    }
  };

  try {
    for (const mesh of asset.meshes) {
      geometryLibrary.set(mesh.name, createGeometry(mesh, materialForMesh(asset, mesh, options.materialVariant)));
      if (mesh.morphTargets.length > 0) {
        morphTargetLibrary.set(mesh.name, mesh.morphTargets.map((target) => ({
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
        materialTasks.push(createMaterial(asset, material, getTexture, {}, options.materialRenderStateOverrides).then((runtimeMaterial) => {
          materialLibrary.set(material.name, runtimeMaterial);
        }));
        continue;
      }
      for (const [key, runtime] of runtimeKeys) {
        materialTasks.push(createMaterial(asset, material, getTexture, runtime.contract, options.materialRenderStateOverrides).then((runtimeMaterial) => {
          materialLibrary.set(key, runtimeMaterial);
        }));
      }
    }
    await Promise.all(materialTasks);

    for (const mesh of asset.meshes) {
      for (const [key, runtime] of runtimeMaterialContracts) {
        if (runtime.material === mesh.material && !materialLibrary.has(key)) {
          materialLibrary.set(key, createDefaultGLTFMaterial(mesh, runtime.contract));
        }
      }
      if (!materialLibrary.has(mesh.material)) {
        materialLibrary.set(mesh.material, createDefaultGLTFMaterial(mesh));
      }
    }
  } catch (error) {
    disposeGLTFRenderResourceMaps(geometryLibrary, textureLibrary);
    throw error;
  }
  const bounds = computeGLTFRenderResourceBounds(scene, geometryLibrary, morphTargetLibrary);
  const renderableBindings = createGLTFRenderableBindings(asset, scene);
  const materialFidelityDiagnostics = createGLTFMaterialFidelityDiagnostics(asset, renderableBindings, options.materialVariant);

  return {
    scene,
    geometryLibrary,
    materialLibrary,
    renderableBindings,
    materialFidelityDiagnostics,
    morphTargetLibrary,
    textureLibrary,
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
    dispose: () => disposeGLTFRenderResourceMaps(geometryLibrary, textureLibrary)
  };
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
  geometryLibrary: ReadonlyMap<string, Geometry>,
  textureLibrary: ReadonlyMap<string, Texture>
): void {
  for (const geometry of geometryLibrary.values()) geometry.dispose();
  for (const texture of textureLibrary.values()) texture.dispose();
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

function createGeometry(mesh: GLTFMeshAsset, material: GLTFMaterialAsset | undefined): Geometry {
  const usedTexCoordSets = usedRenderTexCoordSets(material);
  const texcoords = selectRenderTexcoords(mesh, material, 0);
  const texcoords1 = usedTexCoordSets.has(1) ? selectRenderTexcoords(mesh, material, 1) : [];
  const needsUv = usedTexCoordSets.has(0) || texcoords.length > 0;
  const needsUv1 = texcoords1.length > 0;
  const needsNormal = mesh.normals.length > 0 || needsUv || materialNeedsNormals(material);
  const needsTangent = mesh.tangents.length > 0 || (needsUv && (materialNeedsTangents(material) || (material !== undefined && !material.unlit)));
  const needsColor = mesh.colors.length > 0;
  const needsSkinning = mesh.skinIndex !== undefined || mesh.joints.length > 0 || mesh.weights.length > 0;
  const format = vertexFormatForGLTFMesh(needsNormal, needsUv, needsTangent, needsUv1, needsColor, needsSkinning);
  const renderNormals = needsNormal && mesh.normals.length === 0
    ? generateMeshNormals(mesh.positions, mesh.indices, mesh.topology)
    : mesh.normals;
  const renderTangents = needsTangent && mesh.tangents.length === 0
    ? generateMeshTangents(mesh.positions, texcoords, mesh.indices, mesh.topology, renderNormals)
    : mesh.tangents;
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
  readonly slot: TexturedPBRTextureSlot;
  readonly info: GLTFResolvedTextureInfo;
  readonly tangentSpace: boolean;
}[] {
  return [
    material.baseColorTexture ? { slot: "baseColor", info: material.baseColorTexture, tangentSpace: false } : undefined,
    material.metallicRoughnessTexture ? { slot: "metallicRoughness", info: material.metallicRoughnessTexture, tangentSpace: false } : undefined,
    material.normalTexture ? { slot: "normal", info: material.normalTexture, tangentSpace: true } : undefined,
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
    readonly slot: TexturedPBRTextureSlot;
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

async function createMaterial(
  asset: GLTFAsset,
  material: GLTFMaterialAsset,
  getTexture: (info: GLTFResolvedTextureInfo, colorSpace: GLTFTextureColorSpace) => Promise<Texture>,
  options: { readonly skinned?: boolean; readonly instanced?: boolean } = {},
  renderStateOverrides: readonly GLTFMaterialRenderStateOverride[] = []
): Promise<Material> {
  const renderState = renderStateForGLTFMaterial(material, renderStateOverrides);
  if (options.skinned && !material.unlit) {
    const [
      baseColorTexture,
      normalTexture,
      metallicRoughnessTexture,
      occlusionTexture,
      emissiveTexture,
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
      ...pbrExtensionScalarOptions(material)
    });
    applyAlphaCutoff(runtimeMaterial, material);
    await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture);
    return runtimeMaterial;
  }
  if (options.instanced && material.unlit && !material.baseColorTexture) {
    const runtimeMaterial = new InstancedUnlitMaterial({
      name: material.name,
      color: material.baseColorFactor,
      renderState
    });
    applyAlphaCutoff(runtimeMaterial, material);
    await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture);
    return runtimeMaterial;
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
      applyAlphaCutoff(runtimeMaterial, material);
      await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture);
      return runtimeMaterial;
    }
    const runtimeMaterial = new UnlitMaterial({
      name: material.name,
      color: material.baseColorFactor,
      renderState
    });
    applyAlphaCutoff(runtimeMaterial, material);
    await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture);
    return runtimeMaterial;
  }
  if (options.instanced && !requiresTexturedPBRMaterial(material) && !material.baseColorTexture) {
    const runtimeMaterial = new InstancedPBRMaterial({
      name: material.name,
      renderState,
      baseColor: material.baseColorFactor,
      metallic: material.metallicFactor,
      roughness: material.roughnessFactor,
      emissiveColor: material.emissiveFactor,
      emissiveStrength: material.emissiveStrength
    });
    applyAlphaCutoff(runtimeMaterial, material);
    await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture);
    return runtimeMaterial;
  }
  if (requiresTexturedPBRMaterial(material)) {
    const baseColorTexture = material.baseColorTexture ? await getTexture(material.baseColorTexture, "srgb") : undefined;
    const normalTexture = material.normalTexture ? await getTexture(material.normalTexture, "linear") : undefined;
    const metallicRoughnessTexture = material.metallicRoughnessTexture ? await getTexture(material.metallicRoughnessTexture, "linear") : undefined;
    const occlusionTexture = material.occlusionTexture ? await getTexture(material.occlusionTexture, "linear") : undefined;
    const emissiveTexture = material.emissiveTexture ? await getTexture(material.emissiveTexture, "srgb") : undefined;
    const extensionTextureOptions = await pbrExtensionTextureOptions(asset, material, getTexture);
    const runtimeMaterial = new TexturedPBRMaterial({
      name: material.name,
      renderState,
      baseColor: renderPbrBaseColorFactor(material),
      metallic: material.metallicFactor,
      roughness: renderPbrRoughnessFactor(material),
      emissiveColor: material.emissiveFactor,
      emissiveStrength: material.emissiveStrength,
      textureTexCoords: pbrTextureTexCoords(material),
      ...pbrExtensionScalarOptions(material),
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
    applyAlphaCutoff(runtimeMaterial, material);
    await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture);
    return runtimeMaterial;
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
    applyAlphaCutoff(runtimeMaterial, material);
    await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture);
    return runtimeMaterial;
  }
  const runtimeMaterial = new PBRMaterial({
    name: material.name,
    renderState,
    baseColor: renderPbrBaseColorFactor(material),
    metallic: material.metallicFactor,
    roughness: renderPbrRoughnessFactor(material),
    emissiveColor: material.emissiveFactor,
    emissiveStrength: material.emissiveStrength,
    ...pbrExtensionScalarOptions(material)
  });
  applyAlphaCutoff(runtimeMaterial, material);
  await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture);
  return runtimeMaterial;
}

function createDefaultGLTFMaterial(mesh: GLTFMeshAsset, options: { readonly instanced?: boolean; readonly skinned?: boolean } = {}): Material {
  // Use a neutral light-gray base color instead of glTF-spec white ([1,1,1,1])
  // so missing-material fallbacks do not blow out as bright white artifacts.
  const defaults = {
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
  overrides: readonly GLTFMaterialRenderStateOverride[] = []
): Partial<RenderState> {
  const blend = requiresTransparentRenderState(material);
  const cullBack = usesUnbackedScalarTransmission(material) || usesOpaqueDoubleSidedClearcoatShell(material);
  const baseState: Partial<RenderState> = {
    cullMode: cullBack ? "back" : material.doubleSided ? "none" : "back",
    blend,
    depthWrite: !blend
  };
  const override = overrides.find((entry) => matchesTextOrPattern(material.name, entry.materialName));
  return override ? { ...baseState, ...override.renderState } : baseState;
}

function requiresTransparentRenderState(material: GLTFMaterialAsset): boolean {
  if (material.alphaMode === "BLEND") return !isEffectivelyOpaqueBlendMaterial(material);
  if (material.alphaMode !== "OPAQUE") return false;
  if (usesUnbackedScalarTransmission(material)) return false;
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

function usesUnbackedScalarTransmission(material: GLTFMaterialAsset): boolean {
  return material.alphaMode === "OPAQUE"
    && (material.transmission?.factor ?? 0) > 0.001
    && material.transmission?.texture === undefined
    && material.diffuseTransmission === undefined
    && material.volume === undefined;
}

function usesOpaqueDoubleSidedClearcoatShell(material: GLTFMaterialAsset): boolean {
  return material.alphaMode === "OPAQUE"
    && material.doubleSided
    && (material.clearcoat?.factor ?? 0) > 0.001
    && material.metallicFactor > 0.35
    && material.roughnessFactor <= 0.42;
}

function renderPbrBaseColorFactor(material: GLTFMaterialAsset): readonly [number, number, number, number] {
  if (!usesUnbackedScalarTransmission(material)) return material.baseColorFactor;
  const maxColor = Math.max(material.baseColorFactor[0], material.baseColorFactor[1], material.baseColorFactor[2]);
  if (maxColor < 0.8) return material.baseColorFactor;
  return [0.028, 0.036, 0.044, material.baseColorFactor[3]];
}

function renderPbrRoughnessFactor(material: GLTFMaterialAsset): number {
  if (!usesUnbackedScalarTransmission(material)) return material.roughnessFactor;
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

function pbrExtensionScalarOptions(material: GLTFMaterialAsset): {
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
      transmissionFactor: usesUnbackedScalarTransmission(material) ? 0 : material.transmission.factor,
      transmissionFallbackEnergy: renderTransmissionFallbackEnergy(material)
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
  getTexture: (info: GLTFResolvedTextureInfo, colorSpace: GLTFTextureColorSpace) => Promise<Texture>
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
      clearcoatNormalTexture: await getTexture(clearcoatNormalTexture, "linear"),
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
      anisotropyTexture: await getTexture(anisotropyTexture, "linear"),
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

function renderTransmissionFallbackEnergy(material: GLTFMaterialAsset): number {
  const usesUnbackedCutoutTransmission = material.alphaMode === "MASK" && material.transmission?.texture === undefined && material.volume === undefined;
  return usesUnbackedCutoutTransmission || usesUnbackedScalarTransmission(material) ? 0 : 0.08;
}

function pbrTextureTexCoords(material: GLTFMaterialAsset): Partial<Record<TexturedPBRTextureSlot, number>> {
  return {
    ...(material.baseColorTexture ? { baseColor: renderTexCoord(material.baseColorTexture.texCoord) } : {}),
    ...(material.normalTexture ? { normal: renderTexCoord(material.normalTexture.texCoord) } : {}),
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
  getTexture: (info: GLTFResolvedTextureInfo, colorSpace: GLTFTextureColorSpace) => Promise<Texture>
): Promise<void> {
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
    runtimeMaterial.setParameter("u_transmissionFactor", usesUnbackedScalarTransmission(material) ? 0 : material.transmission.factor);
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
  getTexture: (info: GLTFResolvedTextureInfo, colorSpace: GLTFTextureColorSpace) => Promise<Texture>,
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
  getTexture: (info: GLTFResolvedTextureInfo, colorSpace: GLTFTextureColorSpace) => Promise<Texture>,
  uniformName = `gltf-texture-${info.texture}`,
  sampler?: Sampler
): Promise<TextureBinding> {
  return new TextureBinding({
    name: uniformName,
    texture: await getTexture(info, colorSpace),
    sampler: sampler ?? createSampler(asset.textures[info.texture]),
    required: true,
    expectedColorSpace: colorSpace,
    transform: info.transform
  });
}

function requiresTexturedPBRMaterial(material: GLTFMaterialAsset): boolean {
  return Boolean(
    material.baseColorTexture ||
    material.normalTexture ||
    material.metallicRoughnessTexture ||
    material.occlusionTexture ||
    material.emissiveTexture ||
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

async function decodeImageInBrowser(
  image: GLTFImageAsset,
  _imageIndex: number,
  asset: GLTFAsset,
  options: GLTFRenderResourceOptions = {}
): Promise<DecodedGLTFImage> {
  if (isKTX2BasisImage(image)) {
    const bytes = await readImageBytes(asset, image);
    return transcodeKTX2BasisTexture(bytes, {
      ...options.ktx2BasisTranscoderOptions,
      targetFormat: options.ktx2BasisTargetFormat ?? options.ktx2BasisTranscoderOptions?.targetFormat
    });
  }
  if (typeof createImageBitmap === "function") {
    const blob = image.data
      ? new Blob([image.data], { type: image.mimeType ?? "application/octet-stream" })
      : await fetchImageBlob(asset, image);
    const bitmap = await createImageBitmap(blob, {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none"
    });
    return { width: bitmap.width, height: bitmap.height, source: bitmap, colorSpace: "srgb" };
  }
  const ImageCtor = globalThis.Image;
  if (!ImageCtor || !image.uri) {
    throw new Error("glTF image decoding requires createImageBitmap, HTMLImageElement, or a custom imageDecoder");
  }
  const imageElement = new ImageCtor();
  const url = resolveImageUrl(asset.url, image.uri);
  return new Promise((resolve, reject) => {
    imageElement.onload = () => resolve({ width: imageElement.width, height: imageElement.height, source: imageElement, colorSpace: "srgb" });
    imageElement.onerror = () => reject(new Error(`glTF image decode failed for ${url}`));
    imageElement.src = url;
  });
}

function createSamplerForInfo(asset: GLTFAsset, info: GLTFResolvedTextureInfo): Sampler {
  return createSampler(asset.textures[info.texture]);
}

async function readImageBytes(asset: GLTFAsset, image: GLTFImageAsset): Promise<ArrayBuffer> {
  if (image.data) return image.data.slice(0);
  const blob = await fetchImageBlob(asset, image);
  return blob.arrayBuffer();
}

async function fetchImageBlob(asset: GLTFAsset, image: GLTFImageAsset): Promise<Blob> {
  if (!image.uri) {
    throw new Error("glTF image has no uri or embedded data");
  }
  if (typeof fetch !== "function") {
    throw new Error("glTF image fetch requires fetch or a custom imageDecoder");
  }
  const response = await fetch(resolveImageUrl(asset.url, image.uri));
  if (!response.ok) {
    throw new Error(`glTF image request failed with ${response.status}`);
  }
  return response.blob();
}

function isKTX2BasisImage(image: GLTFImageAsset): boolean {
  return image.mimeType === "image/ktx2" || /\.ktx2(?:[?#]|$)/i.test(image.uri ?? "");
}

function createFallbackTexture(label: string, colorSpace: GLTFTextureColorSpace): Texture {
  return new Texture({
    width: 1,
    height: 1,
    colorSpace,
    label: `${label} (missing-texture-fallback)`,
    data: new Uint8Array([255, 255, 255, 255])
  });
}

function warnMissingGLTFTexture(textureName: string, imageUri: string | undefined, reason: string): void {
  if (typeof console === "undefined" || typeof console.warn !== "function") return;
  const source = imageUri ? ` (${imageUri})` : "";
  console.warn(
    `glTF texture "${textureName}"${source} could not be loaded; falling back to baseColorFactor. Reason: ${reason}`
  );
}

function resolveImageUrl(assetUrl: string, imageUri: string): string {
  if (/^(?:data:|blob:|https?:|file:)/i.test(imageUri)) return imageUri;
  if (assetUrl.startsWith("data:")) {
    throw new Error(`Relative glTF image uri ${imageUri} cannot be resolved from a data URL asset`);
  }
  return new URL(imageUri, resolveAbsoluteAssetBase(assetUrl)).toString();
}

/**
 * Derive an absolute base URL for resolving relative texture URIs.
 *
 * Catalog assets are often loaded from root-relative paths (e.g.
 * `/aura-assets/x.glb`). `new URL(uri, base)` requires `base` to be absolute, so
 * a bare relative `assetUrl` throws `Failed to construct 'URL': Invalid base URL`.
 * If the asset URL is already absolute we use it directly; otherwise we resolve it
 * against the document/origin base when running in a browser, falling back to a
 * synthetic `file:///` origin so resolution never throws in non-browser contexts.
 */
function resolveAbsoluteAssetBase(assetUrl: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(assetUrl)) return assetUrl;
  const documentBase =
    (typeof document !== "undefined" && document.baseURI) ||
    (typeof location !== "undefined" && location.href) ||
    undefined;
  if (documentBase) {
    try {
      return new URL(assetUrl, documentBase).toString();
    } catch {
      // fall through to synthetic base below
    }
  }
  return new URL(assetUrl, "file:///").toString();
}
