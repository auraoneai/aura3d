import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;

export type V6AssetClass = "product" | "automotive" | "character" | "materials" | "animation" | "asset";

export interface V6AssetCorpusRequirements {
  readonly minimumRealGlbAssets: number;
  readonly minimumVisualFlagshipAssets: number;
  readonly minimumPbrTextureAssets: number;
  readonly minimumAdvancedMaterialAssets: number;
  readonly minimumAnimationAssets: number;
  readonly minimumTotalBytes: number;
  readonly everyAssetRequiresLicenseSourceShaAndLocalPath: boolean;
  readonly mustParseGlbJsonChunk: boolean;
  readonly mustRejectPrimitiveOnlyProof: boolean;
}

export interface V6AssetManifestEntry {
  readonly id: string;
  readonly name: string;
  readonly class: V6AssetClass;
  readonly role: string;
  readonly localPath: string;
  readonly license: string;
  readonly repository: string;
  readonly revision: string;
  readonly sourcePath: string;
  readonly sourceUri: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly tags: readonly string[];
  readonly renderRequirements: readonly string[];
}

export interface V6AssetManifest {
  readonly schema: "a3d-production-runtime-real-asset-corpus/v1";
  readonly sourceManifest: string;
  readonly requirements: V6AssetCorpusRequirements;
  readonly claimBoundary: string;
  readonly assets: readonly V6AssetManifestEntry[];
}

export interface V6GlbInspection {
  readonly validGlb: boolean;
  readonly version: number;
  readonly jsonChunkBytes: number;
  readonly sceneCount: number;
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly primitiveCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly imageCount: number;
  readonly animationCount: number;
  readonly skinCount: number;
  readonly morphTargetPrimitiveCount: number;
  readonly extensionCount: number;
  readonly extensionsUsed: readonly string[];
  readonly pbrMaterialCount: number;
  readonly texturedPbrMaterialCount: number;
  readonly advancedMaterialExtensionCount: number;
  readonly hasRealSceneComplexity: boolean;
}

export interface V6AssetReadinessEntry {
  readonly id: string;
  readonly localPath: string;
  readonly exists: boolean;
  readonly sha256Matches: boolean;
  readonly bytesMatch: boolean;
  readonly licenseReviewRequired: boolean;
  readonly inspection: V6GlbInspection | null;
}

export interface V6AssetCorpusSummary {
  readonly schema: "a3d-production-runtime-asset-readiness/v1";
  readonly pass: boolean;
  readonly assetCount: number;
  readonly existingAssetCount: number;
  readonly shaVerifiedAssetCount: number;
  readonly realGlbParsedCount: number;
  readonly visualFlagshipAssetCount: number;
  readonly totalBytes: number;
  readonly pbrTextureAssetCount: number;
  readonly advancedMaterialAssetCount: number;
  readonly animationAssetCount: number;
  readonly skinAssetCount: number;
  readonly morphAssetCount: number;
  readonly classCoverage: readonly string[];
  readonly extensionCoverage: readonly string[];
  readonly primitiveOnlyRejected: boolean;
  readonly failures: readonly string[];
  readonly entries: readonly V6AssetReadinessEntry[];
}

export function loadV6AssetManifest(path = "fixtures/asset-corpus/manifest.json"): V6AssetManifest {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as V6AssetManifest;
}

export function inspectV6Glb(path: string): V6GlbInspection {
  const data = readFileSync(resolve(path));
  if (data.byteLength < 20 || data.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`Not a GLB file: ${path}`);
  }
  const version = data.readUInt32LE(4);
  const firstChunkLength = data.readUInt32LE(12);
  const firstChunkType = data.readUInt32LE(16);
  if (firstChunkType !== JSON_CHUNK_TYPE) {
    throw new Error(`GLB missing JSON chunk: ${path}`);
  }
  const jsonText = data.toString("utf8", 20, 20 + firstChunkLength).trim();
  const gltf = JSON.parse(jsonText) as {
    scenes?: readonly unknown[];
    nodes?: readonly unknown[];
    meshes?: readonly { primitives?: readonly { targets?: readonly unknown[] }[] }[];
    materials?: readonly {
      pbrMetallicRoughness?: {
        baseColorTexture?: unknown;
        metallicRoughnessTexture?: unknown;
      };
      normalTexture?: unknown;
      occlusionTexture?: unknown;
      emissiveTexture?: unknown;
      extensions?: Record<string, unknown>;
    }[];
    textures?: readonly unknown[];
    images?: readonly unknown[];
    animations?: readonly unknown[];
    skins?: readonly unknown[];
    extensionsUsed?: readonly string[];
  };
  const meshes = gltf.meshes ?? [];
  const materials = gltf.materials ?? [];
  const primitives = meshes.flatMap((mesh) => mesh.primitives ?? []);
  const pbrMaterialCount = materials.filter((material) => material.pbrMetallicRoughness).length;
  const texturedPbrMaterialCount = materials.filter((material) => {
    const pbr = material.pbrMetallicRoughness;
    return Boolean(pbr?.baseColorTexture || pbr?.metallicRoughnessTexture || material.normalTexture || material.occlusionTexture || material.emissiveTexture);
  }).length;
  const advancedMaterialExtensionCount = materials.filter((material) => {
    const extensionNames = Object.keys(material.extensions ?? {});
    return extensionNames.some((name) => /^KHR_materials_/.test(name));
  }).length;
  const extensionsUsed = [...new Set([...(gltf.extensionsUsed ?? []), ...materials.flatMap((material) => Object.keys(material.extensions ?? {}))])].sort();
  const morphTargetPrimitiveCount = primitives.filter((primitive) => (primitive.targets?.length ?? 0) > 0).length;
  return {
    validGlb: true,
    version,
    jsonChunkBytes: firstChunkLength,
    sceneCount: gltf.scenes?.length ?? 0,
    nodeCount: gltf.nodes?.length ?? 0,
    meshCount: meshes.length,
    primitiveCount: primitives.length,
    materialCount: materials.length,
    textureCount: gltf.textures?.length ?? 0,
    imageCount: gltf.images?.length ?? 0,
    animationCount: gltf.animations?.length ?? 0,
    skinCount: gltf.skins?.length ?? 0,
    morphTargetPrimitiveCount,
    extensionCount: extensionsUsed.length,
    extensionsUsed,
    pbrMaterialCount,
    texturedPbrMaterialCount,
    advancedMaterialExtensionCount,
    hasRealSceneComplexity: primitives.length > 0 && (materials.length > 0 || (gltf.animations?.length ?? 0) > 0 || (gltf.skins?.length ?? 0) > 0)
  };
}

export function createV6AssetCorpusSummary(manifest = loadV6AssetManifest()): V6AssetCorpusSummary {
  const entries = manifest.assets.map((asset): V6AssetReadinessEntry => {
    const path = resolve(asset.localPath);
    const exists = existsSync(path);
    const bytesMatch = exists && statSync(path).size === asset.bytes;
    const sha256Matches = exists && createHash("sha256").update(readFileSync(path)).digest("hex") === asset.sha256;
    const inspection = exists ? inspectV6Glb(path) : null;
    return {
      id: asset.id,
      localPath: asset.localPath,
      exists,
      sha256Matches,
      bytesMatch,
      licenseReviewRequired: /review|non-commercial|trademark|SCEA|CC-BY-NC/i.test(asset.license),
      inspection
    };
  });
  const inspections = entries.flatMap((entry) => entry.inspection ? [entry.inspection] : []);
  const pbrTextureAssetCount = entries.filter((entry) => (entry.inspection?.texturedPbrMaterialCount ?? 0) > 0).length;
  const advancedMaterialAssetCount = entries.filter((entry) => (entry.inspection?.advancedMaterialExtensionCount ?? 0) > 0 || /clearcoat|sheen|specular/i.test(manifest.assets.find((asset) => asset.id === entry.id)?.tags.join(" ") ?? "")).length;
  const animationAssetCount = entries.filter((entry) => (entry.inspection?.animationCount ?? 0) > 0 || /animation/i.test(manifest.assets.find((asset) => asset.id === entry.id)?.tags.join(" ") ?? "")).length;
  const totalBytes = manifest.assets.reduce((total, asset) => total + asset.bytes, 0);
  const extensionCoverage = [...new Set(inspections.flatMap((inspection) => inspection.extensionsUsed))].sort();
  const primitiveOnlyRejected = inspections.every((inspection) => inspection.hasRealSceneComplexity);
  const failures = [
    ...(manifest.assets.length < manifest.requirements.minimumRealGlbAssets ? [`asset count ${manifest.assets.length} is below ${manifest.requirements.minimumRealGlbAssets}`] : []),
    ...(entries.filter((entry) => entry.exists).length < manifest.requirements.minimumRealGlbAssets ? ["too few local GLB assets exist"] : []),
    ...(entries.some((entry) => !entry.sha256Matches) ? ["one or more GLB sha256 checks failed"] : []),
    ...(entries.some((entry) => !entry.bytesMatch) ? ["one or more GLB byte-size checks failed"] : []),
    ...(inspections.length < manifest.requirements.minimumRealGlbAssets ? ["too few GLB JSON chunks parsed"] : []),
    ...(manifest.assets.filter((asset) => asset.role.startsWith("flagship")).length < manifest.requirements.minimumVisualFlagshipAssets ? ["too few flagship visual assets"] : []),
    ...(pbrTextureAssetCount < manifest.requirements.minimumPbrTextureAssets ? ["too few textured PBR assets"] : []),
    ...(advancedMaterialAssetCount < manifest.requirements.minimumAdvancedMaterialAssets ? ["too few advanced material extension assets"] : []),
    ...(animationAssetCount < manifest.requirements.minimumAnimationAssets ? ["too few animation assets"] : []),
    ...(totalBytes < manifest.requirements.minimumTotalBytes ? [`total bytes ${totalBytes} is below ${manifest.requirements.minimumTotalBytes}`] : []),
    ...(manifest.requirements.mustRejectPrimitiveOnlyProof && !primitiveOnlyRejected ? ["primitive-only or uninspectable assets are present"] : [])
  ];
  return {
    schema: "a3d-production-runtime-asset-readiness/v1",
    pass: failures.length === 0,
    assetCount: manifest.assets.length,
    existingAssetCount: entries.filter((entry) => entry.exists).length,
    shaVerifiedAssetCount: entries.filter((entry) => entry.sha256Matches).length,
    realGlbParsedCount: inspections.length,
    visualFlagshipAssetCount: manifest.assets.filter((asset) => asset.role.startsWith("flagship")).length,
    totalBytes,
    pbrTextureAssetCount,
    advancedMaterialAssetCount,
    animationAssetCount,
    skinAssetCount: entries.filter((entry) => (entry.inspection?.skinCount ?? 0) > 0).length,
    morphAssetCount: entries.filter((entry) => (entry.inspection?.morphTargetPrimitiveCount ?? 0) > 0).length,
    classCoverage: [...new Set(manifest.assets.map((asset) => asset.class))].sort(),
    extensionCoverage,
    primitiveOnlyRejected,
    failures,
    entries
  };
}
