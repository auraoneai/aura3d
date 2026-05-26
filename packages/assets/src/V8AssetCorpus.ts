import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;

export type V8AssetClass =
  | "product"
  | "automotive"
  | "character"
  | "animation"
  | "materials"
  | "architecture"
  | "physics";

export interface V8AssetRequirement {
  readonly minimumAssetCount: number;
  readonly minimumTotalBytes: number;
  readonly minimumTotalTriangles: number;
  readonly minimumTexturedPbrAssets: number;
  readonly minimumAnimationAssets: number;
  readonly minimumSkinAssets: number;
  readonly minimumMorphAssets: number;
  readonly minimumMaterialExtensionAssets: number;
  readonly requiredClasses: readonly V8AssetClass[];
  readonly requiredFeatures: readonly string[];
}

export interface V8AssetManifestEntry {
  readonly id: string;
  readonly name: string;
  readonly class: V8AssetClass;
  readonly role: string;
  readonly localPath: string;
  readonly source: string;
  readonly sourceUri: string;
  readonly license: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly triangleCount: number;
  readonly textureCount: number;
  readonly animationCount: number;
  readonly skinCount: number;
  readonly morphTargetCount: number;
  readonly materialExtensionCount: number;
  readonly tags: readonly string[];
  readonly requiredFeatures: readonly string[];
}

export interface V8EnvironmentManifestEntry {
  readonly id: string;
  readonly name: string;
  readonly localPath: string;
  readonly source: string;
  readonly sourceUri: string;
  readonly license: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly tags: readonly string[];
}

export interface V8AssetManifest {
  readonly schema: "a3d-v8-local-asset-corpus/v1";
  readonly claimBoundary: string;
  readonly requirements: V8AssetRequirement;
  readonly assets: readonly V8AssetManifestEntry[];
  readonly environments: readonly V8EnvironmentManifestEntry[];
}

export interface V8GlbInspection {
  readonly validGlb: boolean;
  readonly version: number;
  readonly jsonChunkBytes: number;
  readonly sceneCount: number;
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly primitiveCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly materialCount: number;
  readonly texturedPbrMaterialCount: number;
  readonly textureCount: number;
  readonly imageCount: number;
  readonly animationCount: number;
  readonly animationChannelCount: number;
  readonly animationSamplerCount: number;
  readonly skinCount: number;
  readonly jointCount: number;
  readonly morphTargetPrimitiveCount: number;
  readonly morphTargetCount: number;
  readonly materialExtensionCount: number;
  readonly materialTextureSlotCount: number;
  readonly textureTransformCount: number;
  readonly materialVariantCount: number;
  readonly extensionsUsed: readonly string[];
  readonly extensionsRequired: readonly string[];
  readonly features: readonly string[];
  readonly unsupportedRequiredExtensions: readonly string[];
}

export interface V8AssetReadinessEntry {
  readonly id: string;
  readonly localPath: string;
  readonly exists: boolean;
  readonly bytesMatch: boolean;
  readonly sha256Matches: boolean;
  readonly missingDeclaredFields: readonly string[];
  readonly missingRequiredFeatures: readonly string[];
  readonly inspection: V8GlbInspection | null;
}

export interface V8EnvironmentReadinessEntry {
  readonly id: string;
  readonly localPath: string;
  readonly exists: boolean;
  readonly bytesMatch: boolean;
  readonly sha256Matches: boolean;
  readonly bytes: number;
}

export interface V8AssetCorpusSummary {
  readonly schema: "a3d-v8-asset-readiness/v1";
  readonly pass: boolean;
  readonly assetCount: number;
  readonly environmentCount: number;
  readonly existingAssetCount: number;
  readonly shaVerifiedAssetCount: number;
  readonly totalBytes: number;
  readonly totalTriangles: number;
  readonly texturedPbrAssetCount: number;
  readonly animationAssetCount: number;
  readonly skinAssetCount: number;
  readonly morphAssetCount: number;
  readonly materialExtensionAssetCount: number;
  readonly classCoverage: readonly V8AssetClass[];
  readonly featureCoverage: readonly string[];
  readonly failures: readonly string[];
  readonly entries: readonly V8AssetReadinessEntry[];
  readonly environments: readonly V8EnvironmentReadinessEntry[];
}

type GLTFJson = {
  readonly scenes?: readonly unknown[];
  readonly nodes?: readonly { readonly mesh?: number; readonly skin?: number }[];
  readonly meshes?: readonly {
    readonly primitives?: readonly {
      readonly attributes?: Readonly<Record<string, number>>;
      readonly indices?: number;
      readonly material?: number;
      readonly mode?: number;
      readonly targets?: readonly Readonly<Record<string, number>>[];
      readonly extensions?: Record<string, unknown>;
    }[];
  }[];
  readonly accessors?: readonly { readonly count?: number }[];
  readonly materials?: readonly {
    readonly pbrMetallicRoughness?: {
      readonly baseColorTexture?: TextureInfo;
      readonly metallicRoughnessTexture?: TextureInfo;
    };
    readonly normalTexture?: TextureInfo;
    readonly occlusionTexture?: TextureInfo;
    readonly emissiveTexture?: TextureInfo;
    readonly extensions?: Record<string, unknown>;
  }[];
  readonly textures?: readonly unknown[];
  readonly images?: readonly unknown[];
  readonly animations?: readonly {
    readonly channels?: readonly { readonly target?: { readonly path?: string } }[];
    readonly samplers?: readonly { readonly interpolation?: string }[];
  }[];
  readonly skins?: readonly { readonly joints?: readonly number[] }[];
  readonly extensionsUsed?: readonly string[];
  readonly extensionsRequired?: readonly string[];
  readonly extensions?: Record<string, unknown>;
};

type TextureInfo = {
  readonly index?: number;
  readonly extensions?: {
    readonly KHR_texture_transform?: unknown;
  };
};

const SUPPORTED_REQUIRED_EXTENSIONS = new Set([
  "KHR_lights_punctual",
  "KHR_materials_anisotropy",
  "KHR_materials_clearcoat",
  "KHR_materials_diffuse_transmission",
  "KHR_materials_dispersion",
  "KHR_materials_emissive_strength",
  "KHR_materials_ior",
  "KHR_materials_iridescence",
  "KHR_materials_pbrSpecularGlossiness",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_unlit",
  "KHR_materials_variants",
  "KHR_materials_volume",
  "KHR_mesh_quantization",
  "KHR_texture_transform"
]);

export function loadV8AssetManifest(path = "fixtures/threejs-parity/assets/manifest.json"): V8AssetManifest {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as V8AssetManifest;
}

export function inspectV8Glb(path: string): V8GlbInspection {
  const data = readFileSync(resolve(path));
  if (data.byteLength < 20 || data.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`Not a GLB file: ${path}`);
  }
  const version = data.readUInt32LE(4);
  const jsonChunkBytes = data.readUInt32LE(12);
  const jsonChunkType = data.readUInt32LE(16);
  if (jsonChunkType !== JSON_CHUNK_TYPE) {
    throw new Error(`GLB missing JSON chunk: ${path}`);
  }
  const gltf = JSON.parse(data.toString("utf8", 20, 20 + jsonChunkBytes).trim()) as GLTFJson;
  const meshes = gltf.meshes ?? [];
  const materials = gltf.materials ?? [];
  const primitives = meshes.flatMap((mesh) => mesh.primitives ?? []);
  const textureInfos = materials.flatMap((material) => collectMaterialTextureInfos(material));
  const extensionsUsed = [
    ...new Set([
      ...(gltf.extensionsUsed ?? []),
      ...materials.flatMap((material) => Object.keys(material.extensions ?? {})),
      ...primitives.flatMap((primitive) => Object.keys(primitive.extensions ?? {}))
    ])
  ].sort();
  const materialVariantCount = countMaterialVariants(gltf);
  const materialExtensionCount = materials.reduce((total, material) => total + Object.keys(material.extensions ?? {}).length, 0);
  const textureTransformCount = textureInfos.filter((textureInfo) => Boolean(textureInfo.extensions?.KHR_texture_transform)).length;
  const animationChannelCount = (gltf.animations ?? []).reduce((total, animation) => total + (animation.channels?.length ?? 0), 0);
  const animationSamplerCount = (gltf.animations ?? []).reduce((total, animation) => total + (animation.samplers?.length ?? 0), 0);
  const morphTargetCounts = primitives.map((primitive) => primitive.targets?.length ?? 0);
  const skinJointCounts = (gltf.skins ?? []).map((skin) => skin.joints?.length ?? 0);
  const vertexCount = primitives.reduce((total, primitive) => total + accessorCount(gltf, primitive.attributes?.POSITION), 0);
  const triangleCount = primitives.reduce((total, primitive) => total + primitiveTriangleCount(gltf, primitive), 0);
  const unsupportedRequiredExtensions = (gltf.extensionsRequired ?? []).filter((extension) => !SUPPORTED_REQUIRED_EXTENSIONS.has(extension));
  const features = [
    ...(triangleCount > 1000 ? ["real-geometry"] : []),
    ...(materials.length > 0 ? ["materials"] : []),
    ...(textureInfos.length > 0 ? ["textures"] : []),
    ...(materials.some((material) => material.pbrMetallicRoughness) ? ["pbr-metallic-roughness"] : []),
    ...(materials.some((material) => material.normalTexture) ? ["normal-texture"] : []),
    ...(materials.some((material) => material.occlusionTexture || material.pbrMetallicRoughness?.metallicRoughnessTexture) ? ["orm-texture"] : []),
    ...(materials.some((material) => material.emissiveTexture) ? ["emissive-texture"] : []),
    ...(materialExtensionCount > 0 ? ["material-extensions"] : []),
    ...(textureTransformCount > 0 ? ["texture-transform"] : []),
    ...(materialVariantCount > 0 ? ["material-variants"] : []),
    ...((gltf.animations?.length ?? 0) > 0 ? ["animation"] : []),
    ...((gltf.skins?.length ?? 0) > 0 ? ["skinning"] : []),
    ...(morphTargetCounts.some((count) => count > 0) ? ["morph-targets"] : [])
  ];

  return {
    validGlb: true,
    version,
    jsonChunkBytes,
    sceneCount: gltf.scenes?.length ?? 0,
    nodeCount: gltf.nodes?.length ?? 0,
    meshCount: meshes.length,
    primitiveCount: primitives.length,
    vertexCount,
    triangleCount,
    materialCount: materials.length,
    texturedPbrMaterialCount: materials.filter((material) => {
      const pbr = material.pbrMetallicRoughness;
      return Boolean(pbr?.baseColorTexture || pbr?.metallicRoughnessTexture || material.normalTexture || material.occlusionTexture || material.emissiveTexture);
    }).length,
    textureCount: gltf.textures?.length ?? 0,
    imageCount: gltf.images?.length ?? 0,
    animationCount: gltf.animations?.length ?? 0,
    animationChannelCount,
    animationSamplerCount,
    skinCount: gltf.skins?.length ?? 0,
    jointCount: skinJointCounts.reduce((total, count) => total + count, 0),
    morphTargetPrimitiveCount: morphTargetCounts.filter((count) => count > 0).length,
    morphTargetCount: morphTargetCounts.reduce((total, count) => total + count, 0),
    materialExtensionCount,
    materialTextureSlotCount: textureInfos.length,
    textureTransformCount,
    materialVariantCount,
    extensionsUsed,
    extensionsRequired: gltf.extensionsRequired ?? [],
    features,
    unsupportedRequiredExtensions
  };
}

export function createV8AssetCorpusSummary(manifest = loadV8AssetManifest()): V8AssetCorpusSummary {
  const entries = manifest.assets.map((asset): V8AssetReadinessEntry => {
    const path = resolve(asset.localPath);
    const exists = existsSync(path);
    const bytesMatch = exists && statSync(path).size === asset.bytes;
    const sha256Matches = exists && sha256(path) === asset.sha256;
    const inspection = exists ? inspectV8Glb(path) : null;
    const missingDeclaredFields = [
      ...requiredText(asset.id, "source", asset.source),
      ...requiredText(asset.id, "sourceUri", asset.sourceUri),
      ...requiredText(asset.id, "license", asset.license),
      ...requiredText(asset.id, "sha256", asset.sha256),
      ...(asset.bytes > 0 ? [] : [`${asset.id}.bytes`]),
      ...(asset.triangleCount > 0 ? [] : [`${asset.id}.triangleCount`]),
      ...(asset.tags.length > 0 ? [] : [`${asset.id}.tags`])
    ];
    const featureSet = new Set(inspection?.features ?? []);
    const missingRequiredFeatures = asset.requiredFeatures.filter((feature) => !featureSet.has(feature));
    const metadataMismatches = inspection ? [
      ...(asset.triangleCount === inspection.triangleCount ? [] : [`${asset.id}.triangleCount expected ${asset.triangleCount} actual ${inspection.triangleCount}`]),
      ...(asset.textureCount === inspection.textureCount ? [] : [`${asset.id}.textureCount expected ${asset.textureCount} actual ${inspection.textureCount}`]),
      ...(asset.animationCount === inspection.animationCount ? [] : [`${asset.id}.animationCount expected ${asset.animationCount} actual ${inspection.animationCount}`]),
      ...(asset.skinCount === inspection.skinCount ? [] : [`${asset.id}.skinCount expected ${asset.skinCount} actual ${inspection.skinCount}`]),
      ...(asset.morphTargetCount === inspection.morphTargetCount ? [] : [`${asset.id}.morphTargetCount expected ${asset.morphTargetCount} actual ${inspection.morphTargetCount}`]),
      ...(asset.materialExtensionCount === inspection.materialExtensionCount ? [] : [`${asset.id}.materialExtensionCount expected ${asset.materialExtensionCount} actual ${inspection.materialExtensionCount}`])
    ] : [];
    return {
      id: asset.id,
      localPath: asset.localPath,
      exists,
      bytesMatch,
      sha256Matches,
      missingDeclaredFields: [...missingDeclaredFields, ...metadataMismatches],
      missingRequiredFeatures,
      inspection
    };
  });
  const environments = manifest.environments.map((environment): V8EnvironmentReadinessEntry => {
    const path = resolve(environment.localPath);
    const exists = existsSync(path);
    return {
      id: environment.id,
      localPath: environment.localPath,
      exists,
      bytesMatch: exists && statSync(path).size === environment.bytes,
      sha256Matches: exists && sha256(path) === environment.sha256,
      bytes: exists ? statSync(path).size : 0
    };
  });
  const inspections = entries.flatMap((entry) => entry.inspection ? [entry.inspection] : []);
  const totalBytes = manifest.assets.reduce((total, asset) => total + asset.bytes, 0) + manifest.environments.reduce((total, environment) => total + environment.bytes, 0);
  const totalTriangles = inspections.reduce((total, inspection) => total + inspection.triangleCount, 0);
  const classCoverage = [...new Set(manifest.assets.map((asset) => asset.class))].sort() as V8AssetClass[];
  const featureCoverage = [...new Set(inspections.flatMap((inspection) => inspection.features))].sort();
  const texturedPbrAssetCount = entries.filter((entry) => (entry.inspection?.texturedPbrMaterialCount ?? 0) > 0).length;
  const animationAssetCount = entries.filter((entry) => (entry.inspection?.animationCount ?? 0) > 0).length;
  const skinAssetCount = entries.filter((entry) => (entry.inspection?.skinCount ?? 0) > 0).length;
  const morphAssetCount = entries.filter((entry) => (entry.inspection?.morphTargetCount ?? 0) > 0).length;
  const materialExtensionAssetCount = entries.filter((entry) => (entry.inspection?.materialExtensionCount ?? 0) > 0).length;
  const failures = [
    ...(manifest.assets.length < manifest.requirements.minimumAssetCount ? [`asset count ${manifest.assets.length} is below ${manifest.requirements.minimumAssetCount}`] : []),
    ...(entries.some((entry) => !entry.exists) ? ["one or more assets are missing from fixtures/threejs-parity"] : []),
    ...(entries.some((entry) => !entry.bytesMatch) ? ["one or more asset byte sizes do not match manifest"] : []),
    ...(entries.some((entry) => !entry.sha256Matches) ? ["one or more asset sha256 checks do not match manifest"] : []),
    ...(entries.some((entry) => entry.missingDeclaredFields.length > 0) ? ["one or more assets are missing source/license/checksum/tags"] : []),
    ...(entries.some((entry) => entry.missingRequiredFeatures.length > 0) ? ["one or more assets are missing required declared GLB features"] : []),
    ...(inspections.some((inspection) => inspection.unsupportedRequiredExtensions.length > 0) ? ["one or more GLBs require unsupported extensions"] : []),
    ...(environments.some((entry) => !entry.exists || !entry.bytesMatch || !entry.sha256Matches) ? ["one or more HDR environments failed checksum validation"] : []),
    ...(totalBytes < manifest.requirements.minimumTotalBytes ? [`total corpus bytes ${totalBytes} is below ${manifest.requirements.minimumTotalBytes}`] : []),
    ...(totalTriangles < manifest.requirements.minimumTotalTriangles ? [`total triangle count ${totalTriangles} is below ${manifest.requirements.minimumTotalTriangles}`] : []),
    ...(texturedPbrAssetCount < manifest.requirements.minimumTexturedPbrAssets ? ["too few textured PBR assets"] : []),
    ...(animationAssetCount < manifest.requirements.minimumAnimationAssets ? ["too few animated assets"] : []),
    ...(skinAssetCount < manifest.requirements.minimumSkinAssets ? ["too few skinned assets"] : []),
    ...(morphAssetCount < manifest.requirements.minimumMorphAssets ? ["too few morph assets"] : []),
    ...(materialExtensionAssetCount < manifest.requirements.minimumMaterialExtensionAssets ? ["too few material-extension assets"] : []),
    ...manifest.requirements.requiredClasses.filter((assetClass) => !classCoverage.includes(assetClass)).map((assetClass) => `missing asset class ${assetClass}`),
    ...manifest.requirements.requiredFeatures.filter((feature) => !featureCoverage.includes(feature)).map((feature) => `missing corpus feature ${feature}`)
  ];
  return {
    schema: "a3d-v8-asset-readiness/v1",
    pass: failures.length === 0,
    assetCount: manifest.assets.length,
    environmentCount: manifest.environments.length,
    existingAssetCount: entries.filter((entry) => entry.exists).length,
    shaVerifiedAssetCount: entries.filter((entry) => entry.sha256Matches).length,
    totalBytes,
    totalTriangles,
    texturedPbrAssetCount,
    animationAssetCount,
    skinAssetCount,
    morphAssetCount,
    materialExtensionAssetCount,
    classCoverage,
    featureCoverage,
    failures,
    entries,
    environments
  };
}

export function writeV8AssetCorpusReport(path = "tests/reports/current-routes-assets.json"): V8AssetCorpusSummary {
  const summary = createV8AssetCorpusSummary();
  const outputPath = resolve(path);
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

function collectMaterialTextureInfos(material: NonNullable<GLTFJson["materials"]>[number]): TextureInfo[] {
  const extensionTextureInfos = Object.values(material.extensions ?? {}).flatMap((extension) => {
    if (!extension || typeof extension !== "object") return [];
    return Object.entries(extension as Record<string, unknown>)
      .filter(([key, value]) => /Texture$/.test(key) && value && typeof value === "object")
      .map(([, value]) => value as TextureInfo);
  });
  return [
    ...[material.pbrMetallicRoughness?.baseColorTexture, material.pbrMetallicRoughness?.metallicRoughnessTexture],
    material.normalTexture,
    material.occlusionTexture,
    material.emissiveTexture,
    ...extensionTextureInfos
  ].filter((textureInfo): textureInfo is TextureInfo => Boolean(textureInfo));
}

function countMaterialVariants(gltf: GLTFJson): number {
  const rootVariants = gltf.extensions?.KHR_materials_variants as { readonly variants?: readonly unknown[] } | undefined;
  const primitiveVariantMappings = (gltf.meshes ?? [])
    .flatMap((mesh) => mesh.primitives ?? [])
    .flatMap((primitive) => {
      const variants = primitive.extensions?.KHR_materials_variants as { readonly mappings?: readonly unknown[] } | undefined;
      return variants?.mappings ?? [];
    });
  return (rootVariants?.variants?.length ?? 0) + primitiveVariantMappings.length;
}

function primitiveTriangleCount(gltf: GLTFJson, primitive: NonNullable<NonNullable<GLTFJson["meshes"]>[number]["primitives"]>[number]): number {
  const primitiveCount = primitive.indices === undefined
    ? accessorCount(gltf, primitive.attributes?.POSITION)
    : accessorCount(gltf, primitive.indices);
  switch (primitive.mode ?? 4) {
    case 4:
      return Math.floor(primitiveCount / 3);
    case 5:
    case 6:
      return Math.max(0, primitiveCount - 2);
    default:
      return 0;
  }
}

function accessorCount(gltf: GLTFJson, accessorIndex: number | undefined): number {
  if (accessorIndex === undefined) return 0;
  return gltf.accessors?.[accessorIndex]?.count ?? 0;
}

function requiredText(id: string, field: string, value: string): string[] {
  return value.trim().length > 0 ? [] : [`${id}.${field}`];
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
