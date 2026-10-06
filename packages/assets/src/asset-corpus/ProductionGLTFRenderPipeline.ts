import type { CameraLike, RenderSource } from "@aura3d/rendering";
import type { CompressedTextureCapabilities } from "@aura3d/rendering/contracts";
import type { GLTFAsset, GLTFDracoDecoder, GLTFLoaderDiagnostics, GLTFMeshoptDecoder } from "../GLTFLoader";
import { createGLTFRenderResources, type GLTFImageDecoder, type GLTFRenderResourceOptions, type GLTFRenderResources, type GLTFRendererInputOptions } from "../GLTFRenderResources";
import { acquireParsedGLTFAsset } from "../GLTFAssetParseCache";
import { AssetDecoderUnavailable, createAssetDecoderRegistry } from "../contracts/decoders";
import type { KTX2BasisTargetFormat } from "../KTX2BasisTextureTranscoder";

export interface ProductionGLTFRenderPipelineOptions {
  readonly url: string;
  readonly assetId: string;
  readonly assetName?: string;
  readonly imageDecoder?: GLTFImageDecoder;
  readonly dracoDecoder?: GLTFDracoDecoder;
  readonly meshoptDecoder?: GLTFMeshoptDecoder;
  readonly materialVariant?: GLTFRenderResourceOptions["materialVariant"];
  readonly sceneIndex?: GLTFRenderResourceOptions["sceneIndex"];
  readonly sceneName?: GLTFRenderResourceOptions["sceneName"];
  readonly materialRenderStateOverrides?: GLTFRenderResourceOptions["materialRenderStateOverrides"];
  /** GPU-bytes texture budget forwarded to resource creation (C-27, PRD-04 P2-11). */
  readonly textureBudget?: GLTFRenderResourceOptions["textureBudget"];
  /** Max texture dimension forwarded to resource creation (C-27, PRD-04 P2-11). */
  readonly maxTextureSize?: GLTFRenderResourceOptions["maxTextureSize"];
  /** Tangent-generation policy forwarded to resource creation (PRD-04 P5-4, C-18). */
  readonly tangents?: GLTFRenderResourceOptions["tangents"];
  /** `A3D_QR_MATERIALS` state forwarded by `createTypedGLBActor` (PRD-04 flag channel). */
  readonly materialsR185?: GLTFRenderResourceOptions["materialsR185"];
  /** `A3D_QR_MATERIALS_TRANSMISSION` state forwarded by `createTypedGLBActor` (P4-3 E22 gate). */
  readonly materialsTransmission?: GLTFRenderResourceOptions["materialsTransmission"];
  /** Forwarded `renderer.material.transmission` mode (PRD-04 P4-3). */
  readonly transmission?: GLTFRenderResourceOptions["transmission"];
  /**
   * PRD-04 P5-2 (C-16): decoder configuration. When present the pipeline pre-scans the asset's
   * `extensionsUsed`/`extensionsRequired`, `require()`s the needed decoders from a
   * `createAssetDecoderRegistry` (same-origin `basePath`, default `/aura-decoders/`), and feeds
   * the resolved draco/meshopt decoders into the parse cache plus the ktx2 image decoder into
   * resource creation. `draco`/`meshopt`/`ktx2: false` opts that decoder out; a required decoder
   * that is disabled or fails to load throws `AssetDecoderUnavailable` and surfaces a
   * `decoder-missing` warning naming the extension.
   */
  readonly decoders?: {
    readonly basePath?: string;
    readonly meshopt?: boolean;
    readonly draco?: boolean;
    readonly ktx2?: boolean;
    readonly workerCount?: number;
  };
  /**
   * Compressed texture capabilities used for the ktx2 target-format pick (P5-2). Defaults to
   * all-false — the Basis transcode falls back to `rgba8` rather than claiming a format the
   * device may not support.
   */
  readonly compressedTextureCapabilities?: CompressedTextureCapabilities;
  /** Basis transcoder settings forwarded to resource creation (C-16); the registry's capability-picked targetFormat merges under this. */
  readonly ktx2BasisTranscoderOptions?: GLTFRenderResourceOptions["ktx2BasisTranscoderOptions"];
  readonly rendererInput?: GLTFRendererInputOptions;
  readonly width?: number;
  readonly height?: number;
  /**
   * Share one runtime material instance across glTF materials whose definitions are identical apart
   * from their name, so renderer static batching can collapse them. See
   * `GLTFRenderResourceOptions.deduplicateIdenticalMaterials`.
   */
  readonly deduplicateIdenticalMaterials?: boolean;
}

export interface ProductionGLTFRenderMetadata {
  readonly assetId: string;
  readonly assetName: string;
  readonly assetUri: string;
  readonly meshCount: number;
  readonly primitiveCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly imageCount: number;
  readonly animationCount: number;
  readonly skinCount: number;
  readonly morphTargetCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly textureSlots: readonly string[];
  readonly materialFeatures: readonly string[];
  readonly extensionsUsed: readonly string[];
  readonly extensionsRequired: readonly string[];
  readonly unsupportedExtensions: readonly string[];
  readonly pbrTextureCount: number;
  readonly normalMapCount: number;
  readonly ormTextureCount: number;
  readonly emissiveTextureCount: number;
  readonly materialExtensionCoverage: readonly string[];
  readonly warnings: readonly ProductionGLTFRenderWarning[];
  readonly hasPbr: boolean;
  readonly hasSkinning: boolean;
  readonly hasMorphTargets: boolean;
  readonly hasAnimation: boolean;
}

export interface ProductionGLTFRenderWarning {
  readonly code: string;
  readonly severity: "info" | "warning";
  readonly message: string;
  readonly nextAction: string;
}

export interface ProductionGLTFRenderPipeline {
  readonly asset: GLTFAsset;
  readonly resources: GLTFRenderResources;
  readonly source: RenderSource;
  readonly camera: CameraLike;
  readonly metadata: ProductionGLTFRenderMetadata;
  dispose(): void;
}

/** glTF extensions that require a registered decoder (P5-2). */
const GLTF_DECODER_EXTENSIONS: Readonly<Record<string, "meshopt" | "draco" | "ktx2">> = {
  EXT_meshopt_compression: "meshopt",
  KHR_meshopt_compression: "meshopt",
  KHR_draco_mesh_compression: "draco",
  KHR_texture_basisu: "ktx2"
};

const NO_COMPRESSED_CAPABILITIES: CompressedTextureCapabilities = {
  astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false
};

/**
 * Reads `extensionsUsed`/`extensionsRequired` without running the full loader: GLB files expose
 * the JSON chunk after the 12-byte header + 8-byte chunk header; `.gltf` is plain JSON.
 */
export async function scanGLTFExtensionsUsed(url: string): Promise<readonly string[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`glTF extension scan failed for ${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const GLB_MAGIC = 0x46546c67;
  let jsonText: string;
  if (bytes.length >= 20 && new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === GLB_MAGIC) {
    const jsonLength = new DataView(bytes.buffer, bytes.byteOffset + 12, 4).getUint32(0, true);
    jsonText = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength));
  } else {
    jsonText = new TextDecoder().decode(bytes);
  }
  const json = JSON.parse(jsonText) as { extensionsUsed?: readonly string[]; extensionsRequired?: readonly string[] };
  return [...new Set([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])])];
}

export function requiredGLTFDecoders(extensionsUsed: readonly string[]): readonly ("meshopt" | "draco" | "ktx2")[] {
  const required = new Set<"meshopt" | "draco" | "ktx2">();
  for (const extension of extensionsUsed) {
    const id = GLTF_DECODER_EXTENSIONS[extension];
    if (id) required.add(id);
  }
  return [...required];
}

export async function loadProductionGLTFRenderPipeline(options: ProductionGLTFRenderPipelineOptions): Promise<ProductionGLTFRenderPipeline> {
  const loadWarnings: ProductionGLTFRenderWarning[] = [];
  let dracoDecoder = options.dracoDecoder;
  let meshoptDecoder = options.meshoptDecoder;
  const imageDecoder = options.imageDecoder;
  let ktx2BasisTranscoderOptions = options.ktx2BasisTranscoderOptions;

  // P5-2 (C-16): when `options.decoders` is given, pre-scan the asset's declared extensions and
  // require the matching decoders before the parse cache runs — the parse itself needs draco /
  // meshopt, so this must happen ahead of `acquireParsedGLTFAsset`.
  if (options.decoders) {
    const extensionsUsed = await scanGLTFExtensionsUsed(options.url);
    const required = requiredGLTFDecoders(extensionsUsed);
    const disabled = required.filter((id) => options.decoders?.[id] === false);
    if (disabled.length > 0) {
      const id = disabled[0]!;
      const extension = Object.keys(GLTF_DECODER_EXTENSIONS).find((key) => GLTF_DECODER_EXTENSIONS[key] === id);
      loadWarnings.push({
        code: "decoder-missing",
        severity: "warning",
        message: `glTF asset declares ${extension} but the ${id} decoder is disabled in assets.decoders.`,
        nextAction: `Enable assets.decoders.${id} or ship an asset without ${extension}.`
      });
      throw new AssetDecoderUnavailable(id, options.url);
    }
    const registry = createAssetDecoderRegistry({
      basePath: options.decoders.basePath ?? "/aura-decoders/",
      capabilities: options.compressedTextureCapabilities ?? NO_COMPRESSED_CAPABILITIES,
      maxTextureSize: options.maxTextureSize ?? 4096,
      workerCount: options.decoders.workerCount ?? 1
    });
    try {
      const set = await registry.require(required);
      dracoDecoder ??= set.draco as GLTFDracoDecoder | undefined;
      meshoptDecoder ??= set.meshopt as GLTFMeshoptDecoder | undefined;
      // C-16's ktx2 half is a transcode-target pick (`{targetFormat}`), not a decoder function:
      // it merges into `ktx2BasisTranscoderOptions` so `decodeImageInBrowser` transcodes to the
      // capability-selected format. An explicit options.ktx2BasisTranscoderOptions wins.
      const imageDecoderHint = set.imageDecoder as { readonly targetFormat?: KTX2BasisTargetFormat } | undefined;
      if (imageDecoderHint?.targetFormat) {
        ktx2BasisTranscoderOptions = { targetFormat: imageDecoderHint.targetFormat, ...ktx2BasisTranscoderOptions };
      }
    } catch (error) {
      if (error instanceof AssetDecoderUnavailable) {
        loadWarnings.push({
          code: "decoder-missing",
          severity: "warning",
          message: `glTF decoder "${error.decoderId}" could not be loaded from ${error.url}.`,
          nextAction: "Check the decoder basePath and that the asset's compression extensions are enabled."
        });
      }
      throw error;
    }
  }

  /*
   * The parsed GLB is shared through a reference-counted cache (see `GLTFAssetParseCache`); the
   * render resources below stay per-pipeline because actors mutate their own scene graph, materials
   * and geometries. `dispose()` releases the one reference this pipeline took.
   */
  const lease = await acquireParsedGLTFAsset({
    url: options.url,
    ...(dracoDecoder ? { dracoDecoder } : {}),
    ...(meshoptDecoder ? { meshoptDecoder } : {})
  });
  let resources: GLTFRenderResources;
  let rendererInput: ReturnType<GLTFRenderResources["toRendererInput"]>;
  try {
    resources = await createGLTFRenderResources(lease.asset, {
      ...(imageDecoder ? { imageDecoder } : {}),
      ...(ktx2BasisTranscoderOptions ? { ktx2BasisTranscoderOptions } : {}),
      ...(options.materialVariant !== undefined ? { materialVariant: options.materialVariant } : {}),
      ...(options.sceneIndex !== undefined ? { sceneIndex: options.sceneIndex } : {}),
      ...(options.sceneName !== undefined ? { sceneName: options.sceneName } : {}),
      ...(options.materialRenderStateOverrides ? { materialRenderStateOverrides: options.materialRenderStateOverrides } : {}),
      ...(options.textureBudget !== undefined ? { textureBudget: options.textureBudget } : {}),
      ...(options.maxTextureSize !== undefined ? { maxTextureSize: options.maxTextureSize } : {}),
      ...(options.tangents !== undefined ? { tangents: options.tangents } : {}),
      ...(options.materialsR185 ? { materialsR185: true } : {}),
      ...(options.materialsTransmission ? { materialsTransmission: true } : {}),
      ...(options.transmission !== undefined ? { transmission: options.transmission } : {}),
      ...(options.deduplicateIdenticalMaterials ? { deduplicateIdenticalMaterials: true } : {})
    });
    rendererInput = resources.toRendererInput(
      { width: options.width ?? 512, height: options.height ?? 512 },
      {
        qualityPreset: "hdr-studio-preview",
        cameraPolicy: "require",
        ...options.rendererInput
      }
    );
  } catch (error) {
    // Resource creation failed after the parse succeeded: give the reference back so the shared
    // asset is not pinned by a pipeline that does not exist.
    lease.release();
    throw error;
  }
  const asset = lease.asset;
  const baseMetadata = createProductionGLTFRenderMetadata(asset, options.assetId, options.assetName ?? options.assetId);
  let disposed = false;
  return {
    asset,
    resources,
    source: rendererInput.source,
    camera: rendererInput.camera,
    metadata: {
      ...baseMetadata,
      warnings: [...loadWarnings, ...baseMetadata.warnings]
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      resources.dispose();
      lease.release();
    }
  };
}

export function createProductionGLTFRenderMetadata(asset: GLTFAsset, assetId: string, assetName: string): ProductionGLTFRenderMetadata {
  const diagnostics: GLTFLoaderDiagnostics = asset.loaderDiagnostics;
  const materialExtensionCoverage = [...new Set(asset.materials.flatMap((material) => [
    ...(material.clearcoat ? ["KHR_materials_clearcoat"] : []),
    ...(material.sheen ? ["KHR_materials_sheen"] : []),
    ...(material.specular ? ["KHR_materials_specular"] : []),
    ...(material.transmission ? ["KHR_materials_transmission"] : []),
    ...(material.volume ? ["KHR_materials_volume"] : []),
    ...(material.ior !== undefined ? ["KHR_materials_ior"] : []),
    ...(material.anisotropy ? ["KHR_materials_anisotropy"] : []),
    ...(material.iridescence ? ["KHR_materials_iridescence"] : []),
    ...(material.dispersion !== undefined ? ["KHR_materials_dispersion"] : [])
  ]))].sort();
  const pbrTextureCount = asset.materials.filter((material) => material.baseColorTexture || material.metallicRoughnessTexture).length;
  return {
    assetId,
    assetName,
    assetUri: asset.url,
    meshCount: diagnostics.meshCount,
    primitiveCount: diagnostics.primitiveCount,
    materialCount: diagnostics.materialCount,
    textureCount: diagnostics.textureCount,
    imageCount: diagnostics.imageCount,
    animationCount: diagnostics.animationCount,
    skinCount: diagnostics.skinCount,
    morphTargetCount: diagnostics.morphTargetCount,
    vertexCount: diagnostics.vertexCount,
    indexCount: diagnostics.indexCount,
    textureSlots: diagnostics.textureSlots,
    materialFeatures: diagnostics.materialFeatures,
    extensionsUsed: diagnostics.extensionsUsed,
    extensionsRequired: diagnostics.extensionsRequired,
    unsupportedExtensions: diagnostics.unsupportedExtensions,
    pbrTextureCount,
    normalMapCount: asset.materials.filter((material) => material.normalTexture).length,
    ormTextureCount: asset.materials.filter((material) => material.metallicRoughnessTexture || material.occlusionTexture).length,
    emissiveTextureCount: asset.materials.filter((material) => material.emissiveTexture).length,
    materialExtensionCoverage,
    warnings: createProductionGLTFRenderWarnings(diagnostics, materialExtensionCoverage),
    hasPbr: asset.materials.some((material) => !material.unlit),
    hasSkinning: diagnostics.skinCount > 0 || asset.meshes.some((mesh) => mesh.skinIndex !== undefined),
    hasMorphTargets: diagnostics.morphTargetCount > 0,
    hasAnimation: diagnostics.animationCount > 0
  };
}

function createProductionGLTFRenderWarnings(
  diagnostics: GLTFLoaderDiagnostics,
  materialExtensionCoverage: readonly string[]
): readonly ProductionGLTFRenderWarning[] {
  const warnings: ProductionGLTFRenderWarning[] = [];
  for (const extension of diagnostics.unsupportedExtensions) {
    warnings.push({
      code: "unsupported-gltf-extension",
      severity: "warning",
      message: `Optional glTF extension ${extension} was present but is not supported by the A3D render path.`,
      nextAction: "Keep the asset loaded if the extension is optional, but inspect the visual output and document the missing feature before claiming parity."
    });
  }
  for (const extension of materialExtensionCoverage) {
    if (extension === "KHR_materials_transmission" || extension === "KHR_materials_volume") {
      warnings.push({
        code: "bounded-material-extension",
        severity: "info",
        message: `${extension} data is imported, but current production runtime visual parity is bounded and must be checked against the product-viewer comparison output.`,
        nextAction: "Use a focused material-extension scene before claiming full glass/transmission/volume parity."
      });
    }
  }
  if (diagnostics.animationCount > 0 || diagnostics.skinCount > 0 || diagnostics.morphTargetCount > 0) {
    warnings.push({
      code: "animation-skin-morph-readiness",
      severity: "info",
      message: "The asset contains animation, skinning, or morph data; production metadata preserves it, but the product viewer must explicitly enable the workflow before claiming interactive character parity.",
      nextAction: "Run animation/skinning/morph browser evidence for this asset."
    });
  }
  return warnings;
}
