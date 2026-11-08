/**
 * Native generated forward PBR variants. ProgramGenerator supplies the resolved
 * feature descriptor; this module never infers semantic features from GLSL.
 * Unsupported axes fail before compilation instead of silently changing a draw.
 * Texture and AuraFrame ownership stays with the selected WebGPUDevice.
 */
import { ALPHA_TO_COVERAGE_FEATURE, GENERATED_ALPHA_TO_COVERAGE_WGSL, generatedAlphaToCoverage } from "./GeneratedAlphaToCoverage";
import { RenderDeviceError, type UniformValue } from "../RenderDevice";
import type { MaterialExtensionFeature, ProgramFeatures } from "../contracts/program";
import { A3D_SHEEN_ALBEDO_LUT } from "../shaders/physical/sheen.glsl";
import { A3D_PRD04_IRIDESCENCE_WGSL } from "../shaders/physical-wgsl/iridescence.wgsl";
import { A3D_PRD04_ANISOTROPY_WGSL } from "../shaders/independent-wgsl/Anisotropy";
import { A3D_PRD04_CLEARCOAT_WGSL } from "../shaders/independent-wgsl/Clearcoat";
import { A3D_PRD04_BSDF_LOBES_COMMON_WGSL } from "../shaders/independent-wgsl/Lobes";
import { A3D_PRD04_SHEEN_FAST_WGSL } from "../shaders/independent-wgsl/SheenFast";
import { NATIVE_PROBE_WGSL } from "../shaders/advanced-lighting/native-probe.wgsl";
import { NATIVE_VOXEL_WGSL } from "../shaders/advanced-lighting/native-voxel.wgsl";
import { NATIVE_LIGHTMAP_WGSL } from "../shaders/advanced-lighting/native-lightmap.wgsl";
import { PHOTOMETRIC_PROFILE_WGSL } from "../lighting/shaders/PhotometricProfile.wgsl";
import { DEPTH_COVERAGE_FEATURE, PHOTOMETRIC_PROFILE_FEATURE, PROGRAM_LOG_DEPTH_FEATURE, depthCoverageUnsupportedReason } from "../program/ProgramFeatures";
import { PHYSICAL_LIGHTING_WGSL } from "./PhysicalLighting.wgsl";
import { PRD07_WETNESS_WGSL } from "../atmosphere/shaders/wetness.wgsl";
import { PRD07_FOG_WGSL_FIELDS, packPrd07FogWgslFields, prd07FogWgsl } from "../atmosphere/shaders/fog.wgsl";
import { prd10WindOffsetWgsl } from "../world/vegetation/shaders/wind.js";
import { isTextureBinding } from "../TextureBinding";
import { PACKED_LOOP_PHYSICAL_WGSL } from "./PackedLoopPhysical.wgsl";
import { deriveShaderDataLayout, writeShaderData, type ShaderDataType } from "./ShaderDataLayout";
import { ZERO_TO_ONE_PROJECTION_WGSL, rasterClipDepthWgsl } from "./ProjectionClip";
import { AUTHORED_TANGENT_WGSL } from "../materials/authoredTangent";

export interface GeneratedPbrDescriptor {
  readonly features: ProgramFeatures;
  readonly activeFeatures: readonly { readonly id: string; readonly value: string | number | boolean }[];
  readonly activeExtensions: readonly MaterialExtensionFeature[];
  readonly defines: Readonly<Record<string, string | number | true>>;
  readonly lighting: {
    readonly compilerLightingConjunction: boolean;
    readonly iblReplacesIndirect: boolean;
  };
  /**
   * Contributor IDs whose selected provider the generator authenticated as the
   * unchanged built-in object. Native templates that replace a contributor's
   * GLSL chunk (currently `prd07.wetness`) require it; an ID alone is not trusted.
   */
  readonly verifiedFeatures?: readonly string[];
}

export type GeneratedPbrTextureResource = {
  readonly uniform: "u_baseColorMap" | "u_dfgLut" | "u_envSpecular" | "u_environmentCubeMap" | "u_environmentMap" | "u_prd02ProbeCubeA" | "u_prd02ProbeCubeB" | "u_diffuseRoughnessTexture" | "u_bumpTexture" | "u_normalMap" | "u_metallicRoughnessMap" | "u_occlusionMap" | "u_emissiveMap" | "u_specularTexture" | "u_specularColorTexture" | "u_sheenColorTexture" | "u_sheenRoughnessTexture" | "u_clearcoatTexture" | "u_clearcoatRoughnessTexture" | "u_clearcoatNormalTexture" | "u_iridescenceTexture" | "u_iridescenceThicknessTexture" | "u_anisotropyTexture" | "u_shadowMapTexture" | "u_localShadowAtlas" | "a3d_prd04_transmissionSampler" | "u_transmissionTexture" | "u_volumeThicknessTexture" | "u_contactShadowMask" | "u_pointShadowMapTexture" | "u_spotShadowMapTexture" | "u_diffuseTransmissionTexture" | "u_diffuseTransmissionColorTexture" | "u_windNoise";
  readonly samplerBinding: number;
  readonly textureBinding: number;
  readonly dimension: "2d" | "cube";
  readonly sampleType: "filterable-float";
  readonly colorSpace?: "linear";
  /** A missing zero-weight probe slot still needs a dimension-correct fallback cube. */
  readonly optionalWhenWeightZero?: { readonly uniform: "u_prd02ProbeWeights"; readonly component: 0 | 1 };
} | {
  readonly uniform: "u_prd02IrradianceR" | "u_prd02IrradianceG" | "u_prd02IrradianceB";
  readonly textureBinding: 13 | 14 | 15;
  readonly dimension: "2d-array";
  /** Integer texel loads need no sampler and also work with unfilterable float textures. */
  readonly sampleType: "unfilterable-float";
} | {
  readonly uniform: "u_boneTexture";
  readonly textureBinding: 48;
  readonly dimension: "2d";
  readonly sampleType: "unfilterable-float";
} | {
  readonly uniform: "u_morphTexture";
  readonly textureBinding: 49;
  readonly dimension: "2d-array";
  readonly sampleType: "unfilterable-float";
} | {
  readonly uniform: "u_a3dNativeProbeTexture" | "u_a3dNativeVoxelTexture" | "u_a3dNativeLightmapTexture";
  readonly textureBinding: 56 | 57 | 58;
  readonly dimension: "2d";
  readonly sampleType: "unfilterable-float";
} | {
  readonly uniform: "u_clusterLightData" | "u_clusterLightIndices";
  readonly textureBinding: 73 | 74;
  readonly dimension: "2d";
  readonly sampleType: "unfilterable-float";
} | {
  readonly uniform: "u_a3dPhotometricAtlas";
  readonly textureBinding: 75;
  readonly dimension: "2d";
  readonly sampleType: "unfilterable-float";
};

interface GeneratedPbrMorph {
  readonly bucket: 4 | 8 | 16 | 32;
  readonly normals: boolean;
  readonly tangents: boolean;
  readonly maxActive: 8 | 16 | 32 | 64;
}

export interface GeneratedPbrProgram {
  readonly vertex: string;
  readonly fragment: string;
  readonly vertexEntryPoint: "vs_main";
  readonly fragmentEntryPoint: "fs_main";
  /** Material at group 0 binding 0; textures are the following fixed pairs. */
  readonly materialBinding: { readonly group: 0; readonly binding: 0; readonly byteLength: number };
  /** The existing std140-compatible AuraFrame buffer (304 bytes). */
  readonly frameBinding: { readonly group: 1; readonly binding: 0; readonly minimumByteLength: 304 };
  readonly resources: readonly GeneratedPbrTextureResource[];
  readonly requiredVertexLocations: readonly number[];
  /** Instance-rate matrix columns and optional base-color input. */
  readonly requiredInstanceLocations: readonly number[];
  readonly directLightBound: number;
  readonly clustered: boolean;
  readonly rectLights: boolean;
  readonly skinning: 4 | 8 | null;
  readonly morph: GeneratedPbrMorph | null;
  readonly transmission: boolean;
  /**
   * A transmission lobe without a scoped captured target: drawn without refraction, as the WebGL2 program does.
   * The device then accepts the material's transmission, volume and dispersion inputs and leaves them unsampled.
   */
  readonly transmissionDegraded: boolean;
  readonly transmissionMap: boolean;
  readonly materialVolume: boolean;
  readonly thicknessMap: boolean;
  readonly dispersion: boolean;
  readonly contactShadow: boolean;
  readonly pointShadow: boolean;
  readonly spotShadow: boolean;
  readonly diffuseTransmission: boolean;
  readonly diffuseTransmissionMap: boolean;
  readonly diffuseTransmissionColorMap: boolean;
  readonly fog: "none" | "linear" | "exp2" | "height";
  readonly clipping: boolean;
  /** Staged per-member loop color; does not authorize batched execution. */
  readonly packedLoopColor: boolean;
  readonly photometricProfile: boolean;
  /** Experimental native PRD-07 wetness response (`material.wetness`). */
  readonly wetness: boolean;
  /** Native PRD-07 forward fog (`prd07.fog`), replacing the default fog body. */
  readonly prd07Fog: boolean;
  /** Native PRD-10 wind sway (`prd10.wind`) in the vertex stage; its gust noise is a vertex-stage texture. */
  readonly wind: boolean;
  /** This program emits location 1; the device must validate paired depth writes. */
  readonly writesDepthCoverage: boolean;
  /** Writes ln(d / near) / ln(far / near) as @builtin(frag_depth) (logarithmic frames). */
  readonly logarithmicDepth: boolean;
  /** MASK coverage is written to output alpha for pipeline alpha-to-coverage instead of a hard discard. */
  readonly alphaToCoverage: boolean;
  readonly jointKinds: readonly ("float" | "uint" | "sint" | null)[];
  /** Alpha 2..3 stores the indirect-radiance fraction for the AO post stage. */
  readonly requiresFloatColorAttachment: boolean;
}

const vec4: ShaderDataType = { kind: "vector", element: "f32", length: 4 };
const mat4: ShaderDataType = { kind: "matrix", columns: 4, rows: 4 };
const mat3: ShaderDataType = { kind: "matrix", columns: 3, rows: 3 };
const MATERIAL_FIELDS: readonly { readonly name: string; readonly type: ShaderDataType; readonly wgsl: string }[] = [
  { name: "model", type: mat4, wgsl: "mat4x4f" },
  { name: "geometry", type: mat4, wgsl: "mat4x4f" },
  { name: "normal", type: mat4, wgsl: "mat4x4f" },
  ...["baseColor", "emissive", "surface", "specular", "ambient", "sheen", "probe", "envMap",
    "ambientIrradiance", "hemiSky", "hemiGround", "hemiDirection", "procSky", "procHorizon",
    "procGround", "procSpecular", "controls", "direct", "localCenterA", "localHalfA", "localOriginA",
    "localCenterB", "localHalfB", "localOriginB", "localWeights", "volumeMin", "volumeMax", "volumeGrid",
    "baseUv", "diffuseUv", "bumpUv", "normalUv", "metalRoughUv", "occlusionUv", "emissiveUv",
    "mapControls", "detailControls", "normalControls", "coreMapControls", "coat", "iridescence", "anisotropy", "bone", "morph"].map((name) => ({ name, type: vec4, wgsl: "vec4f" })),
  ...["specularTransform", "specularColorTransform", "sheenColorTransform", "sheenRoughnessTransform", "coatTransform", "coatRoughnessTransform", "coatNormalTransform", "iridescenceTransform", "iridescenceThicknessTransform", "anisotropyTransform"].map((name) => ({ name, type: mat3, wgsl: "mat3x3f" })),
  { name: "sh", type: { kind: "array", element: vec4, length: 7 }, wgsl: "array<vec4f, 7>" },
  { name: "morphIndices", type: { kind: "array", element: vec4, length: 16 }, wgsl: "array<vec4f, 16>" },
  { name: "morphWeights", type: { kind: "array", element: vec4, length: 16 }, wgsl: "array<vec4f, 16>" },
  { name: "lights", type: { kind: "array", element: vec4, length: 96 }, wgsl: "array<vec4f, 96>" },
  { name: "shadowMatrix", type: mat4, wgsl: "mat4x4f" },
  { name: "shadowParams", type: vec4, wgsl: "vec4f" },
  { name: "shadowTexel", type: vec4, wgsl: "vec4f" },
  { name: "shadowSamples", type: { kind: "array", element: vec4, length: 32 }, wgsl: "array<vec4f, 32>" },
  { name: "localShadowMatrices", type: { kind: "array", element: mat4, length: 6 }, wgsl: "array<mat4x4f, 6>" },
  { name: "localShadowRects", type: { kind: "array", element: vec4, length: 6 }, wgsl: "array<vec4f, 6>" },
  { name: "localShadowScales", type: { kind: "array", element: vec4, length: 2 }, wgsl: "array<vec4f, 2>" },
  { name: "localShadowParams", type: vec4, wgsl: "vec4f" },
  { name: "localShadowTexel", type: vec4, wgsl: "vec4f" },
  { name: "transmission", type: vec4, wgsl: "vec4f" },
  ...(["advancedMin", "advancedMax", "advancedDimensions", "advancedConfig", "advancedIntensity"] as const).map(name => ({ name, type: vec4, wgsl: "vec4f" })),
  { name: "advancedLevels", type: { kind: "array", element: vec4, length: 7 }, wgsl: "array<vec4f, 7>" },
  { name: "transmissionTransform", type: mat3, wgsl: "mat3x3f" },
  { name: "thicknessTransform", type: mat3, wgsl: "mat3x3f" },
  { name: "volumeMaterial", type: vec4, wgsl: "vec4f" },
  { name: "volumeColor", type: vec4, wgsl: "vec4f" },
  { name: "transmissionViewport", type: vec4, wgsl: "vec4f" },
  { name: "contactShadow", type: vec4, wgsl: "vec4f" },
  { name: "pointShadowPositionRange", type: vec4, wgsl: "vec4f" },
  { name: "pointShadowParams", type: vec4, wgsl: "vec4f" },
  { name: "pointShadowTexel", type: vec4, wgsl: "vec4f" },
  { name: "pointShadowMatrices", type: { kind: "array", element: mat4, length: 6 }, wgsl: "array<mat4x4f, 6>" },
  { name: "pointShadowRects", type: { kind: "array", element: vec4, length: 6 }, wgsl: "array<vec4f, 6>" },
  { name: "pointShadowSamples", type: { kind: "array", element: vec4, length: 32 }, wgsl: "array<vec4f, 32>" },
  { name: "spotShadowPositionRange", type: vec4, wgsl: "vec4f" },
  { name: "spotShadowDirectionAngle", type: vec4, wgsl: "vec4f" },
  { name: "spotShadowParams", type: vec4, wgsl: "vec4f" },
  { name: "spotShadowTexel", type: vec4, wgsl: "vec4f" },
  { name: "spotShadowMatrix", type: mat4, wgsl: "mat4x4f" },
  { name: "spotShadowSamples", type: { kind: "array", element: vec4, length: 32 }, wgsl: "array<vec4f, 32>" },
  { name: "diffuseTransmission", type: vec4, wgsl: "vec4f" },
  { name: "diffuseTransmissionTransform", type: mat3, wgsl: "mat3x3f" },
  { name: "diffuseTransmissionColorTransform", type: mat3, wgsl: "mat3x3f" },
  { name: "fogColor", type: vec4, wgsl: "vec4f" },
  { name: "fogParams", type: vec4, wgsl: "vec4f" },
  { name: "clusterGrid", type: vec4, wgsl: "vec4f" },
  { name: "clipPlanes", type: { kind: "array", element: vec4, length: 8 }, wgsl: "array<vec4f, 8>" },
  { name: "clipGroups", type: { kind: "array", element: vec4, length: 2 }, wgsl: "array<vec4f, 2>" },
  { name: "clipControl", type: vec4, wgsl: "vec4f" },
  { name: "packedLoopColor", type: vec4, wgsl: "vec4f" },
  // These fields are appended so existing material member offsets stay stable.
  { name: "photometricOffsets", type: { kind: "array", element: vec4, length: 16 }, wgsl: "array<vec4f, 16>" },
  { name: "photometricMeta", type: { kind: "array", element: vec4, length: 16 }, wgsl: "array<vec4f, 16>" },
  // PRD-07 wetness: (u_wetness, u_puddleThreshold, u_rainRipples, u_snowCover).
  { name: "wetness", type: vec4, wgsl: "vec4f" },
  // Logarithmic frames: u_a3dLogDepthView and (near, far) from u_a3dLogDepthRange.
  { name: "logDepthView", type: mat4, wgsl: "mat4x4f" },
  { name: "logDepthRange", type: vec4, wgsl: "vec4f" },
  // PRD-07 forward fog (`prd07.fog`), packed from the u_fog* uniforms of the GLSL chunk.
  ...PRD07_FOG_WGSL_FIELDS.map(({ name, length }) => length
    ? { name, type: { kind: "array", element: vec4, length } as ShaderDataType, wgsl: `array<vec4f, ${length}>` }
    : { name, type: vec4, wgsl: "vec4f" }),
  // PRD-10 wind (`prd10.wind`): u_windDirStrength, u_windGust and (u_windAssetHeight, -, -, -).
  { name: "windDirStrength", type: vec4, wgsl: "vec4f" },
  { name: "windGust", type: vec4, wgsl: "vec4f" },
  { name: "windParams", type: vec4, wgsl: "vec4f" },
  // PRD-04 rim (`prd04.rim`): (u_prd04RimColor, u_prd04RimStrength) and (u_prd04RimPower, -, -, -).
  { name: "rim", type: vec4, wgsl: "vec4f" },
  { name: "rimParams", type: vec4, wgsl: "vec4f" }
];
export const GENERATED_PBR_MATERIAL_LAYOUT = deriveShaderDataLayout({
  kind: "struct", fields: MATERIAL_FIELDS.map(({ name, type }) => ({ name, type }))
}, "wgsl-uniform");
export const GENERATED_PBR_MATERIAL_OFFSETS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(GENERATED_PBR_MATERIAL_LAYOUT.members!.map(({ name, offset }) => [name, offset]))
);

const MATERIAL_STRUCT = `struct GeneratedPbrMaterial {\n${MATERIAL_FIELDS.map(({ name, wgsl }) => `  ${name}: ${wgsl},`).join("\n")}\n};\n@group(0) @binding(0) var<uniform> material: GeneratedPbrMaterial;`;
const FRAME_STRUCT = `struct AuraFrame {
  view: mat4x4f, projection: mat4x4f, viewProjection: mat4x4f, previousViewProjection: mat4x4f,
  cameraPositionNear: vec4f, resolutionFarTime: vec4f, exposureFlags: vec4f,
};
@group(1) @binding(0) var<uniform> frame: AuraFrame;`;

/** `prd04.instanceColorTarget` (shaders/chunks/instance_color_target.glsl.ts; named here to keep this module free of Material imports). */
const INSTANCE_COLOR_TARGET_FEATURE = "prd04.instanceColorTarget";
function unsupported(field: string, detail: string): never {
  throw new RenderDeviceError(`Generated WebGPU PBR does not support ${detail}`, "WGSL_PROGRAM_MISSING", { field });
}
function hasDefine(defines: GeneratedPbrDescriptor["defines"], name: string): boolean {
  return Object.prototype.hasOwnProperty.call(defines, name);
}
function canonicalLobe(name: string): string {
  const aliases: Readonly<Record<string, string>> = {
    KHR_materials_sheen: "sheen", KHR_materials_emissive_strength: "emissive-strength",
    KHR_materials_ior: "ior", KHR_materials_specular: "specular", KHR_materials_clearcoat: "clearcoat", KHR_materials_iridescence: "iridescence", KHR_materials_anisotropy: "anisotropy", KHR_materials_transmission: "transmission", KHR_materials_volume: "volume", KHR_materials_dispersion: "dispersion", KHR_materials_diffuse_transmission: "diffuse-transmission"
  };
  return aliases[name] ?? name;
}

/** Reject unimplemented program axes and contradictory producer metadata. */
type LobeMapSlot = "specular" | "specularColor" | "sheenColor" | "sheenRoughness" | "clearcoat" | "clearcoatRoughness" | "clearcoatNormal" | "iridescence" | "iridescenceThickness" | "anisotropy" | "transmission" | "volumeThickness" | "diffuseTransmission" | "diffuseTransmissionColor";
type LobeMaps = Partial<Record<LobeMapSlot, 0 | 1>>;
function validateDescriptor(descriptor: GeneratedPbrDescriptor): { baseMap: boolean; normalMap: boolean; diffuseMap: boolean; bumpMap: boolean; metalRoughMap: boolean; occlusionMap: boolean; emissiveMap: boolean; lobeMaps: LobeMaps; uv0: boolean; uv1: boolean; ibl: boolean; sampled: "none" | "cube" | "equirect"; procedural: boolean; localProbe: boolean; volume: boolean; advanced: "none" | "probe" | "voxel" | "lightmap"; lightmapUv: 0 | 1; lightmapAdd: boolean; directBound: number; sheen: boolean; coat: boolean; iridescence: boolean; anisotropy: boolean; transmission: boolean; transmissionDegraded: boolean; diffuseTransmission: boolean; materialVolume: boolean; dispersion: boolean; tangent: boolean; fraction: boolean; outputSrgb: boolean; wetness: boolean; prd07Fog: boolean; wind: boolean; rim: boolean; instanceEmissive: boolean; alphaToCoverage: boolean; skinning: 4 | 8 | null; morph: GeneratedPbrMorph | null; jointKinds: readonly ("float" | "uint" | "sint" | null)[] } {
  const f = descriptor.features;
  if (!f || f.pass !== "forward" || f.lighting !== "lit") unsupported("pass", "anything except forward lit materials");
  const depthCoverageIssue = depthCoverageUnsupportedReason(f);
  if (depthCoverageIssue) unsupported(`features.${DEPTH_COVERAGE_FEATURE}`, depthCoverageIssue);
  const writesDepthCoverage = f.features[DEPTH_COVERAGE_FEATURE] === true;
  if (f.drawId || (f as ProgramFeatures & { graph?: unknown }).graph) unsupported("vertex", "draw IDs or shader graphs");
  if (f.instancing && (typeof f.instancing.color !== "boolean" || (f.instancing.emissive !== undefined && typeof f.instancing.emissive !== "boolean") || f.instancing.emissive)) {
    unsupported("instancing", "invalid instance metadata or per-instance emissive color");
  }
  if (f.backgroundCoverage) unsupported("backgroundCoverage", "multiple output attachments");
  if (f.fog !== "none" && f.fog !== "linear" && f.fog !== "exp2" && f.fog !== "height") unsupported("fog", `fog ${f.fog}`);
  if (f.diffuseModel !== "lambert" && f.diffuseModel !== "burley") unsupported("diffuseModel", `diffuse model ${f.diffuseModel}`);
  for (const [name, count] of Object.entries({ dir: f.lights.dir, point: f.lights.point, spot: f.lights.spot })) {
    if (![0, 1, 2, 4, 8].includes(count)) unsupported(`lights.${name}`, `invalid ${name} light bucket`);
  }
  if (![0, 1, 2, 4].includes(f.lights.rect)) unsupported("lights.rect", "invalid rectangular light bucket");
  if (!["opaque", "mask", "blend"].includes(f.alphaMode)) unsupported("alphaMode", `alpha mode ${String(f.alphaMode)}`);
  if (f.shadows.contact && f.lights.dir === 0) unsupported("shadows.contact", "contact shadow without a directional light");
  if (![0, 1, 2, 3, 4].includes(f.shadows.cascades)) unsupported("shadows.cascades", "invalid shadow cascade count");
  if (!Number.isInteger(f.shadows.localShadows) || f.shadows.localShadows < 0 || f.shadows.localShadows > 6) unsupported("shadows.localShadows", "invalid local shadow tile count");
  for (const [name, map] of Object.entries(f.maps)) {
    if (!map) continue;
    if (!["baseColor", "normal", "metallicRoughness", "occlusion", "emissive", "diffuseRoughness", "bump"].includes(name) || (map.uvSet !== 0 && map.uvSet !== 1)) unsupported(`maps.${name}`, `${name} map or unsupported UV set`);
  }
  const active = new Map<string, string | number | boolean>();
  for (const item of descriptor.activeFeatures) {
    if (active.has(item.id)) unsupported("activeFeatures", `duplicate contributor ${item.id}`);
    if (!["prd02.ibl", "prd02.shadowFilter", "prd03.indirectFraction", "prd04.tangentFrame", "prd04.transmissionTarget", "prd06.deform", "a3d.packedLoopColor", "prd07.wetness", "prd07.fog", "prd10.wind", "prd04.rim", INSTANCE_COLOR_TARGET_FEATURE, ALPHA_TO_COVERAGE_FEATURE].includes(item.id)) unsupported("activeFeatures", `contributor ${item.id}`);
    active.set(item.id, item.value);
  }
  const structural = new Set(["prd02.ibl", "prd02.shadowFilter", "prd03.indirectFraction", "prd02.localProbe", "prd02.irradianceVolume", "prd04.tangentFrame", "prd04.geometryTangent", "prd04.transmissionTarget", "prd06.deform", "prd06.joint0Type", "prd06.joint1Type", "a3d.output.srgb", "a3d.clipping", "a3d.packedLoopColor", "a3d.independentPhysicalPreview", "a3d.nativeProbeGrid", "a3d.nativeVoxelIndirect", "a3d.nativeBakedLightmap", "a3d.nativeLightmapUv", "a3d.legacyPointShadow", "a3d.legacySpotShadow", "a3d.photometricProfile", "prd07.wetness", "prd07.fog", "prd10.wind", "prd04.rim", INSTANCE_COLOR_TARGET_FEATURE, ALPHA_TO_COVERAGE_FEATURE, DEPTH_COVERAGE_FEATURE, PROGRAM_LOG_DEPTH_FEATURE]);
  for (const [name, value] of Object.entries(f.features)) {
    if (value !== false && !structural.has(name)) unsupported(`features.${name}`, `feature ${name}`);
    if ((name === "prd02.localProbe" || name === "prd02.irradianceVolume" || name === "prd04.geometryTangent" || name === "a3d.output.srgb" || name === "a3d.clipping" || name === "a3d.packedLoopColor" || name === "a3d.independentPhysicalPreview" || name === "a3d.photometricProfile" || name === PROGRAM_LOG_DEPTH_FEATURE) && typeof value !== "boolean") unsupported(`features.${name}`, `invalid ${name} feature`);
  }
  if (f.features[PHOTOMETRIC_PROFILE_FEATURE] !== undefined && f.features[PHOTOMETRIC_PROFILE_FEATURE] !== true) {
    unsupported("features.a3d.photometricProfile", "an invalid photometric profile feature");
  }
  const photometric = f.features[PHOTOMETRIC_PROFILE_FEATURE] === true;
  if (photometric && (f.lights.clustered || (f.lights.point === 0 && f.lights.spot === 0))) {
    unsupported("features.a3d.photometricProfile", "photometric profiles without non-clustered punctual lights");
  }
  // PRD-07 wetness: the selected stock feature, its bit and its define agree.
  const wetness = active.has("prd07.wetness");
  if ((wetness && active.get("prd07.wetness") !== true) || (f.features["prd07.wetness"] === true) !== wetness
    || (f.features["prd07.wetness"] !== undefined && f.features["prd07.wetness"] !== false && f.features["prd07.wetness"] !== true)) {
    unsupported("features.prd07.wetness", "inconsistent wetness metadata");
  }
  if (wetness && !descriptor.verifiedFeatures?.includes("prd07.wetness")) unsupported("activeFeatures", "a replaced or unverified prd07.wetness contributor");
  if (wetness && descriptor.defines.A3D_WETNESS !== 1 && descriptor.defines.A3D_WETNESS !== true) unsupported("defines.A3D_WETNESS", "invalid wetness define");
  const prd07Fog = validatePrd07FogMetadata(descriptor, active, unsupported);
  // PRD-10 wind: the selected stock feature (value 1), its bit and its define agree; the native vertex twin replaces its GLSL chunk.
  const wind = active.has("prd10.wind");
  if ((wind && (active.get("prd10.wind") !== 1 || f.features["prd10.wind"] !== 1)) || (!wind && f.features["prd10.wind"] !== undefined && f.features["prd10.wind"] !== false)) {
    unsupported("features.prd10.wind", "inconsistent wind metadata");
  }
  if (wind && !descriptor.verifiedFeatures?.includes("prd10.wind")) unsupported("activeFeatures", "a replaced or unverified prd10.wind contributor");
  // With prd06.deform the GLSL chunks compose through A3D_DEFORM_ENTRY; the native template has no such composition yet.
  if (wind && active.has("prd06.deform")) unsupported("prd10.wind", "wind combined with skinning or morph deformation");
  // PRD-04 rim: the stock feature (value true), its bit and its define agree; the WGSL emissive term replaces its GLSL chunk.
  const rim = active.has("prd04.rim");
  if ((rim && active.get("prd04.rim") !== true) || (f.features["prd04.rim"] === true) !== rim
    || (f.features["prd04.rim"] !== undefined && f.features["prd04.rim"] !== false && f.features["prd04.rim"] !== true)) {
    unsupported("features.prd04.rim", "inconsistent rim metadata");
  }
  if (rim && !descriptor.verifiedFeatures?.includes("prd04.rim")) unsupported("activeFeatures", "a replaced or unverified prd04.rim contributor");
  if (rim && descriptor.defines.A3D_PRD04_RIM !== 1 && descriptor.defines.A3D_PRD04_RIM !== true) unsupported("defines.A3D_PRD04_RIM", "invalid rim define");
  // GU47 E-D `prd04.instanceColorTarget: "both"`: the instance colour multiplies the base (USE_INSTANCING_COLOR) and the
  // emissive term. "emissive" (a separate a_a3dInstanceEmissive stream) is not implemented natively yet.
  const instanceColorTarget = active.has(INSTANCE_COLOR_TARGET_FEATURE);
  const targetValue = active.get(INSTANCE_COLOR_TARGET_FEATURE);
  if ((instanceColorTarget && ((targetValue !== "both" && targetValue !== "emissive") || f.features[INSTANCE_COLOR_TARGET_FEATURE] !== targetValue))
    || (!instanceColorTarget && f.features[INSTANCE_COLOR_TARGET_FEATURE] !== undefined && f.features[INSTANCE_COLOR_TARGET_FEATURE] !== false)) {
    unsupported(`features.${INSTANCE_COLOR_TARGET_FEATURE}`, "instance colour targets other than \"both\" or \"emissive\"");
  }
  // "emissive": the colours arrive at the instance colour location (ForwardPass binds them as a_instanceColor on WebGPU)
  // and feed only the emissive term; the program carries no USE_INSTANCING_COLOR base multiply.
  const emissiveTarget = instanceColorTarget && targetValue === "emissive";
  if (emissiveTarget && (!f.instancing || f.instancing.color)) unsupported(`features.${INSTANCE_COLOR_TARGET_FEATURE}`, "an emissive instance colour target without an instance stream");
  if (instanceColorTarget && !descriptor.verifiedFeatures?.includes(INSTANCE_COLOR_TARGET_FEATURE)) unsupported("activeFeatures", `a replaced or unverified ${INSTANCE_COLOR_TARGET_FEATURE} contributor`);
  // Like the GLSL call (`#elif defined(USE_INSTANCING_COLOR)`), a program without instance colours (renderer warmup
  // variants) leaves the emissive term unchanged.
  const instanceEmissive = emissiveTarget || (instanceColorTarget && f.instancing?.color === true);
  const packedLoopColor = active.get("a3d.packedLoopColor") === true;
  if ((active.has("a3d.packedLoopColor") && !packedLoopColor) || (f.features["a3d.packedLoopColor"] === true) !== packedLoopColor) unsupported("features.a3d.packedLoopColor", "inactive packed member color");
  const deform = active.get("prd06.deform");
  const match = typeof deform === "string" ? /^(?:(skin4|skin8)(?:\|(?=morph))?)?(?:morph(4|8|16|32)(n?)(t?)\|k(8|16|32|64))?$/.exec(deform) : null;
  if (deform !== undefined && (!match || (!match[1] && !match[2]))) unsupported("prd06.deform", "this deformation feature combination");
  const skinning: 4 | 8 | null = match?.[1] === "skin4" ? 4 : match?.[1] === "skin8" ? 8 : null;
  const morph: GeneratedPbrMorph | null = match?.[2] ? { bucket: Number(match[2]) as GeneratedPbrMorph["bucket"], normals: match[3] === "n", tangents: match[4] === "t", maxActive: Number(match[5]) as GeneratedPbrMorph["maxActive"] } : null;
  if (f.skinning && (f.skinning.palette !== "texture" || f.skinning.influences !== skinning)) unsupported("skinning", "skinning without matching texture-palette deformation");
  if (f.morph && (!morph || f.morph.targetBucket !== morph.bucket || f.morph.normals !== morph.normals || f.morph.tangents !== morph.tangents)) unsupported("morph", "morph metadata without matching texture deformation");
  const jointKinds = [f.features["prd06.joint0Type"], f.features["prd06.joint1Type"]].map((kind, index) => {
    if (kind === undefined) return null;
    if ((kind !== "float" && kind !== "uint" && kind !== "sint") || !skinning || (index === 1 && skinning !== 8)) unsupported("skinning", "invalid typed joint metadata");
    return kind;
  });
  if (skinning && descriptor.defines.A3D_SKINNING !== skinning) unsupported("defines.A3D_SKINNING", "inconsistent skinning metadata");
  if (morph && (descriptor.defines.A3D_MORPH !== morph.bucket || descriptor.defines.A3D_MORPH_MAX_ACTIVE !== morph.maxActive)) unsupported("defines.A3D_MORPH", "inconsistent morph metadata");
  const extensionIds = new Set<string>();
  let iorBit: string | number | boolean | undefined;
  let emissiveLobeMap = false;
  let emissiveMapBit = false;
  let iridescenceFilm = false;
  const lobeMaps: LobeMaps = {};
  for (const extension of descriptor.activeExtensions) {
    const lobe = canonicalLobe(extension.lobe);
    if (extensionIds.has(lobe)) unsupported("activeExtensions", `duplicate lobe ${extension.lobe}`);
    if (!["sheen", "emissive-strength", "ior", "specular", "clearcoat", "iridescence", "anisotropy", "transmission", "diffuse-transmission", "volume", "dispersion"].includes(lobe)) unsupported("activeExtensions", `lobe ${extension.lobe}`);
    if (lobe === "emissive-strength") {
      emissiveLobeMap = extension.maps.length === 1 && extension.maps[0] === "emissive";
      // featuresForGeometry drops the emissive map on a geometry without the map's UV set but leaves this lobe's `map`
      // bit set (the lobe is not in PHYSICAL_LOBE_MAP_BITS); the GLSL call is a no-op and the base path samples no
      // emissive map, so a stale bit with no map anywhere draws the same unmapped emission (Top Tennis UV-less meshes).
      const droppedMapBit = extension.bits.map === true && extension.maps.length === 0 && !f.maps.emissive;
      emissiveMapBit = emissiveLobeMap || droppedMapBit;
      if ((extension.maps.length > 0 && !emissiveLobeMap) || (Boolean(extension.bits.map) !== emissiveLobeMap && !droppedMapBit) || (emissiveLobeMap && !f.maps.emissive)
        || Object.entries(extension.bits).some(([bit, value]) => bit !== "map" && Boolean(value))) unsupported(`activeExtensions.${extension.lobe}`, `unsupported ${extension.lobe} map metadata`);
    } else {
      const slots: readonly LobeMapSlot[] = lobe === "specular" ? ["specular", "specularColor"] : lobe === "sheen" ? ["sheenColor", "sheenRoughness"] : lobe === "clearcoat" ? ["clearcoat", "clearcoatRoughness", "clearcoatNormal"] : lobe === "iridescence" ? ["iridescence", "iridescenceThickness"] : lobe === "anisotropy" ? ["anisotropy"] : lobe === "transmission" ? ["transmission"] : lobe === "diffuse-transmission" ? ["diffuseTransmission", "diffuseTransmissionColor"] : lobe === "volume" ? ["volumeThickness"] : [];
      const bitNames = lobe === "specular" ? ["specularMap", "specularColorMap"] : lobe === "sheen" ? ["colorMap", "roughnessMap"] : lobe === "clearcoat" ? ["map", "roughnessMap", "normalMap"] : lobe === "iridescence" ? ["map", "thicknessMap", "film"] : lobe === "diffuse-transmission" ? ["map", "colorMap"] : lobe === "anisotropy" || lobe === "transmission" ? ["map"] : lobe === "volume" ? ["thicknessMap"] : [];
      if (Object.entries(extension.bits).some(([bit, value]) => bit !== "ior" && !bitNames.includes(bit) && Boolean(value))) unsupported(`activeExtensions.${extension.lobe}`, `unsupported ${extension.lobe} metadata`);
      for (const slot of extension.maps) {
        if (!slots.includes(slot as LobeMapSlot) || Object.prototype.hasOwnProperty.call(lobeMaps, slot)) unsupported(`activeExtensions.${extension.lobe}`, `unsupported ${extension.lobe} map ${slot}`);
        const uvSet = extension.mapUvSets?.[slot] ?? 0;
        if (uvSet !== 0 && uvSet !== 1) unsupported(`activeExtensions.${extension.lobe}`, `unsupported ${slot} UV set`);
        lobeMaps[slot as LobeMapSlot] = uvSet;
      }
    }
    if (lobe === "iridescence") {
      if (extension.bits.film !== undefined && typeof extension.bits.film !== "boolean") unsupported("activeExtensions.iridescence", "invalid iridescence film metadata");
      iridescenceFilm = extension.bits.film === true;
    }
    if (lobe === "ior") {
      iorBit = extension.bits.ior;
      if (iorBit !== undefined && (typeof iorBit !== "number" || !Number.isFinite(iorBit) || iorBit < 0)) unsupported("activeExtensions.ior", "invalid IOR metadata");
    } else if (extension.bits.ior !== undefined) unsupported(`activeExtensions.${extension.lobe}`, `invalid ${extension.lobe} metadata`);
    extensionIds.add(lobe);
  }
  for (const extension of f.extensions) if (!extensionIds.has(canonicalLobe(extension.lobe))) unsupported("activeExtensions", `inactive or unregistered lobe ${extension.lobe}`);
  if (packedLoopColor && (f.alphaMode !== "opaque" || f.instancing || skinning || morph || descriptor.activeExtensions.length || f.extensions.length)) {
    unsupported("features.a3d.packedLoopColor", "packed member color with nonopaque, instanced, deformed or extension-lobe draws");
  }
  const sheen = extensionIds.has("sheen");
  const coat = extensionIds.has("clearcoat");
  const iridescence = extensionIds.has("iridescence");
  const anisotropy = extensionIds.has("anisotropy");
  const transmissionLobe = extensionIds.has("transmission");
  const diffuseTransmission = extensionIds.has("diffuse-transmission");
  const materialVolume = extensionIds.has("volume"), dispersion = extensionIds.has("dispersion");
  // The independent preview is an opt-in source variant (part of the cache
  // key). It composes every lobe combination the default path accepts: lobe
  // deltas over the substrate are scaled by the preview sheen's albedo
  // compensation, and the sheen's indirect term uses the same diffuse
  // irradiance as the substrate (see createGeneratedPbrProgram).
  const pointShadow = f.features["a3d.legacyPointShadow"] === true;
  const spotShadow = f.features["a3d.legacySpotShadow"] === true;
  if ((f.features["a3d.legacyPointShadow"] !== undefined && !pointShadow) || (pointShadow && !f.lights.point)
    || (f.features["a3d.legacySpotShadow"] !== undefined && !spotShadow) || (spotShadow && !f.lights.spot)) {
    unsupported("features", "standalone shadow metadata without its matching light");
  }
  const transmissionTarget = active.get("prd04.transmissionTarget") === true;
  if (active.has("prd04.transmissionTarget") && !transmissionTarget) unsupported("prd04.transmissionTarget", "invalid transmission target metadata");
  if (transmissionTarget && !transmissionLobe) unsupported("prd04.transmissionTarget", "a captured transmission target without a transmission lobe");
  if ((materialVolume || dispersion) && !transmissionLobe) unsupported("activeExtensions", "volume or dispersion without transmission");
  // Like the WebGL2 program (its refraction call is guarded by A3D_TRANSMISSION), a transmission lobe without a
  // scoped captured target draws without refraction; ForwardPass reports TRANSMISSION_DEGRADED for that draw.
  const transmission = transmissionLobe && transmissionTarget;
  const transmissionDegraded = transmissionLobe && !transmissionTarget;
  const tangentFrame = active.has("prd04.tangentFrame");
  const geometryTangent = f.features["prd04.geometryTangent"] === true;
  const tangent = geometryTangent || morph?.tangents === true;
  if ((tangentFrame && active.get("prd04.tangentFrame") !== true) || ((anisotropy || geometryTangent) && !tangentFrame)) unsupported("activeFeatures", "anisotropy without a resolved tangent-frame contributor");
  const ibl = active.has("prd02.ibl");
  const fraction = active.has("prd03.indirectFraction");
  const outputSrgb = f.features["a3d.output.srgb"] === true;
  // Like the WebGL2 write chunk (`#if !defined(ALPHA_BLEND) && !defined(ALPHA_TO_COVERAGE)`), an alpha-to-coverage draw
  // keeps its coverage alpha and carries no indirect-fraction tag (Slingshot Siege foliage), so the tag does not reserve it.
  const alphaToCoverage = generatedAlphaToCoverage(active, f, writesDepthCoverage, unsupported);
  const localProbe = f.features["prd02.localProbe"] === true;
  const volume = f.features["prd02.irradianceVolume"] === true;
  const probe = f.features["a3d.nativeProbeGrid"], voxel = f.features["a3d.nativeVoxelIndirect"], lightmap = f.features["a3d.nativeBakedLightmap"];
  const lightmapUv = f.features["a3d.nativeLightmapUv"];
  if ((probe !== undefined && probe !== false && probe !== true) || (voxel !== undefined && voxel !== false && voxel !== true)
    || (lightmap !== undefined && lightmap !== false && lightmap !== "replace-diffuse" && lightmap !== "add-indirect")
    || (lightmap && lightmapUv !== 0 && lightmapUv !== 1) || (!lightmap && lightmapUv !== undefined && lightmapUv !== false)) {
    unsupported("advancedLighting", "invalid advanced diffuse-lighting metadata");
  }
  const advanced: "none" | "probe" | "voxel" | "lightmap" = probe === true ? "probe" : voxel === true ? "voxel" : lightmap ? "lightmap" : "none";
  if (Number(probe === true) + Number(voxel === true) + Number(Boolean(lightmap)) + Number(volume) > 1 || (lightmap && (transmissionLobe || diffuseTransmission)) || (diffuseTransmission && materialVolume)) {
    unsupported("advancedLighting", "conflicting advanced diffuse-lighting sources");
  }
  const baseMap = Boolean(f.maps.baseColor);
  const normalMap = Boolean(f.maps.normal);
  const diffuseMap = Boolean(f.maps.diffuseRoughness);
  const bumpMap = Boolean(f.maps.bump);
  const metalRoughMap = Boolean(f.maps.metallicRoughness);
  const occlusionMap = Boolean(f.maps.occlusion);
  const emissiveMap = Boolean(f.maps.emissive);
  const uv0 = Object.values(f.maps).some((map) => map?.uvSet === 0) || Object.values(lobeMaps).includes(0) || (advanced === "lightmap" && lightmapUv === 0);
  const uv1 = Object.values(f.maps).some((map) => map?.uvSet === 1) || Object.values(lobeMaps).includes(1) || (advanced === "lightmap" && lightmapUv === 1);
  const procedural = f.lights.hemisphere;
  const totalLights = f.lights.dir + f.lights.point + f.lights.spot + f.lights.rect;
  // Rectangle bucket 4 is capped and also represents any larger rect count.
  const directBound = f.lights.clustered ? 0 : f.lights.rect === 4 || totalLights > 4 ? 16 : totalLights;
  if (ibl !== descriptor.lighting.iblReplacesIndirect || (ibl && (!descriptor.lighting.compilerLightingConjunction || active.get("prd02.ibl") !== true))) unsupported("lighting", "inconsistent IBL contributor metadata");
  if (ibl && f.environment !== "pmrem-cube") unsupported("environment", `environment ${f.environment} with the probe path`);
  if (!["none", "pmrem-cube", "equirect"].includes(f.environment)) unsupported("environment", `environment ${String(f.environment)}`);
  const sampled = ibl || f.environment === "none" ? "none" : f.environment === "pmrem-cube" ? "cube" : "equirect";
  const expected: Readonly<Record<string, boolean>> = {
    A3D_GENERATED_PROGRAM: true, A3D_LIT: true, A3D_NEED_NORMAL: true,
    VERTEX_COLORS: f.vertexColors, FLAT_SHADING: f.flatShading, DIFFUSE_BURLEY: f.diffuseModel === "burley",
    USE_INSTANCING: Boolean(f.instancing), USE_INSTANCING_COLOR: f.instancing?.color === true, USE_INSTANCING_EMISSIVE: false,
    USE_SKINNING: Boolean(f.skinning),
    USE_MORPH: Boolean(f.morph), A3D_MORPH_NORMALS: morph?.normals === true, A3D_MORPH_TANGENTS: morph?.tangents === true,
    A3D_JOINT0_UINT: jointKinds[0] === "uint", A3D_JOINT0_SINT: jointKinds[0] === "sint",
    A3D_JOINT1_UINT: jointKinds[1] === "uint", A3D_JOINT1_SINT: jointKinds[1] === "sint",
    A3D_NEED_UV0: uv0 || emissiveLobeMap, A3D_NEED_UV1: uv1,
    USE_BASE_COLOR_MAP: baseMap, USE_BASE_COLOR_MAP_UV1: f.maps.baseColor?.uvSet === 1, USE_BASE_COLOR_MAP_TRANSFORM: Boolean(f.maps.baseColor?.transform),
    USE_NORMAL_MAP: normalMap, USE_NORMAL_MAP_UV1: f.maps.normal?.uvSet === 1, USE_NORMAL_MAP_TRANSFORM: Boolean(f.maps.normal?.transform),
    USE_DIFFUSE_ROUGHNESS_MAP: diffuseMap, USE_DIFFUSE_ROUGHNESS_MAP_UV1: f.maps.diffuseRoughness?.uvSet === 1, USE_DIFFUSE_ROUGHNESS_MAP_TRANSFORM: Boolean(f.maps.diffuseRoughness?.transform),
    USE_BUMP_MAP: bumpMap, USE_BUMP_MAP_UV1: f.maps.bump?.uvSet === 1, USE_BUMP_MAP_TRANSFORM: Boolean(f.maps.bump?.transform),
    USE_METALLIC_ROUGHNESS_MAP: metalRoughMap, USE_METALLIC_ROUGHNESS_MAP_UV1: f.maps.metallicRoughness?.uvSet === 1, USE_METALLIC_ROUGHNESS_MAP_TRANSFORM: Boolean(f.maps.metallicRoughness?.transform),
    USE_OCCLUSION_MAP: occlusionMap, USE_OCCLUSION_MAP_UV1: f.maps.occlusion?.uvSet === 1, USE_OCCLUSION_MAP_TRANSFORM: Boolean(f.maps.occlusion?.transform),
    USE_EMISSIVE_MAP: emissiveMap, USE_EMISSIVE_MAP_UV1: f.maps.emissive?.uvSet === 1, USE_EMISSIVE_MAP_TRANSFORM: Boolean(f.maps.emissive?.transform),
    DOUBLE_SIDED: f.doubleSided, SPECULAR_AA: f.specularAntialiasing, SHADOW_CONTACT: f.shadows.contact,
    FOG_LINEAR: f.fog === "linear", FOG_EXP2: f.fog === "exp2" || f.fog === "height", FOG_HEIGHT: f.fog === "height", A3D_CLIPPING: f.features["a3d.clipping"] === true,
    A3D_PHOTOMETRIC_PROFILE: photometric, A3D_DEPTH_COVERAGE: writesDepthCoverage, A3D_WETNESS: wetness,
    A3D_FOG: prd07Fog !== undefined, A3D_FOG_FROXEL_TIER: prd07Fog === "volumetric", A3D_PRD10_WIND: wind, A3D_PRD04_RIM: rim,
    A3D_INSTANCE_COLOR_EMISSIVE: instanceColorTarget, A3D_INSTANCE_EMISSIVE_ATTRIBUTE: emissiveTarget,
    A3D_LOG_DEPTH: f.features[PROGRAM_LOG_DEPTH_FEATURE] === true,
    A3D_PRD04_ALPHA_TO_COVERAGE: alphaToCoverage, ALPHA_TO_COVERAGE: alphaToCoverage,
    A3D_LEGACY_POINT_SHADOW: pointShadow, A3D_LEGACY_SPOT_SHADOW: spotShadow,
    ALPHA_MASK: f.alphaMode === "mask", ALPHA_BLEND: f.alphaMode === "blend",
    LIGHT_HEMISPHERE: procedural, LIGHTS_CLUSTERED: f.lights.clustered, A3D_ENV_SAMPLE: f.environment !== "none", ENVMAP_TYPE_CUBE_UV: f.environment === "pmrem-cube", ENVMAP_TYPE_EQUIRECT: f.environment === "equirect",
    A3D_PRD02_IBL: ibl, A3D_INDIRECT_FRACTION: fraction, A3D_LOCAL_PROBE: localProbe, A3D_IRRADIANCE_VOLUME: volume, A3D_PACKED_LOOP_COLOR: packedLoopColor,
    A3D_NATIVE_PROBE_GRID: advanced === "probe", A3D_NATIVE_VOXEL_INDIRECT: advanced === "voxel", A3D_NATIVE_BAKED_LIGHTMAP: advanced === "lightmap",
    A3D_NATIVE_LIGHTMAP_ADD: lightmap === "add-indirect", A3D_NATIVE_LIGHTMAP_UV1: advanced === "lightmap" && lightmapUv === 1,
    A3D_LOCAL_DIFFUSE_IRRADIANCE: volume || advanced === "probe" || advanced === "voxel",
    A3D_LOBE_SHEEN: sheen, A3D_LOBE_EMISSIVE_STRENGTH: extensionIds.has("emissive-strength"), A3D_LOBE_EMISSIVE_STRENGTH_MAP: emissiveMapBit,
    A3D_LOBE_IOR: extensionIds.has("ior"), A3D_LOBE_IOR_IOR: Boolean(iorBit), A3D_LOBE_SPECULAR: extensionIds.has("specular"),
    A3D_LOBE_TRANSMISSION: transmissionLobe, A3D_LOBE_TRANSMISSION_MAP: lobeMaps.transmission !== undefined, A3D_TRANSMISSION: transmissionTarget,
    A3D_LOBE_DIFFUSE_TRANSMISSION: diffuseTransmission, A3D_LOBE_DIFFUSE_TRANSMISSION_MAP: lobeMaps.diffuseTransmission !== undefined,
    A3D_LOBE_DIFFUSE_TRANSMISSION_COLOR_MAP: lobeMaps.diffuseTransmissionColor !== undefined,
    A3D_LOBE_VOLUME: materialVolume, A3D_LOBE_VOLUME_THICKNESS_MAP: lobeMaps.volumeThickness !== undefined, A3D_LOBE_DISPERSION: dispersion,
    A3D_INSTANCE_VOLUME_TRANSFORM: Boolean(f.instancing && transmissionLobe && materialVolume),
    A3D_LOBE_SPECULAR_SPECULAR_MAP: lobeMaps.specular !== undefined, A3D_LOBE_SPECULAR_SPECULAR_COLOR_MAP: lobeMaps.specularColor !== undefined,
    A3D_LOBE_SHEEN_COLOR_MAP: lobeMaps.sheenColor !== undefined, A3D_LOBE_SHEEN_ROUGHNESS_MAP: lobeMaps.sheenRoughness !== undefined,
    A3D_LOBE_CLEARCOAT: coat, A3D_LOBE_CLEARCOAT_MAP: lobeMaps.clearcoat !== undefined,
    A3D_LOBE_CLEARCOAT_ROUGHNESS_MAP: lobeMaps.clearcoatRoughness !== undefined, A3D_LOBE_CLEARCOAT_NORMAL_MAP: lobeMaps.clearcoatNormal !== undefined,
    A3D_LOBE_IRIDESCENCE: iridescence, A3D_LOBE_IRIDESCENCE_FILM: iridescenceFilm,
    A3D_LOBE_IRIDESCENCE_MAP: lobeMaps.iridescence !== undefined, A3D_LOBE_IRIDESCENCE_THICKNESS_MAP: lobeMaps.iridescenceThickness !== undefined,
    A3D_PRD04_TANGENT_FRAME: tangentFrame, A3D_HAS_TANGENT: tangent, A3D_LOBE_ANISOTROPY: anisotropy, A3D_LOBE_ANISOTROPY_MAP: lobeMaps.anisotropy !== undefined
  };
  for (const [name, enabled] of Object.entries(expected)) {
    if (hasDefine(descriptor.defines, name) !== enabled) unsupported(`defines.${name}`, `inconsistent ${name} define`);
  }
  if (writesDepthCoverage && descriptor.defines.A3D_DEPTH_COVERAGE !== true && descriptor.defines.A3D_DEPTH_COVERAGE !== 1) unsupported("defines.A3D_DEPTH_COVERAGE", "invalid depth coverage define");
  if (packedLoopColor && descriptor.defines.A3D_PACKED_LOOP_COLOR !== true && descriptor.defines.A3D_PACKED_LOOP_COLOR !== 1) unsupported("defines.A3D_PACKED_LOOP_COLOR", "invalid packed member color define");
  const allowedDefines = new Set([...Object.keys(expected), "A3D_NUM_DIRECT_LIGHTS", "NUM_DIR_LIGHTS", "NUM_POINT_LIGHTS", "NUM_SPOT_LIGHTS", "NUM_RECT_LIGHTS", "SHADOW_PCF_TAPS", "A3D_SHADOW_FILTER", ...(f.shadows.cascades ? ["NUM_SHADOW_CASCADES"] : []), ...(f.shadows.localShadows ? ["NUM_LOCAL_SHADOWS"] : []), ...(skinning ? ["A3D_SKINNING"] : []), ...(morph ? ["A3D_MORPH", "A3D_MORPH_MAX_ACTIVE"] : [])]);
  for (const name of Object.keys(descriptor.defines)) if (!allowedDefines.has(name)) unsupported(`defines.${name}`, `define ${name}`);
  if (iorBit && descriptor.defines.A3D_LOBE_IOR_IOR !== iorBit) unsupported("defines.A3D_LOBE_IOR_IOR", "inconsistent IOR metadata");
  for (const [name, count] of Object.entries({ A3D_NUM_DIRECT_LIGHTS: directBound,
    NUM_DIR_LIGHTS: f.lights.clustered ? undefined : f.lights.dir, NUM_POINT_LIGHTS: f.lights.clustered ? undefined : f.lights.point,
    NUM_SPOT_LIGHTS: f.lights.clustered ? undefined : f.lights.spot, NUM_RECT_LIGHTS: f.lights.clustered ? undefined : f.lights.rect })) {
    if (descriptor.defines[name] !== count) unsupported(`defines.${name}`, `inconsistent ${name}`);
  }
  if (f.shadows.cascades && descriptor.defines.NUM_SHADOW_CASCADES !== f.shadows.cascades) unsupported("defines.NUM_SHADOW_CASCADES", "inconsistent shadow cascade metadata");
  if (f.shadows.localShadows && descriptor.defines.NUM_LOCAL_SHADOWS !== f.shadows.localShadows) unsupported("defines.NUM_LOCAL_SHADOWS", "inconsistent local shadow metadata");
  if (fraction && f.alphaMode !== "blend" && !alphaToCoverage && outputSrgb) unsupported("features.a3d.output.srgb", "indirect-fraction tags on a direct presentation output");
  // A degraded transmission lobe samples none of its refraction inputs (the GLSL twin reads them but discards the result).
  const shadedLobeMaps: LobeMaps = { ...lobeMaps };
  if (transmissionDegraded) { delete shadedLobeMaps.transmission; delete shadedLobeMaps.volumeThickness; }
  return { baseMap, normalMap, diffuseMap, bumpMap, metalRoughMap, occlusionMap, emissiveMap, lobeMaps: shadedLobeMaps, uv0, uv1, ibl, sampled, procedural, localProbe, volume, advanced, lightmapUv: lightmapUv === 1 ? 1 : 0, lightmapAdd: lightmap === "add-indirect", directBound, sheen, coat, iridescence, anisotropy, transmission, transmissionDegraded, diffuseTransmission, materialVolume: materialVolume && transmission, dispersion: dispersion && transmission, tangent, fraction, outputSrgb, wetness, prd07Fog: prd07Fog !== undefined, wind, rim, instanceEmissive, alphaToCoverage, skinning, morph, jointKinds };
}


/**
 * PRD-10 wind, as `a3d_prd10_wind_deform` compiles in a generated forward vertex stage: the instance origin is the
 * instance translation column when instanced, the weights are the vertex colour when present (else the trunk-bend
 * default), and the offset is added to the object-space position before instancing and the geometry transform.
 */
const GENERATED_WIND_WGSL = `@group(0) @binding(76) var u_windNoiseSampler: sampler;
@group(0) @binding(77) var u_windNoiseTexture: texture_2d<f32>;
${prd10WindOffsetWgsl("generatedWindOffset", "material.windDirStrength", "material.windGust", "u_windNoiseTexture", "u_windNoiseSampler")}`;

/**
 * PRD-07 forward fog: the selected value, the feature bit and the A3D_FOG define agree, and the contributor is the
 * unchanged built-in object (the native template replaces its GLSL chunk). Returns the selected tier or undefined.
 */
export function validatePrd07FogMetadata(
  descriptor: GeneratedPbrDescriptor, active: ReadonlyMap<string, string | number | boolean>, fail: (field: string, detail: string) => never
): "height" | "volumetric" | undefined {
  const value = active.get("prd07.fog");
  const bit = descriptor.features.features["prd07.fog"];
  if (value === undefined) {
    if (bit !== undefined && bit !== false) fail("features.prd07.fog", "inactive fog metadata");
    return undefined;
  }
  if ((value !== "height" && value !== "volumetric") || bit !== value) fail("features.prd07.fog", "inconsistent fog metadata");
  if (!descriptor.verifiedFeatures?.includes("prd07.fog")) fail("activeFeatures", "a replaced or unverified prd07.fog contributor");
  if (descriptor.defines.A3D_FOG !== 1 && descriptor.defines.A3D_FOG !== true) fail("defines.A3D_FOG", "invalid fog define");
  return value as "height" | "volumetric";
}

const SHEEN_WGSL = `const sheenAlbedo: array<f32, 256> = array<f32, 256>(${A3D_SHEEN_ALBEDO_LUT.map((v) => v.toFixed(8)).join(", ")});
fn generatedSheenAlbedo(ndv: f32, roughness: f32) -> f32 {
  let p = clamp(vec2f(roughness, ndv), vec2f(0.0), vec2f(1.0)) * 15.0;
  let lo = vec2u(floor(p)); let hi = min(lo + vec2u(1u), vec2u(15u)); let f = fract(p);
  let lower = mix(sheenAlbedo[lo.y * 16u + lo.x], sheenAlbedo[lo.y * 16u + hi.x], f.x);
  let upper = mix(sheenAlbedo[hi.y * 16u + lo.x], sheenAlbedo[hi.y * 16u + hi.x], f.x);
  return clamp(mix(lower, upper, f.y), 0.0, 1.0);
}
fn generatedSheenDirect(n: vec3f, v: vec3f, l: vec3f, color: vec3f, roughness: f32) -> vec3f {
  let nl = clamp(dot(n, l), 0.0, 1.0); let nv = clamp(dot(n, v), 0.0, 1.0);
  if (nl <= 0.0 || nv <= 0.0) { return vec3f(0.0); }
  let sum = l + v; var h = n;
  if (dot(sum, sum) > 0.000001) { h = normalize(sum); }
  let ndh = clamp(dot(n, h), 0.0, 1.0);
  let inverseAlpha = 1.0 / max(roughness * roughness, 0.0001);
  let distribution = (2.0 + inverseAlpha) * pow(max(1.0 - ndh * ndh, 0.0), 0.5 * inverseAlpha) / (2.0 * A3D_PHYSICAL_PI);
  let visibility = min(1.0 / max(4.0 * (nl + nv - nl * nv), 0.000001), 1.0);
  return color * distribution * visibility;
}`;

const DIRECT_LIGHT_WGSL = `struct GeneratedDirectLight { direction: vec3f, radiance: vec3f, };
fn generatedDirectLight(colorIntensity: vec4f, positionRange: vec4f, directionKind: vec4f, spot: vec4f, twoSided: bool, world: vec3f) -> GeneratedDirectLight {
  var light: GeneratedDirectLight;
  if (directionKind.w < 0.5) {
    light.direction = -directionKind.xyz; light.radiance = colorIntensity.rgb * colorIntensity.a; return light;
  }
  let offset = positionRange.xyz - world; let distanceToLight = max(length(offset), 0.0001);
  light.direction = offset / distanceToLight;
  var attenuation = 1.0 / max(distanceToLight * distanceToLight, 0.01);
  if (positionRange.w > 0.0) {
    let window = clamp(1.0 - pow(distanceToLight / positionRange.w, 4.0), 0.0, 1.0);
    attenuation *= window * window;
  }
  if (directionKind.w > 1.5) {
    let facing = dot(normalize(directionKind.xyz), normalize(world - positionRange.xyz));
    let cone = select(facing, abs(facing), twoSided);
    let outer = cos(spot.x); let inner = cos(spot.x * max(1.0 - spot.y, 0.001));
    attenuation *= smoothstep(outer, inner, cone);
  }
  light.radiance = colorIntensity.rgb * colorIntensity.a * attenuation;
  return light;
}`;

// Four Gauss-Legendre points integrate a finite rectangular emitter.
const RECT_LIGHT_WGSL = `fn generatedRectLight(colorIntensity: vec4f, positionRange: vec4f, directionKind: vec4f,
  size: vec4f, areaRight: vec4f, areaUp: vec4f, sampleIndex: u32, world: vec3f) -> GeneratedDirectLight {
  let emitterNormal = directionKind.xyz / max(length(directionKind.xyz), 0.00001);
  let right = areaRight.xyz / max(length(areaRight.xyz), 0.00001);
  let up = areaUp.xyz / max(length(areaUp.xyz), 0.00001);
  let width = max(size.x, 0.0); let height = max(size.y, 0.0);
  let x = select(-1.0, 1.0, (sampleIndex & 1u) != 0u);
  let y = select(-1.0, 1.0, (sampleIndex & 2u) != 0u);
  let samplePosition = positionRange.xyz + (right * width * x + up * height * y) * 0.28867513459;
  let offset = samplePosition - world; let distanceToLight = length(offset);
  var light: GeneratedDirectLight; light.direction = -emitterNormal;
  if (distanceToLight > 0.0001) { light.direction = offset / distanceToLight; }
  let facing = dot(emitterNormal, -light.direction);
  let emitterCosine = select(max(facing, 0.0), abs(facing), areaUp.w > 0.5);
  var cutoff = 1.0;
  if (positionRange.w > 0.0) {
    let window = clamp(1.0 - pow(distanceToLight / positionRange.w, 4.0), 0.0, 1.0);
    cutoff = window * window;
  }
  let geometry = (width * height * 0.25) * emitterCosine * cutoff / max(distanceToLight * distanceToLight, 0.01);
  light.radiance = colorIntensity.rgb * colorIntensity.a * geometry;
  return light;
}`;

const CLIPPING_WGSL = `fn generatedClipRetains(worldPosition: vec3f, localPosition: vec3f) -> bool {
  for (var group = 0u; group < 2u; group += 1u) {
    if (f32(group) >= material.clipControl.x) { break; }
    let params = material.clipGroups[group]; let offset = u32(params.x); let count = u32(params.y);
    if (count == 0u) { continue; }
    let point = select(worldPosition, localPosition, params.w > 0.5); let anyMode = params.z > 0.5;
    var retained = !anyMode;
    for (var plane = 0u; plane < count; plane += 1u) {
      let inside = dot(material.clipPlanes[offset + plane], vec4f(point, 1.0)) >= 0.0;
      if (anyMode) { retained = retained || inside; } else { retained = retained && inside; }
    }
    if (!retained) { return false; }
  }
  return true;
}`;

// The forward binder chooses one cascade per draw. Its matrix uses GL clip
// depth and its PCF offsets are in bottom-left texture coordinates.
const FORWARD_SHADOW_WGSL = `fn generatedForwardShadow(world: vec3f, normal: vec3f, lightDirection: vec3f) -> f32 {
  if (material.shadowParams.x < 0.5) { return 1.0; }
  let receiverNormal = normalize(normal);
  let lightPosition = material.shadowMatrix * vec4f(world + receiverNormal * material.shadowTexel.z, 1.0);
  let projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  let uv = projected.xy * 0.5 + vec2f(0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 1.0; }
  let direction = lightDirection / max(length(lightDirection), 0.0001);
  let nl = clamp(abs(dot(receiverNormal, direction)), 0.0, 1.0);
  let slope = min(sqrt(max(1.0 - nl * nl, 0.0)) / max(nl, 0.05), 8.0);
  let slopeBias = slope * material.shadowParams.w * max(material.shadowTexel.x, material.shadowTexel.y);
  let receiver = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  let count = clamp(i32(material.shadowTexel.w), 1, 32);
  var shadowed = 0.0; var totalWeight = 0.0;
  for (var i = 0; i < 32; i += 1) {
    if (i >= count) { break; }
    let tap = material.shadowSamples[u32(i)];
    let offset = tap.xy * material.shadowTexel.xy;
    let stored = textureSampleLevel(u_shadowMapTextureTexture, u_shadowMapTextureSampler, vec2f(uv.x + offset.x, 1.0 - uv.y - offset.y), 0.0).r;
    let bias = material.shadowParams.z + slopeBias * max(1.0, length(tap.xy));
    let weight = max(tap.z, 0.0);
    shadowed += select(0.0, weight, receiver - bias > stored);
    totalWeight += weight;
  }
  var occlusion = 0.0;
  if (totalWeight > 0.0) { occlusion = shadowed / totalWeight; }
  return mix(1.0, 1.0 - occlusion, clamp(material.shadowParams.y, 0.0, 1.0));
}`;

// Standalone point and spot maps are color-encoded depth with GL-origin
// projections. Their selected light identity and PCF kernel are draw-owned.
function standaloneShadowWgsl(kind: "point" | "spot"): string {
  const name = kind === "point" ? "Point" : "Spot";
  const field = `${kind}Shadow`;
  return `fn generated${name}Pcf(uv: vec2f, depth: f32, normal: vec3f, toLight: vec3f) -> f32 {
  let nl = clamp(abs(dot(normalize(normal), normalize(toLight))), 0.0, 1.0);
  let slope = min(sqrt(max(1.0 - nl * nl, 0.0)) / max(nl, 0.05), 8.0);
  let texel = material.${field}Texel.xy; let params = material.${field}Params;
  let count = clamp(i32(material.${field}Texel.z), 1, 32);
  var shadowed = 0.0; var totalWeight = 0.0;
  for (var index = 0; index < 32; index += 1) {
    if (index >= count) { break; }
    let tap = material.${field}Samples[u32(index)];
    let coord = uv + tap.xy * texel;
    let stored = textureSampleLevel(u_${kind}ShadowMapTextureTexture, u_${kind}ShadowMapTextureSampler, vec2f(coord.x, 1.0 - coord.y), 0.0).r;
    let bias = params.z + slope * params.w * max(texel.x, texel.y) * max(1.0, length(tap.xy));
    let weight = max(tap.z, 0.0);
    shadowed += select(0.0, weight, depth - bias > stored); totalWeight += weight;
  }
  var occlusion = 0.0;
  if (totalWeight > 0.0) { occlusion = shadowed / totalWeight; }
  return mix(1.0, 1.0 - occlusion, clamp(params.y, 0.0, 1.0));
}
fn generated${name}Shadow(world: vec3f, normal: vec3f, toLight: vec3f) -> f32 {
  if (material.${field}Params.x < 0.5) { return 1.0; }
  let delta = world - material.${field}PositionRange.xyz;
  let distanceToLight = length(delta);
  if (distanceToLight > material.${field}PositionRange.w) { return 1.0; }
  ${kind === "point" ? `let axis = abs(delta);
  var face = 0u;
  if (axis.x >= axis.y && axis.x >= axis.z) { face = select(1u, 0u, delta.x >= 0.0); }
  else if (axis.y >= axis.z) { face = select(3u, 2u, delta.y >= 0.0); }
  else { face = select(5u, 4u, delta.z >= 0.0); }
  let clip = material.pointShadowMatrices[face] * vec4f(world, 1.0);` : `
  let direction = material.spotShadowDirectionAngle.xyz / max(length(material.spotShadowDirectionAngle.xyz), 0.0001);
  if (dot(delta / max(distanceToLight, 0.0001), direction) < cos(material.spotShadowDirectionAngle.w)) { return 1.0; }
  let clip = material.spotShadowMatrix * vec4f(world, 1.0);`}
  let projected = clip.xyz / max(clip.w, 0.0001);
  let localUv = projected.xy * 0.5 + vec2f(0.5);
  if (any(localUv < vec2f(0.0)) || any(localUv > vec2f(1.0))) { return 1.0; }
  ${kind === "point" ? "let rect = material.pointShadowRects[face]; let uv = rect.xy + localUv * rect.zw;" : "let uv = localUv;"}
  return generated${name}Pcf(uv, projected.z * 0.5 + 0.5, normal, toLight);
}`;
}

// The WebGPU atlas stores depth in a color texture. Reconstruct the 2x2
// filtered comparison used by the WebGL depth-comparison sampler.
const LOCAL_SHADOW_WGSL = `fn generatedAtlasDepth(uv: vec2f) -> f32 {
  return textureSampleLevel(u_localShadowAtlasTexture, u_localShadowAtlasSampler, vec2f(uv.x, 1.0 - uv.y), 0.0).r;
}
fn generatedAtlasCompare(uv: vec2f, reference: f32) -> f32 {
  let texel = material.localShadowTexel.xy;
  let pixel = uv / texel - vec2f(0.5);
  let base = floor(pixel); let fraction = fract(pixel);
  let origin = (base + vec2f(0.5)) * texel;
  let a = select(0.0, 1.0, reference <= generatedAtlasDepth(origin));
  let b = select(0.0, 1.0, reference <= generatedAtlasDepth(origin + vec2f(texel.x, 0.0)));
  let c = select(0.0, 1.0, reference <= generatedAtlasDepth(origin + vec2f(0.0, texel.y)));
  let d = select(0.0, 1.0, reference <= generatedAtlasDepth(origin + texel));
  return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
}
fn generatedLocalShadow(kind: f32, slot: f32, lightPosition: vec3f, world: vec3f, normal: vec3f, toLight: vec3f) -> f32 {
  if (material.localShadowParams.x <= 0.0 || slot < 0.5 || kind < 0.5 || kind > 2.5) { return 1.0; }
  var tile = i32(slot + 0.5) - 1;
  if (kind < 1.5) {
    let direction = world - lightPosition; let axis = abs(direction);
    var face = 0;
    if (axis.x >= axis.y && axis.x >= axis.z) { face = select(1, 0, direction.x >= 0.0); }
    else if (axis.y >= axis.z) { face = select(3, 2, direction.y >= 0.0); }
    else { face = select(5, 4, direction.z >= 0.0); }
    tile += face;
  }
  if (tile < 0 || tile >= 6) { return 1.0; }
  let n = normalize(normal);
  let axis = material.localShadowMatrices[u32(tile)] * vec4f(world, 1.0);
  if (axis.w <= 0.0) { return 1.0; }
  let texelWorld = axis.w * material.localShadowScales[u32(tile / 4)][u32(tile % 4)];
  let nl = clamp(abs(dot(n, toLight)), 0.0, 1.0);
  let slope = min(sqrt(max(1.0 - nl * nl, 0.0)) / max(nl, 0.05), 8.0);
  let receiver = world + n * (texelWorld * material.localShadowParams.w);
  let tilePosition = material.localShadowMatrices[u32(tile)] * vec4f(receiver, 1.0);
  if (tilePosition.w <= 0.0) { return 1.0; }
  let projected = tilePosition.xyz / tilePosition.w;
  if (projected.x < 0.0 || projected.x > 1.0 || projected.y < 0.0 || projected.y > 1.0 || projected.z > 1.0) { return 1.0; }
  let biased = receiver + toLight * (texelWorld * (material.localShadowParams.y + material.localShadowParams.z * slope));
  let biasedPosition = material.localShadowMatrices[u32(tile)] * vec4f(biased, 1.0);
  let reference = clamp(biasedPosition.z / max(biasedPosition.w, 0.0001), 0.0, 1.0);
  let rect = material.localShadowRects[u32(tile)];
  let halfTexel = 0.5 * material.localShadowTexel.xy;
  let uv = clamp(rect.xy + projected.xy * rect.zw, rect.xy + halfTexel, rect.xy + rect.zw - halfTexel);
  return mix(1.0, generatedAtlasCompare(uv, reference), clamp(material.localShadowParams.x, 0.0, 1.0));
}`;

const TRANSMISSION_WGSL = `fn generatedRefractionRay(normal: vec3f, view: vec3f, thickness: f32, ior: f32, worldLinear: mat3x3f) -> vec3f {
  if (dot(normal, normal) <= 0.000000000001 || thickness <= 0.0) { return vec3f(0.0); }
  var direction = refract(-view, normalize(normal), 1.0 / max(ior, 0.0001));
  let directionLength = length(direction);
  if (directionLength <= 0.000001) { return vec3f(0.0); }
  direction /= directionLength;
  let a = worldLinear[0]; let b = worldLinear[1]; let c = worldLinear[2];
  let row0 = cross(b, c); let row1 = cross(c, a); let row2 = cross(a, b);
  let det = dot(a, row0);
  if (abs(det) <= 0.00000001) { return vec3f(0.0); }
  let localRay = vec3f(dot(row0, direction), dot(row1, direction), dot(row2, direction)) / det;
  return direction * (thickness / max(length(localRay), 0.000001));
}
fn generatedVolumeAttenuation(distance: f32) -> vec3f {
  if (distance <= 0.0 || material.volumeMaterial.y >= 3.4028234663852886e38) { return vec3f(1.0); }
  if (material.volumeMaterial.y <= 0.0) { return vec3f(0.0); }
  let color = clamp(material.volumeColor.rgb, vec3f(0.0), vec3f(1.0));
  let result = pow(max(color, vec3f(0.00000001)), vec3f(distance / material.volumeMaterial.y));
  return select(result, vec3f(0.0), color <= vec3f(0.0));
}
fn generatedTransmissionSample(world: vec3f, normal: vec3f, view: vec3f, roughness: f32, ior: f32, thickness: f32, worldLinear: mat3x3f) -> vec3f {
  let ray = generatedRefractionRay(normal, view, thickness, ior, worldLinear);
  let clip = frame.projection * frame.view * vec4f(world + ray, 1.0);
  var w = clip.w;
  if (abs(w) <= 0.000001) { w = select(0.000001, -0.000001, w < 0.0); }
  let uv = material.transmissionViewport.xy + (clip.xy / w * 0.5 + vec2f(0.5)) * material.transmissionViewport.zw;
  let available = f32(textureNumLevels(a3d_prd04_transmissionSamplerTexture) - 1u);
  let lod = min(max(log2(max(material.transmission.y, material.transmission.z)), 0.0)
    * clamp(roughness, 0.0, 1.0) * clamp((ior - 1.0) * 2.0, 0.0, 1.0), available);
  let scene = textureSampleLevel(a3d_prd04_transmissionSamplerTexture, a3d_prd04_transmissionSamplerSampler, vec2f(uv.x, 1.0 - uv.y), lod).rgb;
  return scene * generatedVolumeAttenuation(length(ray));
}`;

const ROTATE_Y_WGSL = `fn generatedRotateY(d: vec3f, angle: f32) -> vec3f {
  let c = cos(angle); let s = sin(angle);
  return vec3f(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
}`;
const PROBE_WGSL = `fn generatedProbeIrradiance(direction: vec3f) -> vec3f {
  let n = normalize(generatedRotateY(direction, material.probe.y)); let x = n.x; let y = n.y; let z = n.z;
  let c0 = material.sh[0].xyz; let c1 = vec3f(material.sh[0].w, material.sh[1].xy);
  let c2 = vec3f(material.sh[1].zw, material.sh[2].x); let c3 = material.sh[2].yzw;
  let c4 = material.sh[3].xyz; let c5 = vec3f(material.sh[3].w, material.sh[4].xy);
  let c6 = vec3f(material.sh[4].zw, material.sh[5].x); let c7 = material.sh[5].yzw; let c8 = material.sh[6].xyz;
  let irradiance = c0 * 0.282095 + c1 * (-0.488603 * y) + c2 * (0.488603 * z) + c3 * (-0.488603 * x)
    + c4 * (1.092548 * x * y) + c5 * (1.092548 * y * z) + c6 * (0.315392 * (3.0 * z * z - 1.0))
    + c7 * (1.092548 * x * z) + c8 * (0.546274 * (x * x - y * y));
  return max(irradiance, vec3f(0.0)) * material.probe.z;
}`;

function sampledEnvironmentWgsl(kind: "cube" | "equirect"): string {
  const sample = kind === "cube"
    ? "textureSampleLevel(u_environmentCubeMapTexture, u_environmentCubeMapSampler, generatedRotateY(normalize(direction), material.envMap.y * (2.0 * A3D_PHYSICAL_PI)), mip)"
    : `textureSampleLevel(u_environmentMapTexture, u_environmentMapSampler,
    vec2f(fract(atan2(normalize(direction).z, normalize(direction).x) / (2.0 * A3D_PHYSICAL_PI) + 0.5 + material.envMap.y), acos(clamp(normalize(direction).y, -1.0, 1.0)) / A3D_PHYSICAL_PI), mip)`;
  return `fn generatedSampleEnvironment(direction: vec3f, lod: f32) -> vec3f {
  let mip = clamp(lod, 0.0, 8.0) * (material.envMap.z / 8.0);
  let texel = ${sample};
  var decoded = texel.rgb;
  if (material.envMap.w > 0.5 && material.envMap.w < 1.5) {
    let exponent = texel.a * 255.0;
    decoded = select(vec3f(0.0), texel.rgb * exp2(exponent - 128.0) * (255.0 / 256.0), exponent > 0.0);
  }
  return max(decoded, vec3f(0.0)) * material.envMap.x;
}`;
}

const PROCEDURAL_WGSL = `fn generatedProceduralDiffuse(n: vec3f) -> vec3f {
  let blend = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  let sky = mix(material.procGround.rgb, material.procSky.rgb, blend);
  return mix(sky, material.procHorizon.rgb, clamp(1.0 - abs(n.y), 0.0, 1.0) * 0.55) * material.procSky.a;
}
fn generatedProceduralSpecular(r: vec3f, roughness: f32) -> vec3f {
  let rough = clamp(roughness, 0.0, 1.0);
  let band = pow(clamp(r.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, rough));
  let response = max(band, mix(0.04, 0.38, rough));
  let horizon = pow(clamp(1.0 - abs(r.y), 0.0, 1.0), mix(14.0, 3.0, rough));
  let side = pow(clamp(abs(r.x), 0.0, 1.0), mix(10.0, 3.0, rough)) * smoothstep(0.0, 0.72, 1.0 - abs(r.y));
  let overhead = pow(clamp(r.y * 0.5 + 0.5, 0.0, 1.0), mix(22.0, 4.0, rough));
  return (material.procSpecular.rgb * response + material.procHorizon.rgb * horizon * 0.42
    + material.procSky.rgb * overhead * 0.28 + material.procGround.rgb * side * 0.22) * material.procSpecular.a;
}`;

const LOCAL_PROBE_WGSL = `fn generatedLocalProbeDirection(world: vec3f, ray: vec3f, center: vec4f, halfSize: vec4f, capture: vec4f) -> vec3f {
  if (center.w <= 0.5) { return ray; }
  let origin = select(center.xyz, capture.xyz, capture.w > 0.5);
  let inverse = sign(ray + vec3f(0.000000000001)) / max(abs(ray), vec3f(0.000001));
  let tFar = max((center.xyz + halfSize.xyz - world) * inverse, (center.xyz - halfSize.xyz - world) * inverse);
  let hitDistance = max(min(min(tFar.x, tFar.y), tFar.z), 0.0);
  return world + ray * hitDistance - origin;
}
fn generatedLocalProbeRadiance(world: vec3f, ray: vec3f, roughness: f32) -> vec3f {
  let lod = clamp(roughness, 0.0, 1.0) * max(material.localWeights.w - 1.0, 0.0);
  var result = vec3f(0.0);
  if (material.localWeights.x > 0.0) {
    let direction = generatedLocalProbeDirection(world, ray, material.localCenterA, material.localHalfA, material.localOriginA);
    result += textureSampleLevel(u_prd02ProbeCubeATexture, u_prd02ProbeCubeASampler, direction, lod).rgb * material.localWeights.x;
  }
  if (material.localWeights.y > 0.0) {
    let direction = generatedLocalProbeDirection(world, ray, material.localCenterB, material.localHalfB, material.localOriginB);
    result += textureSampleLevel(u_prd02ProbeCubeBTexture, u_prd02ProbeCubeBSampler, direction, lod).rgb * material.localWeights.y;
  }
  return result;
}`;

const IRRADIANCE_VOLUME_WGSL = `fn generatedVolumeCoefficients(source: texture_2d_array<f32>, lower: vec3i, upper: vec3i, fraction: vec3f) -> vec4f {
  let x00 = mix(textureLoad(source, lower.xy, lower.z, 0), textureLoad(source, vec2i(upper.x, lower.y), lower.z, 0), fraction.x);
  let x10 = mix(textureLoad(source, vec2i(lower.x, upper.y), lower.z, 0), textureLoad(source, upper.xy, lower.z, 0), fraction.x);
  let x01 = mix(textureLoad(source, lower.xy, upper.z, 0), textureLoad(source, vec2i(upper.x, lower.y), upper.z, 0), fraction.x);
  let x11 = mix(textureLoad(source, vec2i(lower.x, upper.y), upper.z, 0), textureLoad(source, upper.xy, upper.z, 0), fraction.x);
  return mix(mix(x00, x10, fraction.y), mix(x01, x11, fraction.y), fraction.z);
}
fn generatedVolumeIrradiance(world: vec3f, n: vec3f, globalIrradiance: vec3f) -> vec3f {
  let grid = material.volumeGrid.xyz;
  let cell = (material.volumeMax.xyz - material.volumeMin.xyz) / grid;
  let point = world + n * cell * 0.5;
  let outside = max(max(material.volumeMin.xyz - point, point - material.volumeMax.xyz), vec3f(0.0));
  let fades = clamp(vec3f(1.0) - outside / (0.5 * cell), vec3f(0.0), vec3f(1.0));
  let fade = min(fades.x, min(fades.y, fades.z));
  let position = clamp((point - material.volumeMin.xyz) / cell - vec3f(0.5), vec3f(0.0), grid - vec3f(1.0));
  let lower = vec3i(floor(position)); let upper = min(lower + vec3i(1), vec3i(grid) - vec3i(1));
  let fraction = fract(position);
  let red = generatedVolumeCoefficients(u_prd02IrradianceRTexture, lower, upper, fraction);
  let green = generatedVolumeCoefficients(u_prd02IrradianceGTexture, lower, upper, fraction);
  let blue = generatedVolumeCoefficients(u_prd02IrradianceBTexture, lower, upper, fraction);
  let direction = normalize(n);
  let basis = vec4f(0.282095 * A3D_PHYSICAL_PI, -0.488603 * direction.y * (2.0 * A3D_PHYSICAL_PI / 3.0),
    0.488603 * direction.z * (2.0 * A3D_PHYSICAL_PI / 3.0), -0.488603 * direction.x * (2.0 * A3D_PHYSICAL_PI / 3.0));
  let local = max(vec3f(dot(red, basis), dot(green, basis), dot(blue, basis)), vec3f(0.0)) * material.volumeGrid.w;
  return mix(globalIrradiance, local, fade);
}`;

const MAP_UV_WGSL = `fn generatedMapUv(uv: vec2f, transform: vec4f, angle: f32) -> vec2f {
  let p = uv * transform.zw; let c = cos(angle); let s = sin(angle);
  return vec2f(c * p.x - s * p.y, s * p.x + c * p.y) + transform.xy;
}`;

const CLEARCOAT_WGSL = `fn generatedClearcoatDirect(n: vec3f, v: vec3f, l: vec3f, roughness: f32) -> vec3f {
  let nl = clamp(dot(n, l), 0.0, 1.0); let nv = clamp(dot(n, v), 0.0, 1.0);
  if (nl <= 0.0 || nv <= 0.0) { return vec3f(0.0); }
  let halfSum = l + v; var h = n;
  if (dot(halfSum, halfSum) > 0.000001) { h = normalize(halfSum); }
  let alpha = max(roughness * roughness, 0.0001);
  return a3dPhysicalFresnel(vec3f(0.04), 1.0, dot(v, h)) * a3dPhysicalDggx(alpha, dot(n, h)) * a3dPhysicalVisibility(alpha, nl, nv);
}`;

// Reuse Aura's independent spectral Airy evaluator; its later lobe wrapper
// depends on a different shader ABI, so composition below supplies our own.
const IRIDESCENCE_EVAL_WGSL = `const PI: f32 = A3D_PHYSICAL_PI;\n${A3D_PRD04_IRIDESCENCE_WGSL.split("fn a3dPrd04IridescenceInit")[0]}`;
const ANISOTROPY_WGSL = `fn generatedAnisotropicGgx(n: vec3f, v: vec3f, l: vec3f, tangent: vec3f, bitangent: vec3f, alphaT: f32, alphaB: f32, f0: vec3f, f90: f32) -> vec3f {
  let nl = clamp(dot(n, l), 0.0, 1.0); let nv = clamp(dot(n, v), 0.0, 1.0);
  if (nl <= 0.0 || nv <= 0.0) { return vec3f(0.0); }
  let halfSum = l + v; var h = n;
  if (dot(halfSum, halfSum) > 0.000001) { h = normalize(halfSum); }
  let at = max(alphaT, 0.0001); let ab = max(alphaB, 0.0001);
  let nh = clamp(dot(n, h), 0.0, 1.0); let th = dot(tangent, h) / at; let bh = dot(bitangent, h) / ab;
  let slope = th * th + bh * bh + nh * nh;
  let distribution = 1.0 / max(A3D_PHYSICAL_PI * at * ab * slope * slope, 0.000000000001);
  let projectedV = vec3f(at * dot(tangent, v), ab * dot(bitangent, v), nv);
  let projectedL = vec3f(at * dot(tangent, l), ab * dot(bitangent, l), nl);
  let visibility = 0.5 / max(nl * length(projectedV) + nv * length(projectedL), 0.000001);
  return a3dPhysicalFresnel(f0, f90, dot(v, h)) * distribution * visibility;
}`;

const OUTPUT_WGSL = `fn generatedEncodeOutput(linear: vec3f) -> vec3f {
  let c = max(linear, vec3f(0.0)) / 0.6;
  let v = vec3f(dot(vec3f(0.59719, 0.35458, 0.04823), c), dot(vec3f(0.076, 0.90834, 0.01566), c), dot(vec3f(0.0284, 0.13383, 0.83777), c));
  let fit = ((v + vec3f(0.0245786)) * v - vec3f(0.000090537)) / ((0.983729 * v + vec3f(0.432951)) * v + vec3f(0.238081));
  let display = clamp(vec3f(dot(vec3f(1.60475, -0.53108, -0.07367), fit), dot(vec3f(-0.10208, 1.10813, -0.00605), fit), dot(vec3f(-0.00327, -0.07276, 1.07602), fit)), vec3f(0.0), vec3f(1.0));
  return select(display * 12.92, 1.055 * pow(display, vec3f(1.0 / 2.4)) - vec3f(0.055), display >= vec3f(0.0031308));
}`;

/**
 * Logarithmic fragment depth, identical to the WebGL2 generated programs:
 * clamp(ln(max(d, near) / near) / ln(far / near), 0, 1), with d the forward
 * view distance of the interpolated world position (bound per draw from the
 * frame's u_a3dLogDepthView and u_a3dLogDepthRange).
 */
const LOG_DEPTH_WGSL = `fn generatedLogFragmentDepth(world: vec3f) -> f32 {
  let distance = -(material.logDepthView * vec4f(world, 1.0)).z;
  let range = material.logDepthRange.xy;
  return clamp(log(max(distance, range.x) / range.x) / log(range.y / range.x), 0.0, 1.0);
}`;

/** Compose a validated, feature-specific WGSL program and exact binding manifest. */
export function createGeneratedPbrProgram(descriptor: GeneratedPbrDescriptor): GeneratedPbrProgram {
  const f = descriptor.features;
  const mode = validateDescriptor(descriptor);
  const independentPhysicalPreview = f.features["a3d.independentPhysicalPreview"] === true;
  const packedLoopColor = f.features["a3d.packedLoopColor"] === true;
  const photometricProfile = f.features[PHOTOMETRIC_PROFILE_FEATURE] === true;
  const writesDepthCoverage = f.features[DEPTH_COVERAGE_FEATURE] === true;
  const logDepth = f.features[PROGRAM_LOG_DEPTH_FEATURE] === true;
  const physicalDirect = packedLoopColor ? "a3dPackedPhysicalDirect" : "a3dPhysicalDirect";
  const physicalIndirect = packedLoopColor ? "a3dPackedPhysicalIndirect" : "a3dPhysicalIndirect";
  const packedArgument = packedLoopColor ? ", material.packedLoopColor.rgb" : "";
  const instanceLocation = mode.skinning === 8 ? 10 : 8;
  const instanceStream = f.instancing?.color === true || (mode.instanceEmissive && Boolean(f.instancing));
  const instanceVolume = Boolean(f.instancing && mode.materialVolume);
  const clipping = f.features["a3d.clipping"] === true;
  const instanceVolumeVaryings = instanceVolume ? "@location(6) @interpolate(flat) volume0: vec3f, @location(7) @interpolate(flat) volume1: vec3f, @location(8) @interpolate(flat) volume2: vec3f," : "";
  const pointShadow = f.features["a3d.legacyPointShadow"] === true;
  const spotShadow = f.features["a3d.legacySpotShadow"] === true;
  const directEnabled = mode.directBound > 0 || f.lights.clustered;
  const needsDfg = mode.ibl || mode.sampled !== "none" || mode.procedural || mode.localProbe || mode.volume || mode.advanced !== "none" || mode.coat || mode.transmission || directEnabled;
  const resources: GeneratedPbrTextureResource[] = [];
  if (mode.baseMap) resources.push({ uniform: "u_baseColorMap", samplerBinding: 1, textureBinding: 2, dimension: "2d", sampleType: "filterable-float" });
  if (needsDfg) resources.push({ uniform: "u_dfgLut", samplerBinding: 3, textureBinding: 4, dimension: "2d", sampleType: "filterable-float" });
  if (mode.ibl) resources.push({ uniform: "u_envSpecular", samplerBinding: 5, textureBinding: 6, dimension: "cube", sampleType: "filterable-float" });
  if (mode.sampled !== "none") resources.push({ uniform: mode.sampled === "cube" ? "u_environmentCubeMap" : "u_environmentMap", samplerBinding: 7, textureBinding: 8, dimension: mode.sampled === "cube" ? "cube" : "2d", sampleType: "filterable-float" });
  if (mode.localProbe) {
    resources.push({ uniform: "u_prd02ProbeCubeA", samplerBinding: 9, textureBinding: 10, dimension: "cube", sampleType: "filterable-float", optionalWhenWeightZero: { uniform: "u_prd02ProbeWeights", component: 0 } });
    resources.push({ uniform: "u_prd02ProbeCubeB", samplerBinding: 11, textureBinding: 12, dimension: "cube", sampleType: "filterable-float", optionalWhenWeightZero: { uniform: "u_prd02ProbeWeights", component: 1 } });
  }
  if (mode.volume) {
    resources.push({ uniform: "u_prd02IrradianceR", textureBinding: 13, dimension: "2d-array", sampleType: "unfilterable-float" });
    resources.push({ uniform: "u_prd02IrradianceG", textureBinding: 14, dimension: "2d-array", sampleType: "unfilterable-float" });
    resources.push({ uniform: "u_prd02IrradianceB", textureBinding: 15, dimension: "2d-array", sampleType: "unfilterable-float" });
  }
  if (mode.diffuseMap) resources.push({ uniform: "u_diffuseRoughnessTexture", samplerBinding: 16, textureBinding: 17, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.bumpMap) resources.push({ uniform: "u_bumpTexture", samplerBinding: 18, textureBinding: 19, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.normalMap) resources.push({ uniform: "u_normalMap", samplerBinding: 20, textureBinding: 21, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.metalRoughMap) resources.push({ uniform: "u_metallicRoughnessMap", samplerBinding: 22, textureBinding: 23, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.occlusionMap) resources.push({ uniform: "u_occlusionMap", samplerBinding: 24, textureBinding: 25, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.emissiveMap) resources.push({ uniform: "u_emissiveMap", samplerBinding: 26, textureBinding: 27, dimension: "2d", sampleType: "filterable-float" });
  if (mode.lobeMaps.specular !== undefined) resources.push({ uniform: "u_specularTexture", samplerBinding: 28, textureBinding: 29, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.lobeMaps.specularColor !== undefined) resources.push({ uniform: "u_specularColorTexture", samplerBinding: 30, textureBinding: 31, dimension: "2d", sampleType: "filterable-float" });
  if (mode.lobeMaps.sheenColor !== undefined) resources.push({ uniform: "u_sheenColorTexture", samplerBinding: 32, textureBinding: 33, dimension: "2d", sampleType: "filterable-float" });
  if (mode.lobeMaps.sheenRoughness !== undefined) resources.push({ uniform: "u_sheenRoughnessTexture", samplerBinding: 34, textureBinding: 35, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.lobeMaps.clearcoat !== undefined) resources.push({ uniform: "u_clearcoatTexture", samplerBinding: 36, textureBinding: 37, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.lobeMaps.clearcoatRoughness !== undefined) resources.push({ uniform: "u_clearcoatRoughnessTexture", samplerBinding: 38, textureBinding: 39, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.lobeMaps.clearcoatNormal !== undefined) resources.push({ uniform: "u_clearcoatNormalTexture", samplerBinding: 40, textureBinding: 41, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.lobeMaps.iridescence !== undefined) resources.push({ uniform: "u_iridescenceTexture", samplerBinding: 42, textureBinding: 43, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.lobeMaps.iridescenceThickness !== undefined) resources.push({ uniform: "u_iridescenceThicknessTexture", samplerBinding: 44, textureBinding: 45, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.lobeMaps.anisotropy !== undefined) resources.push({ uniform: "u_anisotropyTexture", samplerBinding: 46, textureBinding: 47, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.skinning) resources.push({ uniform: "u_boneTexture", textureBinding: 48, dimension: "2d", sampleType: "unfilterable-float" });
  if (mode.morph) resources.push({ uniform: "u_morphTexture", textureBinding: 49, dimension: "2d-array", sampleType: "unfilterable-float" });
  if (f.shadows.cascades && directEnabled) resources.push({ uniform: "u_shadowMapTexture", samplerBinding: 50, textureBinding: 51, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (f.shadows.localShadows && directEnabled) resources.push({ uniform: "u_localShadowAtlas", samplerBinding: 52, textureBinding: 53, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.transmission) resources.push({ uniform: "a3d_prd04_transmissionSampler", samplerBinding: 54, textureBinding: 55, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.lobeMaps.transmission !== undefined) resources.push({ uniform: "u_transmissionTexture", samplerBinding: 59, textureBinding: 60, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.lobeMaps.volumeThickness !== undefined) resources.push({ uniform: "u_volumeThicknessTexture", samplerBinding: 61, textureBinding: 62, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (f.shadows.contact) resources.push({ uniform: "u_contactShadowMask", samplerBinding: 63, textureBinding: 64, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (pointShadow) resources.push({ uniform: "u_pointShadowMapTexture", samplerBinding: 65, textureBinding: 66, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (spotShadow) resources.push({ uniform: "u_spotShadowMapTexture", samplerBinding: 67, textureBinding: 68, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.lobeMaps.diffuseTransmission !== undefined) resources.push({ uniform: "u_diffuseTransmissionTexture", samplerBinding: 69, textureBinding: 70, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
  if (mode.lobeMaps.diffuseTransmissionColor !== undefined) resources.push({ uniform: "u_diffuseTransmissionColorTexture", samplerBinding: 71, textureBinding: 72, dimension: "2d", sampleType: "filterable-float" });
  if (mode.advanced === "probe") resources.push({ uniform: "u_a3dNativeProbeTexture", textureBinding: 56, dimension: "2d", sampleType: "unfilterable-float" });
  if (mode.advanced === "voxel") resources.push({ uniform: "u_a3dNativeVoxelTexture", textureBinding: 57, dimension: "2d", sampleType: "unfilterable-float" });
  if (mode.advanced === "lightmap") resources.push({ uniform: "u_a3dNativeLightmapTexture", textureBinding: 58, dimension: "2d", sampleType: "unfilterable-float" });
  if (f.lights.clustered) {
    resources.push({ uniform: "u_clusterLightData", textureBinding: 73, dimension: "2d", sampleType: "unfilterable-float" });
    resources.push({ uniform: "u_clusterLightIndices", textureBinding: 74, dimension: "2d", sampleType: "unfilterable-float" });
  }
  if (photometricProfile) resources.push({ uniform: "u_a3dPhotometricAtlas", textureBinding: 75, dimension: "2d", sampleType: "unfilterable-float" });
  if (mode.wind) resources.push({ uniform: "u_windNoise", samplerBinding: 76, textureBinding: 77, dimension: "2d", sampleType: "filterable-float" });
  if (resources.filter(resource => resource.uniform !== "u_boneTexture" && resource.uniform !== "u_morphTexture" && resource.uniform !== "u_windNoise").length > 16) unsupported("resources", "more than 16 sampled textures in one generated PBR fragment stage");
  const textureDecls = resources.filter(resource => resource.uniform !== "u_boneTexture" && resource.uniform !== "u_morphTexture" && resource.uniform !== "u_windNoise").map((r) => !("samplerBinding" in r)
    ? `@group(0) @binding(${r.textureBinding}) var ${r.uniform}Texture: texture_${r.dimension === "2d-array" ? "2d_array" : "2d"}<f32>;`
    : `@group(0) @binding(${r.samplerBinding}) var ${r.uniform}Sampler: sampler;\n@group(0) @binding(${r.textureBinding}) var ${r.uniform}Texture: texture_${r.dimension === "cube" ? "cube" : "2d"}<f32>;`).join("\n");
  const lobeProcedural = mode.procedural && !mode.ibl && (mode.sampled === "none" || !descriptor.lighting.compilerLightingConjunction);
  const lobeGlobal = mode.ibl
    ? "textureSampleLevel(u_envSpecularTexture, u_envSpecularSampler, generatedRotateY(direction, material.probe.y), (max(material.probe.x, 1.0) - 1.0) * roughness * (2.0 - roughness)).rgb * material.probe.w"
    : mode.sampled !== "none" ? "generatedSampleEnvironment(direction, roughness * 8.0)" : "vec3f(0.0)";
  const lobeRadiance = mode.coat || mode.iridescence || mode.anisotropy ? `fn generatedLobeRadiance(world: vec3f, direction: vec3f, roughness: f32) -> vec3f {
  let lobeGlobalRadiance = ${lobeGlobal}${lobeProcedural ? " + generatedProceduralSpecular(direction, roughness)" : ""};
  return ${mode.localProbe ? "lobeGlobalRadiance * material.localWeights.z + generatedLocalProbeRadiance(world, direction, roughness) * material.controls.y" : "lobeGlobalRadiance"};
}` : "";
  const skinningWgsl = mode.skinning ? `@group(0) @binding(48) var u_boneTextureTexture: texture_2d<f32>;
fn generatedBone(joint: f32) -> mat4x4f {
  let width = i32(material.bone.x + 0.5);
  let index = i32(joint + 0.5) * 4;
  let y = index / width; let x = index - y * width;
  return mat4x4f(textureLoad(u_boneTextureTexture, vec2i(x, y), 0), textureLoad(u_boneTextureTexture, vec2i(x + 1, y), 0),
    textureLoad(u_boneTextureTexture, vec2i(x + 2, y), 0), textureLoad(u_boneTextureTexture, vec2i(x + 3, y), 0));
}
fn generatedSkin4(joints: vec4f, weights: vec4f) -> mat4x4f {
  return generatedBone(joints.x) * weights.x + generatedBone(joints.y) * weights.y
    + generatedBone(joints.z) * weights.z + generatedBone(joints.w) * weights.w;
}` : "";
  const morphWgsl = mode.morph ? `@group(0) @binding(49) var u_morphTextureTexture: texture_2d_array<f32>;
fn generatedMorphFetch(vertex: u32, target: i32, attribute: i32) -> vec3f {
  let width = i32(material.morph.y + 0.5);
  let index = i32(vertex) * i32(material.morph.x + 0.5) + attribute;
  let y = index / width; let x = index - y * width;
  return textureLoad(u_morphTextureTexture, vec2i(x, y), target, 0).xyz;
}` : "";
  const vertex = `${MATERIAL_STRUCT}\n${FRAME_STRUCT}\n${ZERO_TO_ONE_PROJECTION_WGSL}\n${skinningWgsl}\n${morphWgsl}\n${mode.wind ? GENERATED_WIND_WGSL : ""}
struct VertexOutput { @builtin(position) position: vec4f, @location(0) worldPosition: vec3f, @location(1) normal: vec3f, ${mode.uv0 ? "@location(2) uv: vec2f," : ""} ${mode.uv1 ? "@location(3) uv1: vec2f," : ""} ${mode.anisotropy || mode.tangent ? "@location(4) tangent: vec4f," : ""} ${instanceStream ? "@location(5) instanceColor: vec4f," : ""} ${instanceVolumeVaryings} ${f.vertexColors ? "@location(9) color: vec4f," : ""} ${clipping ? "@location(10) clipLocal: vec3f," : ""} };
fn generatedWorldNormal(normal: vec3f, transform: mat4x4f) -> vec3f {
  let a = transform[0].xyz; let b = transform[1].xyz; let c = transform[2].xyz;
  let crossBC = cross(b, c); let det = dot(a, crossBC);
  var localNormal = normal;
  if (abs(det) > 0.00000001) {
    localNormal = (mat3x3f(crossBC, cross(c, a), cross(a, b)) * normal) / det;
  }
  let worldNormal = (material.normal * vec4f(localNormal, 0.0)).xyz;
  let lengthSquared = dot(worldNormal, worldNormal);
  if (lengthSquared > 0.000000000001) { return worldNormal * inverseSqrt(lengthSquared); }
  return vec3f(0.0, 0.0, 1.0);
}
@vertex fn vs_main(@location(0) position: vec3f, @location(1) normal: vec3f${mode.uv0 ? ", @location(2) uv: vec2f" : ""}${mode.tangent ? ", @location(3) tangent: vec4f" : ""}${f.vertexColors ? ", @location(4) color: vec4f" : ""}${mode.skinning ? ", @location(5) joints: vec4f, @location(6) weights: vec4f" : ""}${mode.uv1 ? ", @location(7) uv1: vec2f" : ""}${mode.skinning === 8 ? ", @location(8) joints1: vec4f, @location(9) weights1: vec4f" : ""}${f.instancing ? `, @location(${instanceLocation}) instance0: vec4f, @location(${instanceLocation + 1}) instance1: vec4f, @location(${instanceLocation + 2}) instance2: vec4f, @location(${instanceLocation + 3}) instance3: vec4f` : ""}${instanceStream ? `, @location(${instanceLocation + 4}) instanceColor: vec4f` : ""}${mode.morph ? ", @builtin(vertex_index) vertexIndex: u32" : ""}) -> VertexOutput {
  var output: VertexOutput;
  var deformedPosition = position; var deformedNormal = normal;
  ${mode.tangent ? "var deformedTangent = tangent;" : ""}
  ${mode.morph ? `for (var i = 0u; i < ${mode.morph.maxActive}u; i += 1u) {
    if (i >= u32(material.morph.z)) { break; }
    let target = i32(material.morphIndices[i / 4u][i % 4u] + 0.5);
    let weight = material.morphWeights[i / 4u][i % 4u];
    deformedPosition += generatedMorphFetch(vertexIndex, target, 0) * weight;
    ${mode.morph.normals ? "deformedNormal += generatedMorphFetch(vertexIndex, target, 1) * weight;" : ""}
    ${mode.morph.tangents ? "deformedTangent = vec4f(deformedTangent.xyz + generatedMorphFetch(vertexIndex, target, 2) * weight, deformedTangent.w);" : ""}
  }` : ""}
  ${mode.skinning ? `let weightSum = dot(weights, vec4f(1.0))${mode.skinning === 8 ? " + dot(weights1, vec4f(1.0))" : ""};
  if (weightSum > 0.0001) {
    let skin = generatedSkin4(vec4f(joints), weights)${mode.skinning === 8 ? " + generatedSkin4(vec4f(joints1), weights1)" : ""};
    deformedPosition = (skin * vec4f(deformedPosition, 1.0)).xyz;
    deformedNormal = (skin * vec4f(deformedNormal, 0.0)).xyz;
    ${mode.tangent ? "deformedTangent = vec4f((skin * vec4f(deformedTangent.xyz, 0.0)).xyz, deformedTangent.w);" : ""}
  }` : ""}
  ${mode.wind ? `deformedPosition += generatedWindOffset(deformedPosition, ${f.instancing ? "instance3.xyz" : "vec3f(0.0)"}, ${f.vertexColors ? "color" : "vec4f(1.0, 1.0, 0.5, 1.0)"}, max(material.windParams.x, 0.01));` : ""}
  let instanceMatrix = ${f.instancing ? "mat4x4f(instance0, instance1, instance2, instance3)" : "mat4x4f(vec4f(1.0, 0.0, 0.0, 0.0), vec4f(0.0, 1.0, 0.0, 0.0), vec4f(0.0, 0.0, 1.0, 0.0), vec4f(0.0, 0.0, 0.0, 1.0))"};
  let localTransform = instanceMatrix * material.geometry;
  let world = material.model * localTransform * vec4f(deformedPosition, 1.0);
  let clip = frame.viewProjection * world;
  output.position = vec4f(clip.xy, ${rasterClipDepthWgsl("clip")}, clip.w);
  output.worldPosition = world.xyz;
  ${clipping ? "output.clipLocal = (material.geometry * vec4f(deformedPosition, 1.0)).xyz;" : ""}
  output.normal = generatedWorldNormal(deformedNormal, localTransform);
  ${mode.uv0 ? "output.uv = uv;" : ""} ${mode.uv1 ? "output.uv1 = uv1;" : ""}
  ${f.vertexColors ? "output.color = color;" : ""}
  ${instanceStream ? "output.instanceColor = instanceColor;" : ""}
  ${instanceVolume ? "let volumeWorld = material.model * localTransform; output.volume0 = volumeWorld[0].xyz; output.volume1 = volumeWorld[1].xyz; output.volume2 = volumeWorld[2].xyz;" : ""}
  ${mode.anisotropy || mode.tangent ? mode.tangent ? `let tangentMatrix = material.model * localTransform;
  let tangentWorld = (tangentMatrix * vec4f(deformedTangent.xyz, 0.0)).xyz;
  let tangentDet = determinant(mat3x3f(tangentMatrix[0].xyz, tangentMatrix[1].xyz, tangentMatrix[2].xyz));
  output.tangent = vec4f(0.0);
  if (dot(tangentWorld, tangentWorld) > 0.000000000001) { output.tangent = vec4f(normalize(tangentWorld), deformedTangent.w * select(1.0, -1.0, tangentDet < 0.0)); }` : "output.tangent = vec4f(0.0);" : ""}
  return output;
}`;
  const normal = f.doubleSided ? "select(-interpolatedNormal, interpolatedNormal, frontFacing)" : "interpolatedNormal";
  // WP-04: authored TANGENT frames negate on back faces (materials/authoredTangent.ts).
  const faceDirection = f.doubleSided ? "select(-1.0, 1.0, frontFacing)" : "1.0";
  // Preview sheen layers over everything beneath it: per-light lobe deltas use
  // the symmetric per-light compensation, view-only terms the view compensation.
  const previewSheen = mode.sheen && independentPhysicalPreview;
  const sheenSubstrate = previewSheen ? " * sheenDirectCompensation" : "";
  const sheenView = previewSheen ? " * sheenViewCompensation" : "";
  // Diffuse irradiance E (diffuse = E * albedo / pi) reaching the surface, so
  // the preview sheen sees the same environment, probe, volume or lightmap
  // lighting as the substrate instead of the uniform ambient term alone.
  const sheenIrradiance = mode.ibl ? "irradiance + material.ambientIrradiance.rgb * A3D_PHYSICAL_PI + hemi"
    : mode.sampled !== "none" || mode.procedural ? "material.ambient.rgb * material.ambient.a + irradiance"
    : mode.localProbe || (mode.volume || mode.advanced === "probe" || mode.advanced === "voxel") ? "material.ambient.rgb * material.ambient.a + localIrradiance"
    : "material.ambient.rgb * material.ambient.a";
  const authoredFrame = mode.tangent ? `let authoredTangentPresent = dot(input.tangent.xyz, input.tangent.xyz) > 0.0;
  let authoredFrame = a3dAuthoredTangentFrame(geometryNormal, input.tangent, ${faceDirection});` : "";
  const uv = (slot: "baseColor" | "normal" | "metallicRoughness" | "occlusion" | "emissive" | "diffuseRoughness" | "bump") => f.maps[slot]?.uvSet === 1 ? "input.uv1" : "input.uv";
  const lobeUv = (slot: LobeMapSlot) => mode.lobeMaps[slot] === 1 ? "input.uv1" : "input.uv";
  const fraction = mode.fraction && f.alphaMode !== "blend" && !mode.alphaToCoverage;
  const advancedDiffuse = mode.advanced === "probe" || mode.advanced === "voxel";
  const localDiffuse = mode.volume || advancedDiffuse;
  const irradiance = (global: string, normalDirection = "n"): string => mode.volume ? `generatedVolumeIrradiance(input.worldPosition, ${normalDirection}, ${global})`
    : advancedDiffuse ? `generatedAdvancedIrradiance(input.worldPosition, ${normalDirection}, ${global})` : global;
  const backIndirect = mode.ibl ? `
  let diffuseBackIrradiance = ${irradiance("generatedProbeIrradiance(-n)", "-n")};
  let diffuseBackHemi = mix(material.hemiGround.rgb, material.hemiSky.rgb, dot(-n, material.hemiDirection.xyz) * 0.5 + 0.5);
  var diffuseBackMaterial = pbr; diffuseBackMaterial.baseColor = diffuseTransmissionColor * diffuseTransmissionFactor;
  let diffuseBackResult = a3dPhysicalIndirect(dot(n, view), vec3f(0.0), diffuseBackIrradiance, diffuseBackMaterial, dfg);
  diffuseTransmissionIndirect = diffuseBackResult.diffuse + (material.ambientIrradiance.rgb + diffuseBackHemi / A3D_PHYSICAL_PI) * diffuseTransmissionColor * diffuseTransmissionWeight;`
    : mode.sampled !== "none" || mode.procedural || mode.localProbe || localDiffuse ? `
  let diffuseBackIrradiance = ${irradiance(mode.sampled !== "none" ? "A3D_PHYSICAL_PI * generatedSampleEnvironment(-n, 8.0)" : mode.procedural ? "A3D_PHYSICAL_PI * generatedProceduralDiffuse(-n)" : "vec3f(0.0)", "-n")};
  var diffuseBackMaterial = pbr; diffuseBackMaterial.baseColor = diffuseTransmissionColor * diffuseTransmissionFactor;
  diffuseTransmissionIndirect += a3dPhysicalIndirect(dot(n, view), vec3f(0.0), diffuseBackIrradiance, diffuseBackMaterial, dfg).diffuse;` : "";
  const advancedHelper = mode.advanced === "probe" ? `${NATIVE_PROBE_WGSL}
fn generatedAdvancedIrradiance(world: vec3f, normal: vec3f, global: vec3f) -> vec3f {
  let position = select(world, clamp(world, material.advancedMin.xyz, material.advancedMax.xyz), material.advancedIntensity.y > 0.5);
  let value = a3dNativeProbeIrradiance(u_a3dNativeProbeTextureTexture, position, normal, material.advancedMin.xyz, material.advancedMax.xyz, vec3i(material.advancedDimensions.xyz));
  return mix(global, value.rgb * material.advancedIntensity.x, value.a);
}` : mode.advanced === "voxel" ? `${NATIVE_VOXEL_WGSL}
fn generatedAdvancedIrradiance(world: vec3f, normal: vec3f, global: vec3f) -> vec3f {
  let value = a3dNativeVoxelIrradiance(u_a3dNativeVoxelTextureTexture, world, normal, material.advancedMin.xyz, material.advancedMax.xyz,
    vec3i(material.advancedDimensions.xyz), material.advancedLevels, i32(material.advancedConfig.x), i32(material.advancedConfig.y), i32(material.advancedConfig.z), material.advancedConfig.w);
  return mix(global, value.rgb * material.advancedIntensity.x, value.a);
}` : mode.advanced === "lightmap" ? NATIVE_LIGHTMAP_WGSL : "";
  const burley = f.diffuseModel === "burley" && directEnabled ? `fn generatedBurley(n: vec3f, view: vec3f, light: vec3f, roughness: f32) -> f32 {
  let sum = view + light; var halfVector = n;
  if (dot(sum, sum) > 0.000001) { halfVector = normalize(sum); }
  let lh = clamp(dot(light, halfVector), 0.0, 1.0);
  let grazing = 0.5 + 2.0 * lh * lh * clamp(roughness, 0.0, 1.0);
  let lightResponse = 1.0 + (grazing - 1.0) * a3dPhysicalPow5(1.0 - clamp(dot(n, light), 0.0, 1.0));
  let viewResponse = 1.0 + (grazing - 1.0) * a3dPhysicalPow5(1.0 - clamp(dot(n, view), 0.0, 1.0));
  return clamp(lightResponse * viewResponse, 0.0, 1.0);
}` : "";
  // WebGPU framebuffer Y grows down, so its world-position dpdy reverses the
  // GLSL derivative. Swap the cross operands to retain the same flat normal.
  const fragment = `${MATERIAL_STRUCT}\n${FRAME_STRUCT}\n${textureDecls}\n${PHYSICAL_LIGHTING_WGSL}
${packedLoopColor ? PACKED_LOOP_PHYSICAL_WGSL : ""}
${burley}
${mode.sheen ? independentPhysicalPreview ? A3D_PRD04_SHEEN_FAST_WGSL : SHEEN_WGSL : ""}
${photometricProfile ? PHOTOMETRIC_PROFILE_WGSL : ""}
${mode.wetness ? PRD07_WETNESS_WGSL : ""}
${mode.prd07Fog ? prd07FogWgsl() : ""}
${directEnabled ? DIRECT_LIGHT_WGSL : ""}
${f.lights.rect ? RECT_LIGHT_WGSL : ""}
${f.shadows.cascades && directEnabled ? FORWARD_SHADOW_WGSL : ""}
${pointShadow ? standaloneShadowWgsl("point") : ""}
${spotShadow ? standaloneShadowWgsl("spot") : ""}
${f.shadows.localShadows && directEnabled ? LOCAL_SHADOW_WGSL : ""}
${independentPhysicalPreview && (mode.coat || mode.anisotropy) ? A3D_PRD04_BSDF_LOBES_COMMON_WGSL : ""}
${mode.coat ? independentPhysicalPreview ? A3D_PRD04_CLEARCOAT_WGSL : CLEARCOAT_WGSL : ""}
${mode.iridescence ? IRIDESCENCE_EVAL_WGSL : ""}
${mode.anisotropy ? independentPhysicalPreview ? A3D_PRD04_ANISOTROPY_WGSL : ANISOTROPY_WGSL : ""}
${mode.tangent ? AUTHORED_TANGENT_WGSL : ""}
${mode.ibl || mode.sampled === "cube" ? ROTATE_Y_WGSL : ""}
${mode.ibl ? PROBE_WGSL : ""}
${mode.procedural && !mode.ibl ? PROCEDURAL_WGSL : ""}
${mode.localProbe ? LOCAL_PROBE_WGSL : ""}
${mode.volume ? IRRADIANCE_VOLUME_WGSL : ""}
${advancedHelper}
${mode.transmission ? TRANSMISSION_WGSL : ""}
${mode.sampled !== "none" ? sampledEnvironmentWgsl(mode.sampled) : ""}
${lobeRadiance}
${clipping ? CLIPPING_WGSL : ""}
${logDepth ? LOG_DEPTH_WGSL : ""}
${mode.uv0 || mode.uv1 ? MAP_UV_WGSL : ""}
${mode.outputSrgb ? OUTPUT_WGSL : ""}
struct FragmentInput { @builtin(position) position: vec4f, @location(0) worldPosition: vec3f, @location(1) normal: vec3f, ${mode.uv0 ? "@location(2) uv: vec2f," : ""} ${mode.uv1 ? "@location(3) uv1: vec2f," : ""} ${mode.anisotropy || mode.tangent ? "@location(4) tangent: vec4f," : ""} ${instanceStream ? "@location(5) instanceColor: vec4f," : ""} ${instanceVolumeVaryings} ${f.vertexColors ? "@location(9) color: vec4f," : ""} ${clipping ? "@location(10) clipLocal: vec3f," : ""} };
${writesDepthCoverage ? "struct GeneratedDepthCoverageOutput { @location(0) color: vec4f, @location(1) depthCoverage: vec4f, };" : ""}
${logDepth && !writesDepthCoverage ? "struct GeneratedLogDepthOutput { @location(0) color: vec4f, @builtin(frag_depth) depth: f32, };" : ""}
@fragment fn fs_main(input: FragmentInput, @builtin(front_facing) frontFacing: bool) -> ${writesDepthCoverage ? "GeneratedDepthCoverageOutput" : logDepth ? "GeneratedLogDepthOutput" : "@location(0) vec4f"} {
  let interpolatedNormal = ${f.flatShading ? "normalize(cross(dpdy(input.worldPosition), dpdx(input.worldPosition)))" : "normalize(input.normal)"};
  let geometryNormal = ${normal};
  var n = geometryNormal;
  let view = normalize(frame.cameraPositionNear.xyz - input.worldPosition);
  ${f.specularAntialiasing ? "let grad = max(abs(dpdx(geometryNormal)), abs(dpdy(geometryNormal))); let aa = max(grad.x, max(grad.y, grad.z));" : "let aa = 0.0;"}
  ${mode.coat ? "let coatNormalDx = dpdx(geometryNormal); let coatNormalDy = dpdy(geometryNormal); let coatGeometryRoughness = min(sqrt(max(dot(coatNormalDx, coatNormalDx), dot(coatNormalDy, coatNormalDy))), 1.0);" : ""}
  ${authoredFrame}
  ${mode.normalMap ? `let normalUv = generatedMapUv(${uv("normal")}, material.normalUv, material.normalControls.x);
  let normalTexel = textureSample(u_normalMapTexture, u_normalMapSampler, normalUv).xyz * 2.0 - vec3f(1.0);
  let positionDx = dpdx(input.worldPosition); let positionDy = dpdy(input.worldPosition);
  let uvDx = dpdx(normalUv); let uvDy = dpdy(normalUv); let uvDeterminant = uvDx.x * uvDy.y - uvDx.y * uvDy.x;
  let tangent = (positionDx * uvDy.y - positionDy * uvDx.y) * sign(uvDeterminant);
  let bitangent = (positionDy * uvDx.x - positionDx * uvDy.x) * sign(uvDeterminant);
  if (uvDeterminant != 0.0 && dot(tangent, tangent) > 0.0 && dot(bitangent, bitangent) > 0.0) {
    let mapped = normalize(tangent) * normalTexel.x * material.normalControls.y + normalize(bitangent) * normalTexel.y * material.normalControls.y + geometryNormal * normalTexel.z;
    if (dot(mapped, mapped) > 0.000000000001) { n = normalize(mapped); }
  }
  ${mode.tangent ? "if (authoredTangentPresent) { n = a3dAuthoredMapNormal(authoredFrame, normalTexel, material.normalControls.y); }" : ""}` : ""}
  ${mode.bumpMap ? `let bumpUv = generatedMapUv(${uv("bump")}, material.bumpUv, material.mapControls.z);
  let height = textureSample(u_bumpTextureTexture, u_bumpTextureSampler, bumpUv).r * material.mapControls.w * clamp(material.detailControls.y, 0.0, 1.0);
  let dx = dpdx(input.worldPosition); let dy = dpdy(input.worldPosition); let dhdx = dpdx(height); let dhdy = dpdy(height);
  let dualX = cross(dy, geometryNormal); let dualY = cross(geometryNormal, dx); let bumpDeterminant = dot(dx, dualX);
  if (abs(bumpDeterminant) >= 0.00000001) {
    let perturbed = n - (dualX * dhdx + dualY * dhdy) / bumpDeterminant;
    let lengthSquared = dot(perturbed, perturbed);
    if (lengthSquared > 0.000000000001) { n = perturbed * inverseSqrt(lengthSquared); }
  }` : ""}
  ${mode.diffuseMap ? `let diffuseUv = generatedMapUv(${uv("diffuseRoughness")}, material.diffuseUv, material.mapControls.y);
  let diffuseSample = clamp(textureSample(u_diffuseRoughnessTextureTexture, u_diffuseRoughnessTextureSampler, diffuseUv).r, 0.0, 1.0);` : ""}
  ${mode.metalRoughMap ? `let metalRoughSample = textureSample(u_metallicRoughnessMapTexture, u_metallicRoughnessMapSampler, generatedMapUv(${uv("metallicRoughness")}, material.metalRoughUv, material.coreMapControls.x)).bg;` : ""}
  ${mode.occlusionMap ? `let occlusionSample = textureSample(u_occlusionMapTexture, u_occlusionMapSampler, generatedMapUv(${uv("occlusion")}, material.occlusionUv, material.coreMapControls.y)).r;` : ""}
  ${mode.emissiveMap ? `let emissiveSample = textureSample(u_emissiveMapTexture, u_emissiveMapSampler, generatedMapUv(${uv("emissive")}, material.emissiveUv, material.coreMapControls.z)).rgb;` : ""}
  ${mode.lobeMaps.specular !== undefined ? `let specularSample = textureSample(u_specularTextureTexture, u_specularTextureSampler, (material.specularTransform * vec3f(${lobeUv("specular")}, 1.0)).xy).a;` : ""}
  ${mode.lobeMaps.specularColor !== undefined ? `let specularColorSample = textureSample(u_specularColorTextureTexture, u_specularColorTextureSampler, (material.specularColorTransform * vec3f(${lobeUv("specularColor")}, 1.0)).xy).rgb;` : ""}
  ${mode.lobeMaps.sheenColor !== undefined ? `let sheenColorSample = textureSample(u_sheenColorTextureTexture, u_sheenColorTextureSampler, (material.sheenColorTransform * vec3f(${lobeUv("sheenColor")}, 1.0)).xy).rgb;` : ""}
  ${mode.lobeMaps.sheenRoughness !== undefined ? `let sheenRoughnessSample = textureSample(u_sheenRoughnessTextureTexture, u_sheenRoughnessTextureSampler, (material.sheenRoughnessTransform * vec3f(${lobeUv("sheenRoughness")}, 1.0)).xy).a;` : ""}
  ${mode.lobeMaps.transmission !== undefined ? `let transmissionSample = textureSample(u_transmissionTextureTexture, u_transmissionTextureSampler, (material.transmissionTransform * vec3f(${lobeUv("transmission")}, 1.0)).xy).r;` : ""}
  ${mode.lobeMaps.volumeThickness !== undefined ? `let thicknessSample = textureSample(u_volumeThicknessTextureTexture, u_volumeThicknessTextureSampler, (material.thicknessTransform * vec3f(${lobeUv("volumeThickness")}, 1.0)).xy).g;` : ""}
  ${mode.lobeMaps.diffuseTransmission !== undefined ? `let diffuseTransmissionSample = textureSample(u_diffuseTransmissionTextureTexture, u_diffuseTransmissionTextureSampler, (material.diffuseTransmissionTransform * vec3f(${lobeUv("diffuseTransmission")}, 1.0)).xy).a;` : ""}
  ${mode.lobeMaps.diffuseTransmissionColor !== undefined ? `let diffuseTransmissionColorSample = textureSample(u_diffuseTransmissionColorTextureTexture, u_diffuseTransmissionColorTextureSampler, (material.diffuseTransmissionColorTransform * vec3f(${lobeUv("diffuseTransmissionColor")}, 1.0)).xy).rgb;` : ""}
  ${mode.lobeMaps.clearcoat !== undefined ? `let coatSample = textureSample(u_clearcoatTextureTexture, u_clearcoatTextureSampler, (material.coatTransform * vec3f(${lobeUv("clearcoat")}, 1.0)).xy).r;` : ""}
  ${mode.lobeMaps.clearcoatRoughness !== undefined ? `let coatRoughnessSample = textureSample(u_clearcoatRoughnessTextureTexture, u_clearcoatRoughnessTextureSampler, (material.coatRoughnessTransform * vec3f(${lobeUv("clearcoatRoughness")}, 1.0)).xy).g;` : ""}
  ${mode.lobeMaps.clearcoatNormal !== undefined ? `let coatUv = (material.coatNormalTransform * vec3f(${lobeUv("clearcoatNormal")}, 1.0)).xy;
  let coatNormalTexel = textureSample(u_clearcoatNormalTextureTexture, u_clearcoatNormalTextureSampler, coatUv).xyz * 2.0 - vec3f(1.0);
  let coatPositionDx = dpdx(input.worldPosition); let coatPositionDy = dpdy(input.worldPosition);
  let coatUvDx = dpdx(coatUv); let coatUvDy = dpdy(coatUv); let coatUvDet = coatUvDx.x * coatUvDy.y - coatUvDx.y * coatUvDy.x;` : ""}
  ${mode.lobeMaps.iridescence !== undefined ? `let iridescenceSample = textureSample(u_iridescenceTextureTexture, u_iridescenceTextureSampler, (material.iridescenceTransform * vec3f(${lobeUv("iridescence")}, 1.0)).xy).r;` : ""}
  ${mode.lobeMaps.iridescenceThickness !== undefined ? `let iridescenceThicknessSample = textureSample(u_iridescenceThicknessTextureTexture, u_iridescenceThicknessTextureSampler, (material.iridescenceThicknessTransform * vec3f(${lobeUv("iridescenceThickness")}, 1.0)).xy).g;` : ""}
  ${mode.lobeMaps.anisotropy !== undefined ? `let anisotropyUv = (material.anisotropyTransform * vec3f(${lobeUv("anisotropy")}, 1.0)).xy;
  let anisotropySample = textureSample(u_anisotropyTextureTexture, u_anisotropyTextureSampler, anisotropyUv);
  let anPositionDx = dpdx(input.worldPosition); let anPositionDy = dpdy(input.worldPosition);
  let anUvDx = dpdx(anisotropyUv); let anUvDy = dpdy(anisotropyUv); let anUvDet = anUvDx.x * anUvDy.y - anUvDx.y * anUvDy.x;` : ""}
  let ${mode.wetness ? "dryBase" : "base"} = material.baseColor${f.vertexColors ? " * input.color" : ""}${mode.baseMap ? ` * textureSample(u_baseColorMapTexture, u_baseColorMapSampler, generatedMapUv(${uv("baseColor")}, material.baseUv, material.mapControls.x))` : ""}${f.instancing?.color ? " * input.instanceColor" : ""}${packedLoopColor ? " * vec4f(1.0, 1.0, 1.0, material.packedLoopColor.a)" : ""};
  ${mode.alphaToCoverage ? GENERATED_ALPHA_TO_COVERAGE_WGSL(`${mode.wetness ? "dryBase" : "base"}.a`, "material.controls.x") : f.alphaMode === "mask" ? `if (${mode.wetness ? "dryBase" : "base"}.a < material.controls.x) { discard; }` : ""}
  ${mode.wetness ? "let base = vec4f(a3dWetAlbedo(max(dryBase.rgb, vec3f(0.0)), 1.0), dryBase.a);" : ""}
  let metallic = material.surface.x${mode.metalRoughMap ? " * metalRoughSample.x" : ""};
  let ${mode.wetness ? "dryRoughness" : "roughness"} = clamp(material.surface.y${mode.metalRoughMap ? " * metalRoughSample.y" : ""} + aa, 0.0525, 1.0);
  ${mode.wetness ? "let roughness = clamp(a3dWetRoughness(dryRoughness), 0.0525, 1.0);" : ""}
  var pbr: AuraPhysicalMaterial;
  pbr.baseColor = base.rgb; pbr.metalness = metallic; pbr.roughness = roughness;
  pbr.ior = material.surface.z; pbr.specularIntensity = material.surface.w${mode.lobeMaps.specular !== undefined ? " * specularSample" : ""}; pbr.specularColorFactor = ${mode.lobeMaps.specularColor !== undefined ? "clamp(material.specular.rgb * specularColorSample, vec3f(0.0), vec3f(1.0))" : "material.specular.rgb"};
  pbr.diffuseRoughness = material.direct.y${mode.diffuseMap ? " * mix(1.0, diffuseSample, clamp(material.detailControls.x, 0.0, 1.0))" : ""}; pbr.retroreflection = material.direct.z;
  ${mode.diffuseTransmission ? `let diffuseTransmissionFactor = clamp(clamp(material.diffuseTransmission.w, 0.0, 1.0)${mode.lobeMaps.diffuseTransmission !== undefined ? " * diffuseTransmissionSample" : ""}, 0.0, 1.0);
  let diffuseTransmissionColor = clamp(clamp(material.diffuseTransmission.rgb, vec3f(0.0), vec3f(1.0))${mode.lobeMaps.diffuseTransmissionColor !== undefined ? " * diffuseTransmissionColorSample" : ""}, vec3f(0.0), vec3f(1.0));
  let diffuseTransmissionWeight = diffuseTransmissionFactor * (1.0 - clamp(metallic, 0.0, 1.0));
  let diffuseIor = max(pbr.ior, 0.0001); let diffuseReflectance = (diffuseIor - 1.0) / (diffuseIor + 1.0);
  let diffuseF0 = clamp(diffuseReflectance * diffuseReflectance * max(pbr.specularColorFactor, vec3f(0.0)), vec3f(0.0), vec3f(1.0)) * clamp(pbr.specularIntensity, 0.0, 1.0);` : ""}
  ${mode.sheen ? `let sheenColor = clamp(material.sheen.rgb${mode.lobeMaps.sheenColor !== undefined ? " * sheenColorSample" : ""}, vec3f(0.0), vec3f(1.0));
  let sheenRoughness = clamp(material.sheen.a${mode.lobeMaps.sheenRoughness !== undefined ? " * sheenRoughnessSample" : ""}, 0.0001, 1.0);
  ${independentPhysicalPreview ? `let sheenExponent = a3dFastSheenExponent(sheenRoughness);
  let sheenOffset = a3dFastSheenOffset(sheenRoughness);
  let sheenViewCosine = dot(n, view);
  let sheenViewWeight = select(0.0, a3dFastSheenShape(sheenViewCosine, sheenExponent, sheenOffset), sheenViewCosine > 0.0);
  let sheenNormalization = a3dFastSheenNormalization(sheenExponent, sheenOffset);
  let sheenIntensity = max(sheenColor.x, max(sheenColor.y, sheenColor.z));
  let sheenViewCompensation = a3dFastSheenCompensation(sheenViewWeight, 0.0, sheenIntensity);` : ""}` : ""}
  ${mode.coat ? `let coatFactor = clamp(material.coat.x${mode.lobeMaps.clearcoat !== undefined ? " * coatSample" : ""}, 0.0, 1.0);
  let coatRoughness = clamp(max(material.coat.y${mode.lobeMaps.clearcoatRoughness !== undefined ? " * coatRoughnessSample" : ""}, 0.0525) + coatGeometryRoughness, 0.0525, 1.0);
  var coatNormal = geometryNormal;
  ${mode.lobeMaps.clearcoatNormal !== undefined ? `if (abs(coatUvDet) >= 0.00000001) {
    var tangent = (coatPositionDx * coatUvDy.y - coatPositionDy * coatUvDx.y) / coatUvDet;
    var bitangent = (coatPositionDy * coatUvDx.x - coatPositionDx * coatUvDy.x) / coatUvDet;
    tangent -= geometryNormal * dot(tangent, geometryNormal); bitangent -= geometryNormal * dot(bitangent, geometryNormal);
    if (dot(tangent, tangent) >= 0.000000000001 && dot(bitangent, bitangent) >= 0.000000000001) {
      let mapped = normalize(tangent) * coatNormalTexel.x * material.coat.z + normalize(bitangent) * coatNormalTexel.y * material.coat.z + geometryNormal * coatNormalTexel.z;
      if (dot(mapped, mapped) > 0.000000000001) { coatNormal = normalize(mapped); }
    }
  }
  ${mode.tangent ? "if (authoredTangentPresent) { coatNormal = a3dAuthoredMapNormal(authoredFrame, coatNormalTexel, material.coat.z); }" : ""}` : ""}` : ""}
  ${mode.iridescence ? `var iridescenceStrength = clamp(material.iridescence.x${mode.lobeMaps.iridescence !== undefined ? " * iridescenceSample" : ""}, 0.0, 1.0);
  let iridescenceThickness = mix(material.iridescence.z, material.iridescence.w, ${mode.lobeMaps.iridescenceThickness !== undefined ? "clamp(iridescenceThicknessSample, 0.0, 1.0)" : "1.0"});
  if (iridescenceThickness <= 0.0) { iridescenceStrength = 0.0; }
  let irMetallic = clamp(metallic, 0.0, 1.0); let irIor = max(pbr.ior, 0.0001);
  let irReflectance = (irIor - 1.0) / (irIor + 1.0);
  let irDielectricF0 = clamp(irReflectance * irReflectance * max(pbr.specularColorFactor, vec3f(0.0)), vec3f(0.0), vec3f(1.0)) * clamp(pbr.specularIntensity, 0.0, 1.0);
  let irBaseF0 = mix(irDielectricF0, clamp(base.rgb, vec3f(0.0), vec3f(1.0)), irMetallic);
  let irF90 = mix(clamp(pbr.specularIntensity, 0.0, 1.0), 1.0, irMetallic);
  let irNdotV = clamp(dot(n, view), 0.0, 1.0);
  var irFilmFresnel = vec3f(0.0); var irFilmF0 = vec3f(0.0);
  if (iridescenceStrength > 0.0) {
    let dielectricFilm = a3dPrd04EvalIridescence(1.0, max(material.iridescence.y, 0.0001), irNdotV, iridescenceThickness, irDielectricF0);
    let metallicFilm = a3dPrd04EvalIridescence(1.0, max(material.iridescence.y, 0.0001), irNdotV, iridescenceThickness, clamp(base.rgb, vec3f(0.0), vec3f(1.0)));
    irFilmFresnel = mix(dielectricFilm, metallicFilm, irMetallic);
    let grazing = min(a3dPhysicalPow5(1.0 - irNdotV), 0.9999);
    irFilmF0 = clamp((irFilmFresnel - vec3f(grazing)) / (1.0 - grazing), vec3f(0.0), vec3f(1.0));
  }` : ""}
  ${mode.anisotropy ? `var anTangent = vec3f(0.0); var anBitangent = vec3f(0.0);
  ${mode.tangent ? `if (authoredTangentPresent) { anTangent = authoredFrame[0]; anBitangent = authoredFrame[1]; }` : ""}
  ${mode.lobeMaps.anisotropy !== undefined ? `if (${mode.tangent ? "!authoredTangentPresent && " : ""}abs(anUvDet) > 0.00000001) {
    var tangent = (anPositionDx * anUvDy.y - anPositionDy * anUvDx.y) / anUvDet;
    var bitangent = (anPositionDy * anUvDx.x - anPositionDx * anUvDy.x) / anUvDet;
    tangent -= n * dot(tangent, n); bitangent -= n * dot(bitangent, n);
    if (dot(tangent, tangent) > 0.000000000001 && dot(bitangent, bitangent) > 0.000000000001) {
      anTangent = normalize(tangent); anBitangent = normalize(bitangent);
    }
  }` : ""}
  if (dot(anTangent, anTangent) < 0.000000000001) {
    let axis = select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(n.z) < 0.9);
    anTangent = normalize(cross(axis, n)); anBitangent = cross(n, anTangent);
  }
  ${independentPhysicalPreview ? `
  // Keep the handed frame orthonormal to the final shading normal, including
  // normal/bump maps. The independent initializer applies RG rotation and B
  // strength exactly once; it receives an untouched texture sample.
  let anProjectedT = anTangent - n * dot(n, anTangent);
  let anFallbackAxis = select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(n.z) < 0.9);
  var anFrameT = normalize(cross(anFallbackAxis, n));
  if (dot(anProjectedT, anProjectedT) > 0.000000000001) { anFrameT = normalize(anProjectedT); }
  let anHandedness = select(1.0, -1.0, dot(cross(n, anFrameT), anBitangent) < 0.0);
  let anFrameB = cross(n, anFrameT) * anHandedness;
  let anVector = vec2f(cos(material.anisotropy.y), sin(material.anisotropy.y)) * clamp(material.anisotropy.x, 0.0, 1.0);
  var anLobes: A3DPrd04Lobes;
  a3dPrd04AnisotropyInit(&anLobes, anVector, ${mode.lobeMaps.anisotropy !== undefined ? "anisotropySample, true" : "vec4f(1.0), false"}, anFrameT, anFrameB, roughness);
  let anStrength = anLobes.anisotropy; let anB = anLobes.anisotropyB;` : `
  var anVector = vec2f(cos(material.anisotropy.y), sin(material.anisotropy.y)) * material.anisotropy.x;
  ${mode.lobeMaps.anisotropy !== undefined ? `var mappedDirection = anisotropySample.rg * 2.0 - vec2f(1.0);
  if (length(mappedDirection) > 0.000001) { mappedDirection = normalize(mappedDirection); } else { mappedDirection = vec2f(1.0, 0.0); }
  anVector = vec2f(anVector.x * mappedDirection.x - anVector.y * mappedDirection.y, anVector.y * mappedDirection.x + anVector.x * mappedDirection.y) * anisotropySample.b;` : ""}
  let anLength = length(anVector); var anAxis = vec2f(1.0, 0.0);
  if (anLength > 0.000001) { anAxis = anVector / anLength; }
  let anStrength = clamp(anLength, 0.0, 1.0); let anAlphaT = mix(roughness * roughness, 1.0, anStrength * anStrength);
  let anT = anTangent * anAxis.x + anBitangent * anAxis.y; let anB = anBitangent * anAxis.x - anTangent * anAxis.y;`}
  let anIor = max(pbr.ior, 0.0001); let anReflectance = (anIor - 1.0) / (anIor + 1.0);
  let anDielectric = clamp(anReflectance * anReflectance * max(pbr.specularColorFactor, vec3f(0.0)), vec3f(0.0), vec3f(1.0)) * clamp(pbr.specularIntensity, 0.0, 1.0);
  let anF0 = mix(anDielectric, clamp(base.rgb, vec3f(0.0), vec3f(1.0)), clamp(metallic, 0.0, 1.0));
  let anF90 = mix(clamp(pbr.specularIntensity, 0.0, 1.0), 1.0, clamp(metallic, 0.0, 1.0));` : ""}
  let diffuseColor = clamp(base.rgb, vec3f(0.0), vec3f(1.0)) * (1.0 - clamp(metallic, 0.0, 1.0))${packedLoopColor ? " * material.packedLoopColor.rgb" : ""};
  var directDiffuse = vec3f(0.0); var directSpecular = vec3f(0.0);
  ${mode.diffuseTransmission ? "var diffuseTransmissionDirect = vec3f(0.0);" : ""}
  ${mode.sheen ? "var sheenDirect = vec3f(0.0);" : ""}
  ${mode.coat ? "var coatDirect = vec3f(0.0);" : ""}
  ${directEnabled ? `
  let viewDfg = textureSampleLevel(u_dfgLutTexture, u_dfgLutSampler, vec2f(roughness, clamp(dot(n, view), 0.0, 1.0)), 0.0).rg;
  ${f.lights.clustered ? `let clusterPixel = vec2f(input.position.x, material.clusterGrid.w - input.position.y);
  let clusterTile = vec2i(clamp(floor(clusterPixel / 64.0), vec2f(0.0), material.clusterGrid.xy - vec2f(1.0)));
  let cluster = clusterTile.y * i32(material.clusterGrid.x) + clusterTile.x;
  let clusterCount = clamp(i32(textureLoad(u_clusterLightIndicesTexture, vec2i(0, cluster), 0).g), 0, 64);` : ""}
  for (var slot = 0u; slot < ${f.lights.clustered ? 64 : mode.directBound}u; slot += 1u) {
    ${f.lights.clustered ? `if (i32(slot) >= clusterCount) { break; }
    let index = u32(textureLoad(u_clusterLightIndicesTexture, vec2i(i32(slot), cluster), 0).r);
    let colorIntensity = textureLoad(u_clusterLightDataTexture, vec2i(0, i32(index)), 0);
    let positionRange = textureLoad(u_clusterLightDataTexture, vec2i(1, i32(index)), 0);
    let directionKind = textureLoad(u_clusterLightDataTexture, vec2i(2, i32(index)), 0);
    let spot = textureLoad(u_clusterLightDataTexture, vec2i(3, i32(index)), 0);
    ${f.shadows.localShadows || f.lights.rect ? "let areaRight = textureLoad(u_clusterLightDataTexture, vec2i(4, i32(index)), 0);" : ""}
    let areaUp = textureLoad(u_clusterLightDataTexture, vec2i(5, i32(index)), 0);` : `if (f32(slot) >= material.direct.x) { break; }
    let index = slot; let colorIntensity = material.lights[index * 6u]; let positionRange = material.lights[index * 6u + 1u];
    let directionKind = material.lights[index * 6u + 2u]; let spot = material.lights[index * 6u + 3u];
    ${f.shadows.localShadows || f.lights.rect ? "let areaRight = material.lights[index * 6u + 4u];" : ""}
    let areaUp = material.lights[index * 6u + 5u];`}
    ${photometricProfile ? `var effectiveColorIntensity = colorIntensity;
    let photoOffsets = material.photometricOffsets[index];
    let photoMeta = material.photometricMeta[index];
    if (photoOffsets.w > 0.0) {
      effectiveColorIntensity.a = a3dPhotometricCandela(u_a3dPhotometricAtlasTexture, vec4i(photoOffsets), vec2i(photoMeta.xy),
        photoMeta.zw, input.worldPosition - positionRange.xyz, directionKind.xyz);
    }` : ""}
    ${f.lights.rect ? `let sampleCount = select(1u, 4u, directionKind.w > 2.5);
    for (var sampleIndex = 0u; sampleIndex < sampleCount; sampleIndex += 1u) {
    var light: GeneratedDirectLight;
    if (directionKind.w > 2.5) { light = generatedRectLight(colorIntensity, positionRange, directionKind, spot, areaRight, areaUp, sampleIndex, input.worldPosition); }
    else { light = generatedDirectLight(${photometricProfile ? "effectiveColorIntensity" : "colorIntensity"}, positionRange, directionKind, spot, areaUp.w > 0.5, input.worldPosition); }` : `var light = generatedDirectLight(${photometricProfile ? "effectiveColorIntensity" : "colorIntensity"}, positionRange, directionKind, spot, areaUp.w > 0.5, input.worldPosition);`}
    ${f.shadows.cascades || f.shadows.contact || pointShadow || spotShadow ? `let shadowKind = directionKind.w;
    let castsShadow = spot.z;` : ""}
    ${f.shadows.cascades ? `
    if (castsShadow >= 0.5 && (shadowKind <= 0.5${spotShadow ? "" : " || (shadowKind >= 1.5 && shadowKind <= 2.5)"})) {
      light.radiance *= generatedForwardShadow(input.worldPosition, n, light.direction);
    }` : ""}
    ${f.shadows.contact ? `if (castsShadow >= 0.5 && shadowKind <= 0.5 && material.contactShadow.x > 0.0 && f32(index) == material.contactShadow.w) {
      let contactUv = input.position.xy / material.contactShadow.yz;
      let visibility = textureSampleLevel(u_contactShadowMaskTexture, u_contactShadowMaskSampler, contactUv, 0.0).r;
      light.radiance *= mix(1.0, visibility, clamp(material.contactShadow.x, 0.0, 1.0));
    }` : ""}
    ${pointShadow ? `if (castsShadow >= 0.5 && shadowKind > 0.5 && shadowKind < 1.5${f.shadows.localShadows ? " && areaRight.w < 0.5" : ""}
      && distance(positionRange.xyz, material.pointShadowPositionRange.xyz) <= 0.0001) {
      light.radiance *= generatedPointShadow(input.worldPosition, n, light.direction);
    }` : ""}
    ${spotShadow ? `if (castsShadow >= 0.5 && shadowKind > 1.5 && shadowKind < 2.5${f.shadows.localShadows ? " && areaRight.w < 0.5" : ""}
      && distance(positionRange.xyz, material.spotShadowPositionRange.xyz) <= 0.0001
      && dot(directionKind.xyz / max(length(directionKind.xyz), 0.0001),
        material.spotShadowDirectionAngle.xyz / max(length(material.spotShadowDirectionAngle.xyz), 0.0001)) >= 0.9999) {
      light.radiance *= generatedSpotShadow(input.worldPosition, n, light.direction);
    }` : ""}
    ${f.shadows.localShadows ? `light.radiance *= generatedLocalShadow(directionKind.w, areaRight.w,
      positionRange.xyz, input.worldPosition, n, light.direction);` : ""}
    let lightDfg = textureSampleLevel(u_dfgLutTexture, u_dfgLutSampler, vec2f(roughness, clamp(dot(n, light.direction), 0.0, 1.0)), 0.0).rg;
    let directResult = ${physicalDirect}(n, view, light.direction, light.radiance, pbr, viewDfg, lightDfg${packedArgument});
    ${mode.sheen && independentPhysicalPreview ? `let sheenLightCosine = clamp(dot(n, light.direction), 0.0, 1.0);
    let sheenLightWeight = a3dFastSheenShape(sheenLightCosine, sheenExponent, sheenOffset);
    let sheenDirectCompensation = a3dFastSheenCompensation(sheenViewWeight, sheenLightWeight, sheenIntensity);
    directDiffuse += directResult.diffuse * sheenDirectCompensation${f.diffuseModel === "burley" ? " * generatedBurley(n, view, light.direction, roughness)" : ""};
    directSpecular += directResult.specular * sheenDirectCompensation;` : `directDiffuse += directResult.diffuse${f.diffuseModel === "burley" ? " * generatedBurley(n, view, light.direction, roughness)" : ""}; directSpecular += directResult.specular;`}
    ${mode.diffuseTransmission ? `let backNl = clamp(-dot(n, light.direction), 0.0, 1.0); let frontNv = clamp(dot(n, view), 0.0, 1.0);
    if (backNl > 0.0 && frontNv > 0.0) {
      let f90 = clamp(pbr.specularIntensity, 0.0, 1.0);
      let available = vec3f(1.0) - clamp(max(a3dPhysicalFresnel(diffuseF0, f90, frontNv), a3dPhysicalFresnel(diffuseF0, f90, backNl)), vec3f(0.0), vec3f(1.0));
      diffuseTransmissionDirect += max(light.radiance, vec3f(0.0)) * backNl * diffuseTransmissionWeight * diffuseTransmissionColor * available / A3D_PHYSICAL_PI${sheenView};
    }` : ""}
    ${mode.iridescence ? `if (iridescenceStrength > 0.0) {
      let irNl = clamp(dot(n, light.direction), 0.0, 1.0); let halfSum = light.direction + view; var halfVector = n;
      if (dot(halfSum, halfSum) > 0.000001) { halfVector = normalize(halfSum); }
      let irFresnel = a3dPhysicalFresnel(irBaseF0, irF90, dot(view, halfVector));
      let irMixed = mix(irFresnel, irFilmFresnel, iridescenceStrength); let irAlpha = roughness * roughness;
      let irGgx = a3dPhysicalVisibility(irAlpha, irNl, irNdotV) * a3dPhysicalDggx(irAlpha, dot(n, halfVector));
      directSpecular += light.radiance * irNl * (irMixed - irFresnel) * irGgx${sheenSubstrate};
    }` : ""}
    ${mode.anisotropy ? independentPhysicalPreview ? `
    let anNl = clamp(dot(n, light.direction), 0.0, 1.0); let anNv = clamp(dot(n, view), 0.0, 1.0);
    let anHalfSum = light.direction + view;
    if (anStrength > 0.0 && anNl > 0.0 && anNv > 0.0 && dot(anHalfSum, anHalfSum) > 0.000001) {
      // Replace the host's single-scatter isotropic term exactly once. Its
      // separate DFG multiple-scatter approximation is deliberately retained.
      let anHalf = normalize(anHalfSum); let anAlphaB = roughness * roughness;
      let isotropic = a3dPhysicalFresnel(anF0, anF90, dot(view, anHalf)) * a3dPhysicalDggx(anAlphaB, dot(n, anHalf)) * a3dPhysicalVisibility(anAlphaB, anNl, anNv);
      let anisotropic = a3dPrd04AnisotropyDirect(light.direction, view, n, anF0, anF90, roughness, anLobes);
      directSpecular += max(light.radiance, vec3f(0.0)) * anNl * (anisotropic - isotropic)${sheenSubstrate};
    }` : `if (anStrength > 0.0) {
      let anNl = clamp(dot(n, light.direction), 0.0, 1.0); let anNv = clamp(dot(n, view), 0.0, 1.0);
      let anHalfSum = light.direction + view; var anHalf = n;
      if (dot(anHalfSum, anHalfSum) > 0.000001) { anHalf = normalize(anHalfSum); }
      let anAlphaB = roughness * roughness;
      let isotropic = a3dPhysicalFresnel(anF0, anF90, dot(view, anHalf)) * a3dPhysicalDggx(anAlphaB, dot(n, anHalf)) * a3dPhysicalVisibility(anAlphaB, anNl, anNv);
      let anisotropic = generatedAnisotropicGgx(n, view, light.direction, anT, anB, anAlphaT, anAlphaB, anF0, anF90);
      directSpecular += light.radiance * anNl * (anisotropic - isotropic);
    }` : ""}
    ${mode.sheen ? independentPhysicalPreview
      ? "sheenDirect += max(light.radiance, vec3f(0.0)) * sheenLightCosine * sheenColor * a3dFastSheenDirect(sheenViewWeight, sheenLightWeight, sheenNormalization);"
      : "sheenDirect += light.radiance * clamp(dot(n, light.direction), 0.0, 1.0) * generatedSheenDirect(n, view, light.direction, sheenColor, sheenRoughness);" : ""}
    ${mode.coat ? independentPhysicalPreview
      ? "coatDirect += max(light.radiance, vec3f(0.0)) * a3dPrd04ClearcoatDirect(light.direction, view, coatNormal, coatRoughness);"
      : "coatDirect += light.radiance * clamp(dot(coatNormal, light.direction), 0.0, 1.0) * generatedClearcoatDirect(coatNormal, view, light.direction, coatRoughness);" : ""}
    ${f.lights.rect ? "}" : ""}
  }` : ""}
  var indirectDiffuse = material.ambient.rgb * material.ambient.a * diffuseColor / A3D_PHYSICAL_PI;
  var indirectSpecular = vec3f(0.0);
  ${mode.ibl ? `
  let hemi = mix(material.hemiGround.rgb, material.hemiSky.rgb, dot(n, material.hemiDirection.xyz) * 0.5 + 0.5);
  let irradiance = ${irradiance("generatedProbeIrradiance(n)")};
  let reflected = reflect(-view, n);
  let bent = normalize(mix(reflected, n, roughness * roughness * roughness * roughness));
  let lod = (max(material.probe.x, 1.0) - 1.0) * roughness * (2.0 - roughness);
  let globalRadiance = textureSampleLevel(u_envSpecularTexture, u_envSpecularSampler, generatedRotateY(bent, material.probe.y), lod).rgb * material.probe.w;
  let radiance = ${mode.localProbe ? "globalRadiance * material.localWeights.z + generatedLocalProbeRadiance(input.worldPosition, reflected, roughness) * material.controls.y" : "globalRadiance"};
  let dfg = textureSampleLevel(u_dfgLutTexture, u_dfgLutSampler, vec2f(roughness, clamp(dot(n, view), 0.0, 1.0)), 0.0).rg;
  let indirect = ${physicalIndirect}(dot(n, view), radiance, irradiance, pbr, dfg${packedArgument});
  indirectDiffuse = indirect.diffuse + (material.ambientIrradiance.rgb + hemi / A3D_PHYSICAL_PI) * diffuseColor;
  indirectSpecular = indirect.specular;` : mode.sampled !== "none" ? `
  let irradiance = ${irradiance("A3D_PHYSICAL_PI * generatedSampleEnvironment(n, 8.0)")};
  let reflected = reflect(-view, n); let globalRadiance = generatedSampleEnvironment(reflected, roughness * 8.0);
  let radiance = ${mode.localProbe ? "globalRadiance * material.localWeights.z + generatedLocalProbeRadiance(input.worldPosition, reflected, roughness) * material.controls.y" : "globalRadiance"};
  let dfg = textureSampleLevel(u_dfgLutTexture, u_dfgLutSampler, vec2f(roughness, clamp(dot(n, view), 0.0, 1.0)), 0.0).rg;
  let indirect = ${physicalIndirect}(dot(n, view), radiance, irradiance, pbr, dfg${packedArgument});
  indirectDiffuse += indirect.diffuse; indirectSpecular += indirect.specular;
  ${mode.procedural && !descriptor.lighting.compilerLightingConjunction ? `let extraProcedural = generatedProceduralSpecular(reflected, roughness)${mode.localProbe ? " * material.localWeights.z" : ""};
  indirectSpecular += ${physicalIndirect}(dot(n, view), extraProcedural, vec3f(0.0), pbr, dfg${packedArgument}).specular;` : ""}` : mode.procedural ? `
  let irradiance = ${irradiance("A3D_PHYSICAL_PI * generatedProceduralDiffuse(n)")};
  let reflected = reflect(-view, n);
  let globalRadiance = generatedProceduralSpecular(reflected, roughness);
  let radiance = ${mode.localProbe ? "globalRadiance * material.localWeights.z + generatedLocalProbeRadiance(input.worldPosition, reflected, roughness) * material.controls.y" : "globalRadiance"};
  let dfg = textureSampleLevel(u_dfgLutTexture, u_dfgLutSampler, vec2f(roughness, clamp(dot(n, view), 0.0, 1.0)), 0.0).rg;
  let indirect = ${physicalIndirect}(dot(n, view), radiance, irradiance, pbr, dfg${packedArgument});
  indirectDiffuse += indirect.diffuse; indirectSpecular += indirect.specular;` : mode.localProbe || localDiffuse ? `
  let localRadiance = ${mode.localProbe ? "generatedLocalProbeRadiance(input.worldPosition, reflect(-view, n), roughness) * material.controls.y" : "vec3f(0.0)"};
  let localIrradiance = ${irradiance("vec3f(0.0)")};
  let dfg = textureSampleLevel(u_dfgLutTexture, u_dfgLutSampler, vec2f(roughness, clamp(dot(n, view), 0.0, 1.0)), 0.0).rg;
  let indirect = ${physicalIndirect}(dot(n, view), localRadiance, localIrradiance, pbr, dfg${packedArgument});
  indirectDiffuse += indirect.diffuse; indirectSpecular += indirect.specular;` : ""}
  ${mode.diffuseTransmission ? `var diffuseTransmissionIndirect = material.ambient.rgb * material.ambient.a * diffuseTransmissionColor * diffuseTransmissionWeight / A3D_PHYSICAL_PI;${backIndirect}` : ""}
  ${mode.occlusionMap ? `let occlusion = mix(1.0, occlusionSample, clamp(material.coreMapControls.w, 0.0, 1.0)); indirectDiffuse *= occlusion; indirectSpecular *= occlusion;${mode.diffuseTransmission ? " diffuseTransmissionIndirect *= occlusion;" : ""}` : ""}
  ${mode.diffuseTransmission ? "directDiffuse = directDiffuse * (1.0 - diffuseTransmissionFactor) + diffuseTransmissionDirect; indirectDiffuse = indirectDiffuse * (1.0 - diffuseTransmissionFactor) + diffuseTransmissionIndirect;" : ""}
  ${mode.advanced === "lightmap" ? `let baked = a3dNativeLightmapIrradiance(u_a3dNativeLightmapTextureTexture, input.${mode.lightmapUv === 1 ? "uv1" : "uv"});
  let bakedDfg = textureSampleLevel(u_dfgLutTexture, u_dfgLutSampler, vec2f(roughness, clamp(dot(n, view), 0.0, 1.0)), 0.0).rg;
  let bakedDiffuse = ${physicalIndirect}(dot(n, view), vec3f(0.0), baked.rgb * material.advancedIntensity.x, pbr, bakedDfg${packedArgument}).diffuse${mode.occlusionMap ? " * occlusion" : ""};
  ${mode.lightmapAdd ? "indirectDiffuse += bakedDiffuse * baked.a;" : "directDiffuse *= 1.0 - baked.a; indirectDiffuse = mix(indirectDiffuse, bakedDiffuse, baked.a);"}` : ""}
  ${mode.iridescence && (mode.ibl || mode.sampled !== "none" || mode.procedural || mode.localProbe || localDiffuse) ? `let irReflection = reflect(-view, n);
  let irRadiance = generatedLobeRadiance(input.worldPosition, irReflection, roughness);
  let irIrradiance = ${mode.ibl || mode.sampled !== "none" || mode.procedural ? "irradiance" : "localIrradiance"};
  let irCoefficients = clamp(dfg, vec2f(0.0), vec2f(1.0)); let irMissing = 1.0 - clamp(irCoefficients.x + irCoefficients.y, 0.0, 1.0);
  let irF0 = mix(irBaseF0, irFilmF0, iridescenceStrength);
  let irSingle = clamp(irF0 * irCoefficients.x + vec3f(irF90 * irCoefficients.y), vec3f(0.0), vec3f(1.0));
  let irAverage = clamp(irF0 + (vec3f(irF90) - irF0) / 21.0, vec3f(0.0), vec3f(1.0));
  let irMultiple = min(vec3f(1.0) - irSingle, irMissing * irAverage);
  let baseSingle = clamp(irBaseF0 * irCoefficients.x + vec3f(irF90 * irCoefficients.y), vec3f(0.0), vec3f(1.0));
  let baseAverage = clamp(irBaseF0 + (vec3f(irF90) - irBaseF0) / 21.0, vec3f(0.0), vec3f(1.0));
  let baseMultiple = min(vec3f(1.0) - baseSingle, irMissing * baseAverage);
  indirectSpecular += irRadiance * irSingle - max(irRadiance, vec3f(0.0)) * baseSingle
    + (irIrradiance * irMultiple - max(irIrradiance, vec3f(0.0)) * baseMultiple) / A3D_PHYSICAL_PI;` : ""}
  ${mode.anisotropy && (mode.ibl || mode.sampled !== "none" || mode.procedural || mode.localProbe) ? `let anProjected = view - anB * dot(view, anB); var anBent = n;
  if (dot(anProjected, anProjected) > 0.00000001) { anBent = normalize(anProjected); }
  let anBlend = pow(1.0 - anStrength * (1.0 - clamp(roughness, 0.0, 1.0)), 4.0);
  let anNormalSum = mix(anBent, n, anBlend); if (dot(anNormalSum, anNormalSum) > 0.00000001) { anBent = normalize(anNormalSum); } else { anBent = n; }
  let anBentDirection = reflect(-view, anBent); let anIsoDirection = reflect(-view, n);
  let anBentRadiance = generatedLobeRadiance(input.worldPosition, anBentDirection, roughness);
  let anIsoRadiance = generatedLobeRadiance(input.worldPosition, anIsoDirection, roughness);
  let anCoefficients = clamp(dfg, vec2f(0.0), vec2f(1.0));
  let anSingle = clamp(anF0 * anCoefficients.x + vec3f(anF90 * anCoefficients.y), vec3f(0.0), vec3f(1.0));
  indirectSpecular += (max(anBentRadiance, vec3f(0.0)) - max(anIsoRadiance, vec3f(0.0))) * anSingle;` : ""}
  ${mode.sheen ? independentPhysicalPreview ? `
  // The exact albedo holds for uniform lighting; nonuniform sources use the
  // substrate's cosine-weighted irradiance E as the uniform equivalent.
  // Occlusion is applied to the sheen irradiance just as it is to the substrate.
  ${mode.advanced === "lightmap" ? `let sheenBaked = baked.rgb * material.advancedIntensity.x;
  let sheenEnvironment = ${mode.lightmapAdd ? `${sheenIrradiance} + sheenBaked * baked.a` : `mix(${sheenIrradiance}, sheenBaked, baked.a)`};` : ""}
  let sheenAmbient = max(${mode.advanced === "lightmap" ? "sheenEnvironment" : sheenIrradiance}, vec3f(0.0))${mode.occlusionMap ? " * occlusion" : ""};
  let sheenIndirectCompensation = a3dFastSheenCompensation(sheenViewWeight, 0.0, sheenIntensity);
  directSpecular += sheenDirect;
  indirectDiffuse *= sheenIndirectCompensation; indirectSpecular *= sheenIndirectCompensation;
  indirectSpecular += sheenAmbient * sheenColor * (a3dFastSheenAlbedo(sheenViewWeight) / A3D_PHYSICAL_PI);` : `
  let sheenWeight = generatedSheenAlbedo(clamp(dot(n, view), 0.0, 1.0), sheenRoughness);
  let compensation = clamp(1.0 - max(max(sheenColor.r, sheenColor.g), sheenColor.b) * sheenWeight, 0.0, 1.0);
  let sheenIrradiance = material.ambient.rgb * material.ambient.a + ${mode.ibl || mode.sampled !== "none" || mode.procedural ? "irradiance" : localDiffuse ? "localIrradiance" : "vec3f(0.0)"} / A3D_PHYSICAL_PI;
  directDiffuse *= compensation; directSpecular = directSpecular * compensation + sheenDirect;
  indirectDiffuse *= compensation; indirectSpecular = indirectSpecular * compensation + sheenIrradiance * sheenColor * (sheenWeight / A3D_PHYSICAL_PI);` : ""}
  ${mode.coat ? `let coatReflection = reflect(-view, coatNormal);
  let coatRadiance = generatedLobeRadiance(input.worldPosition, coatReflection, coatRoughness);
  let coatDfg = textureSampleLevel(u_dfgLutTexture, u_dfgLutSampler, vec2f(coatRoughness, clamp(dot(coatNormal, view), 0.0, 1.0)), 0.0).rg;
  let coatIndirect = coatRadiance * clamp(vec3f(0.04) * coatDfg.x + vec3f(coatDfg.y), vec3f(0.0), vec3f(1.0));
  let coatFresnel = a3dPhysicalFresnel(vec3f(0.04), 1.0, dot(coatNormal, view)); let coatBase = vec3f(1.0) - coatFactor * coatFresnel;
  directDiffuse *= coatBase; directSpecular = directSpecular * coatBase + coatDirect * coatFactor;
  indirectDiffuse *= coatBase; indirectSpecular = indirectSpecular * coatBase + coatIndirect * coatFactor;` : ""}
  ${mode.transmission ? `let thickness = ${mode.materialVolume ? `max(material.volumeMaterial.x${mode.lobeMaps.volumeThickness !== undefined ? " * thicknessSample" : ""}, 0.0)` : "0.0"};
  ${instanceVolume ? "let volumeLinear = mat3x3f(input.volume0, input.volume1, input.volume2);" : "let volumeWorld = material.model * material.geometry; let volumeLinear = mat3x3f(volumeWorld[0].xyz, volumeWorld[1].xyz, volumeWorld[2].xyz);"}
  ${mode.dispersion ? `let centerIor = max(pbr.ior, 0.0001);
  let spread = max(centerIor - 1.0, 0.0) * 0.025 * max(material.volumeMaterial.z, 0.0);
  let bandIor = max(vec3f(centerIor - spread, centerIor, centerIor + spread), vec3f(0.0001));
  var transmittedScene = vec3f(0.0);
  for (var band = 0u; band < 3u; band += 1u) {
    let sampleValue = generatedTransmissionSample(input.worldPosition, n, view, roughness, bandIor[band], thickness, volumeLinear);
    transmittedScene[band] = sampleValue[band];
  }` : "let transmittedScene = generatedTransmissionSample(input.worldPosition, n, view, roughness, pbr.ior, thickness, volumeLinear);"}
  let transIor = max(pbr.ior, 0.0001); let transF = (transIor - 1.0) / (transIor + 1.0);
  let transDielectric = clamp(transF * transF * max(pbr.specularColorFactor, vec3f(0.0)), vec3f(0.0), vec3f(1.0)) * clamp(pbr.specularIntensity, 0.0, 1.0);
  let transF0 = mix(transDielectric, clamp(base.rgb, vec3f(0.0), vec3f(1.0)), clamp(metallic, 0.0, 1.0));
  let transF90 = mix(clamp(pbr.specularIntensity, 0.0, 1.0), 1.0, clamp(metallic, 0.0, 1.0));
  let transDfg = textureSampleLevel(u_dfgLutTexture, u_dfgLutSampler, vec2f(roughness, clamp(dot(n, view), 0.0, 1.0)), 0.0).rg;
  let transReflectance = clamp(transF0 * transDfg.x + vec3f(transF90 * transDfg.y), vec3f(0.0), vec3f(1.0));
  let transmitted = (vec3f(1.0) - transReflectance) * diffuseColor * transmittedScene${sheenView};
  indirectDiffuse = mix(directDiffuse + indirectDiffuse, transmitted, clamp(material.transmission.x${mode.lobeMaps.transmission !== undefined ? " * transmissionSample" : ""}, 0.0, 1.0));
  directDiffuse = vec3f(0.0);` : ""}
  let ${f.fog === "none" && !mode.prd07Fog ? "color" : "unfoggedColor"} = max(directDiffuse + directSpecular + indirectDiffuse + indirectSpecular + ${mode.instanceEmissive ? "(" : ""}material.emissive.rgb * material.emissive.a${mode.emissiveMap ? " * emissiveSample" : ""}${mode.rim ? " + material.rim.rgb * (material.rim.a * pow(1.0 - clamp(dot(n, view), 0.0, 1.0), max(material.rimParams.x, 0.01)))" : ""}${mode.instanceEmissive ? ") * input.instanceColor.rgb" : ""}, vec3f(0.0));
  ${mode.prd07Fog ? "let color = a3dPrd07ApplyFog(unfoggedColor, input.worldPosition);" : ""}
  ${f.fog !== "none" && !mode.prd07Fog ? `let fogDepth = select(input.position.z, 1.0 - input.position.z, frame.projection[2][2] > 0.0) / input.position.w; // reversed depth (P22 > 0) keeps the standard reading, as a3d.reversedFogDepth does on WebGL2
  ${f.fog === "linear" ? "let fogAmount = clamp((fogDepth - material.fogParams.x) / max(material.fogParams.y - material.fogParams.x, 0.0001), 0.0, 1.0);" : `let fogDensity = material.fogParams.z${f.fog === "height" ? " * exp(-max(input.worldPosition.y, 0.0) * material.fogParams.w)" : ""};
  let fogDistance = fogDensity * fogDepth;
  let fogAmount = clamp(1.0 - exp(-fogDistance * fogDistance), 0.0, 1.0);`}
  let color = mix(unfoggedColor, material.fogColor.rgb, fogAmount);` : ""}
  ${fraction ? "let luma = vec3f(0.2126, 0.7152, 0.0722); let alpha = 2.0 + clamp(dot(indirectDiffuse + indirectSpecular, luma) / max(dot(color, luma), 0.0001), 0.0, 1.0);" : `let alpha = ${f.alphaMode === "blend" ? "base.a" : mode.alphaToCoverage ? "a3dCoverage" : "1.0"};`}
  ${clipping ? "if (!generatedClipRetains(input.worldPosition, input.clipLocal)) { discard; }" : ""}
  ${writesDepthCoverage
    ? `return GeneratedDepthCoverageOutput(vec4f(color, alpha), vec4f(1.0, 0.0, 0.0, 0.0));` /* depth coverage rejects logarithmic depth (depthCoverageUnsupportedReason) */
    : logDepth
      ? `return GeneratedLogDepthOutput(vec4f(${mode.outputSrgb ? "generatedEncodeOutput(color)" : "color"}, alpha), generatedLogFragmentDepth(input.worldPosition));`
      : `return vec4f(${mode.outputSrgb ? "generatedEncodeOutput(color)" : "color"}, alpha);`}
}`;
  return Object.freeze<GeneratedPbrProgram>({
    vertex, fragment, vertexEntryPoint: "vs_main", fragmentEntryPoint: "fs_main",
    materialBinding: { group: 0, binding: 0, byteLength: GENERATED_PBR_MATERIAL_LAYOUT.size },
    frameBinding: { group: 1, binding: 0, minimumByteLength: 304 },
    resources, requiredVertexLocations: [0, 1, ...(mode.uv0 ? [2] : []), ...(mode.tangent ? [3] : []), ...(f.vertexColors ? [4] : []), ...(mode.skinning ? [5, 6] : []), ...(mode.uv1 ? [7] : []), ...(mode.skinning === 8 ? [8, 9] : [])],
    requiredInstanceLocations: f.instancing ? [instanceLocation, instanceLocation + 1, instanceLocation + 2, instanceLocation + 3, ...(instanceStream ? [instanceLocation + 4] : [])] : [],
    skinning: mode.skinning, directLightBound: mode.directBound, clustered: f.lights.clustered, rectLights: f.lights.rect > 0,
    morph: mode.morph, transmission: mode.transmission, transmissionDegraded: mode.transmissionDegraded, transmissionMap: mode.lobeMaps.transmission !== undefined, contactShadow: f.shadows.contact,
    pointShadow, spotShadow,
    diffuseTransmission: mode.diffuseTransmission, diffuseTransmissionMap: mode.lobeMaps.diffuseTransmission !== undefined, diffuseTransmissionColorMap: mode.lobeMaps.diffuseTransmissionColor !== undefined,
    fog: f.fog as GeneratedPbrProgram["fog"], clipping, packedLoopColor, photometricProfile, wetness: mode.wetness, prd07Fog: mode.prd07Fog, wind: mode.wind, writesDepthCoverage, logarithmicDepth: logDepth, alphaToCoverage: mode.alphaToCoverage, // validateDescriptor has rejected volumetric fog.
    materialVolume: mode.materialVolume, thicknessMap: mode.lobeMaps.volumeThickness !== undefined, dispersion: mode.dispersion, jointKinds: mode.jointKinds,
    requiresFloatColorAttachment: fraction
  });
}

/** Refuse normalized targets for tagged alpha, or output modes that preserve authored alpha. */
export function validateGeneratedPbrTarget(program: GeneratedPbrProgram, format: string, preserveAlpha = false): void {
  if (program.requiresFloatColorAttachment && (!new Set(["rgba16float", "rgba32float"]).has(format) || preserveAlpha)) {
    throw new RenderDeviceError("Generated indirect-fraction tags require a floating target without authored-alpha preservation", "WEBGPU_INDIRECT_FRACTION_TARGET_UNSUPPORTED", { format, preserveAlpha });
  }
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
function numbers(uniforms: ReadonlyMap<string, UniformValue>, name: string, length: number, fallback: readonly number[]): number[] {
  const value = uniforms.get(name);
  if (value === undefined) return [...fallback];
  if (typeof value === "number") {
    if (length !== 1 || !Number.isFinite(value)) throw new RenderDeviceError(`Invalid ${name}`, "WEBGPU_PBR_UNIFORM_INVALID", { name });
    return [value];
  }
  if (Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView))) {
    const result = Array.from(value as ArrayLike<number>);
    if (result.length === length && result.every(Number.isFinite)) return result;
  }
  throw new RenderDeviceError(`Invalid ${name}`, "WEBGPU_PBR_UNIFORM_INVALID", { name });
}
function scalar(uniforms: ReadonlyMap<string, UniformValue>, name: string, fallback: number): number { return numbers(uniforms, name, 1, [fallback])[0]!; }
function vec3(uniforms: ReadonlyMap<string, UniformValue>, name: string, fallback: readonly [number, number, number] = [0, 0, 0]): number[] { return numbers(uniforms, name, 3, fallback); }
function mapTransform(uniforms: ReadonlyMap<string, UniformValue>, name: string): number[] {
  return [...numbers(uniforms, `${name}Offset`, 2, [0, 0]), ...numbers(uniforms, `${name}Scale`, 2, [1, 1])];
}

/** Validate the slot-indexed, non-clustered packet before converting its floats to WGSL integers. */
export function validateGeneratedPhotometricPacket(
  uniforms: ReadonlyMap<string, UniformValue>, capacity = 16_777_216
): { readonly offsets: number[]; readonly meta: number[] } {
  const invalid = (): never => { throw new RenderDeviceError("Invalid generated PBR photometric packet", "WEBGPU_PHOTOMETRIC_PACKET_INVALID"); };
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 16_777_216) return invalid();
  const read = (name: string): number[] => {
    const value = uniforms.get(name);
    if (!Array.isArray(value) && (!ArrayBuffer.isView(value) || value instanceof DataView)) return invalid();
    const values = Array.from(value as ArrayLike<number>);
    if (values.length !== 64 || values.some((v) => !Number.isFinite(v) || !Number.isFinite(Math.fround(v)) || (v !== 0 && Math.fround(v) === 0))) return invalid();
    return values;
  };
  const offsets = read("u_a3dPhotometricOffsets"), meta = read("u_a3dPhotometricMeta");
  const lightCount = scalar(uniforms, "u_lightCount", 0);
  const rawLights = uniforms.get("u_lightData");
  if (!Number.isInteger(lightCount) || lightCount < 1 || lightCount > 16 ||
      (!Array.isArray(rawLights) && (!ArrayBuffer.isView(rawLights) || rawLights instanceof DataView))) return invalid();
  const lights = Array.from(rawLights as ArrayLike<number>);
  if (lights.length < lightCount * 24 || lights.length > 384 || !lights.every(Number.isFinite)) return invalid();
  let enabled = 0;
  for (let slot = 0; slot < 16; slot += 1) {
    const i = slot * 4;
    const [vOffset, hOffset, cOffset, vCount] = offsets.slice(i, i + 4) as [number, number, number, number];
    const [hCount, symmetry, scale, rotation] = meta.slice(i, i + 4) as [number, number, number, number];
    if (vCount === 0) {
      if ([vOffset, hOffset, cOffset, hCount, symmetry, scale, rotation].some((v) => v !== 0)) return invalid();
      continue;
    }
    const kind = lights[slot * 24 + 11];
    if (slot >= lightCount || (kind !== 1 && kind !== 2) ||
        ![vOffset, hOffset, cOffset, vCount, hCount, symmetry].every(Number.isSafeInteger) ||
        vOffset < 0 || vCount < 1 || vCount > 4096 || hCount < 1 || hCount > 4096 || vCount * hCount > 1_048_576 ||
        (hCount === 1 ? symmetry !== 0 : symmetry < 1 || symmetry > 3) ||
        hOffset !== vOffset + vCount || cOffset !== hOffset + hCount || cOffset + vCount * hCount > capacity ||
        scale < 0 || Math.abs(rotation) > Math.PI + 1e-6 ||
        !lights.slice(slot * 24 + 4, slot * 24 + 7).every((v) => Number.isFinite(Math.fround(v))) ||
        !lights.slice(slot * 24 + 8, slot * 24 + 11).every((v) => Number.isFinite(Math.fround(v))) ||
        Math.hypot(...lights.slice(slot * 24 + 8, slot * 24 + 11).map(Math.fround)) === 0) return invalid();
    enabled += 1;
  }
  if (enabled === 0) return invalid();
  return { offsets, meta };
}

/** Pack draw-owned scalar/matrix data; texture bindings are resolved by the device. */
export function packGeneratedPbrMaterialUniforms(uniforms: ReadonlyMap<string, UniformValue>, packedLoopColor = false, photometricProfile = false): Uint8Array {
  // The native wetness response has no puddle-noise binding (see wetness.wgsl).
  // Refuse a caller-supplied noise texture instead of silently dropping it.
  const puddleNoise = uniforms.get("u_puddleNoise");
  if (isTextureBinding(puddleNoise) && puddleNoise.texture) {
    throw new RenderDeviceError("Native WebGPU wetness does not support a puddle-noise texture; use the WebGL2 backend or omit puddleNoise", "WEBGPU_WETNESS_PUDDLE_TEXTURE_UNSUPPORTED", { name: "u_puddleNoise" });
  }
  const memberValue = packedLoopColor ? uniforms.get("u_a3dPackedLoopColor") : undefined;
  if (packedLoopColor && memberValue === undefined) throw new RenderDeviceError("Missing u_a3dPackedLoopColor", "WEBGPU_PBR_UNIFORM_INVALID", { name: "u_a3dPackedLoopColor" });
  const memberColor = memberValue === undefined ? [1, 1, 1, 1] : numbers(new Map([["u_a3dPackedLoopColor", memberValue]]), "u_a3dPackedLoopColor", 4, [1, 1, 1, 1]);
  const sh = numbers(uniforms, "u_envSH", 28, new Array<number>(28).fill(0));
  const rawAttenuation = uniforms.get("u_volumeAttenuationDistance");
  const attenuationDistance = rawAttenuation === Infinity ? 3.4028234663852886e38 : scalar(uniforms, "u_volumeAttenuationDistance", 3.4028234663852886e38);
  const shadowSamples = numbers(uniforms, "u_shadowPcfSamples", 128, new Array<number>(128).fill(0));
  const localMatrices = numbers(uniforms, "u_localShadowMatrices", 96, new Array<number>(96).fill(0));
  const localRects = numbers(uniforms, "u_localShadowRects", 24, new Array<number>(24).fill(0));
  const localScales = numbers(uniforms, "u_localShadowTexelScale", 8, new Array<number>(8).fill(0));
  const pointMatrices = numbers(uniforms, "u_pointShadowFaceMatrices", 96, new Array<number>(96).fill(0));
  const pointRects = numbers(uniforms, "u_pointShadowFaceRects", 24, new Array<number>(24).fill(0));
  const pointSamples = numbers(uniforms, "u_pointShadowPcfSamples", 128, new Array<number>(128).fill(0));
  const spotSamples = numbers(uniforms, "u_spotShadowPcfSamples", 128, new Array<number>(128).fill(0));
  const advancedSources = ["u_a3dNativeProbe", "u_a3dNativeVoxel", "u_a3dNativeLightmap"].filter(prefix => uniforms.has(`${prefix}Texture`));
  if (advancedSources.length > 1) throw new RenderDeviceError("Conflicting advanced lighting packets", "WEBGPU_ADVANCED_LIGHTING_INVALID");
  const advancedPrefix = advancedSources[0] ?? "u_a3dNativeLightmap";
  const advancedLevels = numbers(uniforms, "u_a3dNativeVoxelLevels", 28, new Array<number>(28).fill(0));
  const clipPlanes = numbers(uniforms, "u_a3dClipPlanes", 32, new Array<number>(32).fill(0));
  const clipGroups = numbers(uniforms, "u_a3dClipGroups", 8, new Array<number>(8).fill(0));
  const morphValues = (name: string): number[] => {
    const value = uniforms.get(name);
    if (value === undefined) return new Array<number>(64).fill(0);
    if (!Array.isArray(value) && (!ArrayBuffer.isView(value) || value instanceof DataView)) throw new RenderDeviceError(`Invalid ${name}`, "WEBGPU_PBR_UNIFORM_INVALID", { name });
    const result = Array.from(value as ArrayLike<number>);
    if (result.length > 64 || result.length % 4 !== 0 || !result.every(Number.isFinite)) throw new RenderDeviceError(`Invalid ${name}`, "WEBGPU_PBR_UNIFORM_INVALID", { name });
    while (result.length < 64) result.push(0);
    return result;
  };
  const morphIndices = morphValues("u_morphActiveIndex4"), morphWeights = morphValues("u_morphActiveWeight4");
  const specularName = uniforms.has("u_specularIntensity") ? "u_specularIntensity" : "u_specularFactor";
  const lightCount = scalar(uniforms, "u_lightCount", 0);
  if (!Number.isInteger(lightCount) || lightCount < 0 || lightCount > 16) throw new RenderDeviceError("Invalid u_lightCount", "WEBGPU_PBR_UNIFORM_INVALID", { name: "u_lightCount" });
  const packedLights = uniforms.get("u_lightData");
  let lights: number[] = [];
  if (packedLights !== undefined) {
    if (!Array.isArray(packedLights) && (!ArrayBuffer.isView(packedLights) || packedLights instanceof DataView)) throw new RenderDeviceError("Invalid u_lightData", "WEBGPU_PBR_UNIFORM_INVALID", { name: "u_lightData" });
    lights = Array.from(packedLights as ArrayLike<number>);
    if (lights.length > 384 || lights.length % 4 !== 0 || !lights.every(Number.isFinite)) throw new RenderDeviceError("Invalid u_lightData", "WEBGPU_PBR_UNIFORM_INVALID", { name: "u_lightData" });
  }
  if (lights.length < lightCount * 24) throw new RenderDeviceError("Invalid u_lightData for u_lightCount", "WEBGPU_PBR_UNIFORM_INVALID", { name: "u_lightData" });
  while (lights.length < 384) lights.push(0);
  if (!photometricProfile && ["u_a3dPhotometricOffsets", "u_a3dPhotometricMeta", "u_a3dPhotometricAtlas"].some((name) => uniforms.has(name))) {
    throw new RenderDeviceError("Photometric uniforms require their generated shader feature", "WEBGPU_PHOTOMETRIC_PACKET_INVALID");
  }
  const photometric = photometricProfile ? validateGeneratedPhotometricPacket(uniforms) : { offsets: new Array<number>(64).fill(0), meta: new Array<number>(64).fill(0) };
  const volumeNames = ["u_prd02IrradianceMin", "u_prd02IrradianceMax", "u_prd02IrradianceGrid"];
  const volumeSelected = [...volumeNames, "u_prd02IrradianceR", "u_prd02IrradianceG", "u_prd02IrradianceB"].some((name) => uniforms.has(name));
  if (volumeSelected && !volumeNames.every((name) => uniforms.has(name))) throw new RenderDeviceError("Incomplete irradiance-volume metadata", "WEBGPU_PBR_UNIFORM_INVALID", { name: "u_prd02IrradianceGrid" });
  const volumeMin = numbers(uniforms, "u_prd02IrradianceMin", 4, [0, 0, 0, 0]);
  const volumeMax = numbers(uniforms, "u_prd02IrradianceMax", 4, [1, 1, 1, 0]);
  const volumeGrid = numbers(uniforms, "u_prd02IrradianceGrid", 4, [1, 1, 1, 0]);
  const validVolumeAxis = (minimum: number, index: number): boolean => {
    const low = Math.fround(minimum), high = Math.fround(volumeMax[index]!);
    const extent = Math.fround(high - low);
    const size = Math.fround(extent / volumeGrid[index]!);
    const half = Math.fround(size * 0.5);
    return Number.isFinite(low) && Number.isFinite(high) && Number.isFinite(extent) && extent > 0
      && half >= 2 ** -126 && Number.isFinite(Math.fround(low - half)) && Number.isFinite(Math.fround(high + half));
  };
  if (volumeSelected && (volumeGrid.slice(0, 3).some((value) => !Number.isInteger(value) || value < 1 || value > 16)
    || volumeGrid[3]! < 0 || !Number.isFinite(Math.fround(volumeGrid[3]!)) || !volumeMin.slice(0, 3).every(validVolumeAxis))) {
    throw new RenderDeviceError("Invalid irradiance-volume bounds, grid or intensity", "WEBGPU_PBR_UNIFORM_INVALID", { name: "u_prd02IrradianceGrid" });
  }
  return writeShaderData(GENERATED_PBR_MATERIAL_LAYOUT, {
    model: numbers(uniforms, "u_modelMatrix", 16, IDENTITY), geometry: numbers(uniforms, "u_geometryMatrix", 16, IDENTITY),
    normal: numbers(uniforms, "u_normalMatrix", 16, IDENTITY), shadowMatrix: numbers(uniforms, "u_shadowMapMatrix", 16, IDENTITY), baseColor: numbers(uniforms, "u_baseColor", 4, [1, 1, 1, 1]),
    emissive: [...vec3(uniforms, "u_emissiveColor"), scalar(uniforms, "u_emissiveStrength", 0)],
    surface: [scalar(uniforms, "u_metallic", 0), scalar(uniforms, "u_roughness", 1), scalar(uniforms, "u_ior", 1.5), scalar(uniforms, specularName, 1)],
    specular: [...vec3(uniforms, "u_specularColorFactor", [1, 1, 1]), 0],
    ambient: [...vec3(uniforms, "u_environmentColor"), scalar(uniforms, "u_environmentIntensity", 0)],
    sheen: [...vec3(uniforms, "u_sheenColorFactor"), scalar(uniforms, "u_sheenRoughnessFactor", 0)],
    probe: [scalar(uniforms, "u_envMipCount", 1), scalar(uniforms, "u_envRotation", 0), scalar(uniforms, "u_envDiffuseIntensity", 0), scalar(uniforms, "u_envSpecularIntensity", 0)],
    envMap: [scalar(uniforms, "u_environmentMapIntensity", 0), scalar(uniforms, "u_environmentMapRotation", 0), scalar(uniforms, "u_environmentMapMaxLod", 0), scalar(uniforms, "u_environmentMapEncoding", 0)],
    ambientIrradiance: [...vec3(uniforms, "u_ambientIrradiance"), 0], hemiSky: [...vec3(uniforms, "u_hemiSky"), 0],
    hemiGround: [...vec3(uniforms, "u_hemiGround"), 0], hemiDirection: [...vec3(uniforms, "u_hemiDirection", [0, 1, 0]), 0],
    procSky: [...vec3(uniforms, "u_a3dProceduralSkyColor"), scalar(uniforms, "u_a3dProceduralIntensity", 0)],
    procHorizon: [...vec3(uniforms, "u_a3dProceduralHorizonColor"), 0], procGround: [...vec3(uniforms, "u_a3dProceduralGroundColor"), 0],
    procSpecular: [...vec3(uniforms, "u_a3dProceduralSpecularColor"), scalar(uniforms, "u_a3dProceduralSpecularIntensity", 0)],
    controls: [scalar(uniforms, "u_alphaCutoff", 0), scalar(uniforms, "u_a3dLocalProbeIntensity", 1), 0, 0],
    direct: [lightCount, scalar(uniforms, "u_diffuseRoughness", 0), scalar(uniforms, "u_retroreflection", 0), 0],
    localCenterA: numbers(uniforms, "u_prd02ProbeCenterA", 4, [0, 0, 0, 0]), localHalfA: numbers(uniforms, "u_prd02ProbeHalfA", 4, [0, 0, 0, 0]),
    localOriginA: numbers(uniforms, "u_prd02ProbeOriginA", 4, [0, 0, 0, 0]), localCenterB: numbers(uniforms, "u_prd02ProbeCenterB", 4, [0, 0, 0, 0]),
    localHalfB: numbers(uniforms, "u_prd02ProbeHalfB", 4, [0, 0, 0, 0]), localOriginB: numbers(uniforms, "u_prd02ProbeOriginB", 4, [0, 0, 0, 0]),
    localWeights: numbers(uniforms, "u_prd02ProbeWeights", 4, [0, 0, 1, 1]),
    volumeMin, volumeMax, volumeGrid,
    baseUv: mapTransform(uniforms, "u_baseColorTexture"), diffuseUv: mapTransform(uniforms, "u_diffuseRoughnessTexture"), bumpUv: mapTransform(uniforms, "u_bumpTexture"), normalUv: mapTransform(uniforms, "u_normalTexture"),
    metalRoughUv: mapTransform(uniforms, "u_metallicRoughnessTexture"), occlusionUv: mapTransform(uniforms, "u_occlusionTexture"), emissiveUv: mapTransform(uniforms, "u_emissiveTexture"),
    mapControls: [scalar(uniforms, "u_baseColorTextureRotation", 0), scalar(uniforms, "u_diffuseRoughnessTextureRotation", 0), scalar(uniforms, "u_bumpTextureRotation", 0), scalar(uniforms, "u_bumpFactor", 0)],
    detailControls: [scalar(uniforms, "u_diffuseRoughnessTextureEnabled", 0), scalar(uniforms, "u_bumpTextureEnabled", 0), 0, 0],
    normalControls: [scalar(uniforms, "u_normalTextureRotation", 0), scalar(uniforms, "u_normalScale", 1), 0, 0],
    coreMapControls: [scalar(uniforms, "u_metallicRoughnessTextureRotation", 0), scalar(uniforms, "u_occlusionTextureRotation", 0), scalar(uniforms, "u_emissiveTextureRotation", 0), scalar(uniforms, "u_occlusionStrength", 1)],
    coat: [scalar(uniforms, "u_clearcoatFactor", 0), scalar(uniforms, "u_clearcoatRoughnessFactor", 0), scalar(uniforms, "u_clearcoatNormalScale", 1), 0],
    iridescence: [scalar(uniforms, "u_iridescenceFactor", 0), scalar(uniforms, "u_iridescenceIor", 1.3), scalar(uniforms, "u_iridescenceThicknessMinimum", 100), scalar(uniforms, "u_iridescenceThicknessMaximum", 400)],
    anisotropy: [scalar(uniforms, "u_anisotropyStrength", 0), scalar(uniforms, "u_anisotropyRotation", 0), 0, 0],
    bone: [scalar(uniforms, "u_boneTextureWidth", 0), 0, 0, 0],
    morph: [scalar(uniforms, "u_morphStride", 0), scalar(uniforms, "u_morphTexWidth", 0), scalar(uniforms, "u_morphActiveCount", 0), 0],
    shadowParams: [scalar(uniforms, "u_shadowMapEnabled", 0), scalar(uniforms, "u_shadowMapStrength", 0), scalar(uniforms, "u_shadowMapBias", 0), scalar(uniforms, "u_shadowMapSlopeBias", 0)],
    shadowTexel: [...numbers(uniforms, "u_shadowMapTexelSize", 2, [1, 1]), scalar(uniforms, "u_shadowMapNormalBias", 0), scalar(uniforms, "u_shadowPcfSampleCount", 1)],
    specularTransform: numbers(uniforms, "u_specularTextureUvTransform", 9, IDENTITY3), specularColorTransform: numbers(uniforms, "u_specularColorTextureUvTransform", 9, IDENTITY3),
    sheenColorTransform: numbers(uniforms, "u_sheenColorTextureUvTransform", 9, IDENTITY3), sheenRoughnessTransform: numbers(uniforms, "u_sheenRoughnessTextureUvTransform", 9, IDENTITY3),
    coatTransform: numbers(uniforms, "u_clearcoatTextureUvTransform", 9, IDENTITY3), coatRoughnessTransform: numbers(uniforms, "u_clearcoatRoughnessTextureUvTransform", 9, IDENTITY3),
    coatNormalTransform: numbers(uniforms, "u_clearcoatNormalTextureUvTransform", 9, IDENTITY3),
    iridescenceTransform: numbers(uniforms, "u_iridescenceTextureUvTransform", 9, IDENTITY3), iridescenceThicknessTransform: numbers(uniforms, "u_iridescenceThicknessTextureUvTransform", 9, IDENTITY3),
    anisotropyTransform: numbers(uniforms, "u_anisotropyTextureUvTransform", 9, IDENTITY3),
    sh: Array.from({ length: 7 }, (_, index) => sh.slice(index * 4, index * 4 + 4)),
    morphIndices: Array.from({ length: 16 }, (_, index) => morphIndices.slice(index * 4, index * 4 + 4)),
    morphWeights: Array.from({ length: 16 }, (_, index) => morphWeights.slice(index * 4, index * 4 + 4)),
    shadowSamples: Array.from({ length: 32 }, (_, index) => shadowSamples.slice(index * 4, index * 4 + 4)),
    localShadowMatrices: Array.from({ length: 6 }, (_, index) => localMatrices.slice(index * 16, index * 16 + 16)),
    localShadowRects: Array.from({ length: 6 }, (_, index) => localRects.slice(index * 4, index * 4 + 4)),
    localShadowScales: Array.from({ length: 2 }, (_, index) => localScales.slice(index * 4, index * 4 + 4)),
    localShadowParams: numbers(uniforms, "u_localShadowParams", 4, [0, 0, 0, 0]),
    localShadowTexel: [...numbers(uniforms, "u_localShadowAtlasTexel", 2, [1, 1]), 0, 0],
    transmission: [scalar(uniforms, "u_transmissionFactor", 0), ...numbers(uniforms, "a3d_prd04_transmissionSamplerSize", 2, [1, 1]), 0],
    advancedMin: numbers(uniforms, `${advancedPrefix}Min`, 4, [0, 0, 0, 0]),
    advancedMax: numbers(uniforms, `${advancedPrefix}Max`, 4, [1, 1, 1, 0]),
    advancedDimensions: numbers(uniforms, advancedPrefix === "u_a3dNativeVoxel" ? `${advancedPrefix}Resolution` : `${advancedPrefix}Dimensions`, 4, [1, 1, 1, 0]),
    advancedConfig: numbers(uniforms, "u_a3dNativeVoxelConfig", 4, [0, 0, 0, 0]),
    advancedIntensity: [scalar(uniforms, `${advancedPrefix}Intensity`, 0), scalar(uniforms, "u_a3dNativeProbeOutside", 0), 0, 0],
    advancedLevels: Array.from({ length: 7 }, (_, index) => advancedLevels.slice(index * 4, index * 4 + 4)),
    transmissionTransform: numbers(uniforms, "u_transmissionTextureUvTransform", 9, IDENTITY3),
    thicknessTransform: numbers(uniforms, "u_volumeThicknessTextureUvTransform", 9, IDENTITY3),
    volumeMaterial: [scalar(uniforms, "u_volumeThicknessFactor", 0), attenuationDistance, scalar(uniforms, "u_dispersion", 0), 0],
    volumeColor: [...vec3(uniforms, "u_volumeAttenuationColor", [1, 1, 1]), 0],
    transmissionViewport: numbers(uniforms, "u_webgpuTransmissionViewport", 4, [0, 0, 1, 1]),
    contactShadow: [scalar(uniforms, "u_contactShadowMaskStrength", 0), ...numbers(uniforms, "u_contactShadowMaskViewport", 2, [1, 1]), scalar(uniforms, "u_contactShadowLightIndex", -1)],
    pointShadowPositionRange: [...vec3(uniforms, "u_pointShadowLightPosition"), scalar(uniforms, "u_pointShadowRange", 1)],
    pointShadowParams: [scalar(uniforms, "u_pointShadowMapEnabled", 0), scalar(uniforms, "u_pointShadowStrength", 0), scalar(uniforms, "u_pointShadowBias", 0), scalar(uniforms, "u_pointShadowSlopeBias", 0)],
    pointShadowTexel: [...numbers(uniforms, "u_pointShadowTexelSize", 2, [1, 1]), scalar(uniforms, "u_pointShadowPcfSampleCount", 1), 0],
    pointShadowMatrices: Array.from({ length: 6 }, (_, index) => pointMatrices.slice(index * 16, index * 16 + 16)),
    pointShadowRects: Array.from({ length: 6 }, (_, index) => pointRects.slice(index * 4, index * 4 + 4)),
    pointShadowSamples: Array.from({ length: 32 }, (_, index) => pointSamples.slice(index * 4, index * 4 + 4)),
    spotShadowPositionRange: [...vec3(uniforms, "u_spotShadowLightPosition"), scalar(uniforms, "u_spotShadowRange", 1)],
    spotShadowDirectionAngle: [...vec3(uniforms, "u_spotShadowLightDirection", [0, -1, 0]), numbers(uniforms, "u_spotShadowCone", 2, [Math.PI / 4, 0])[0]!],
    spotShadowParams: [scalar(uniforms, "u_spotShadowMapEnabled", 0), scalar(uniforms, "u_spotShadowStrength", 0), scalar(uniforms, "u_spotShadowBias", 0), scalar(uniforms, "u_spotShadowSlopeBias", 0)],
    spotShadowTexel: [...numbers(uniforms, "u_spotShadowTexelSize", 2, [1, 1]), scalar(uniforms, "u_spotShadowPcfSampleCount", 1), 0],
    spotShadowMatrix: numbers(uniforms, "u_spotShadowMatrix", 16, IDENTITY),
    spotShadowSamples: Array.from({ length: 32 }, (_, index) => spotSamples.slice(index * 4, index * 4 + 4)),
    diffuseTransmission: [...vec3(uniforms, "u_diffuseTransmissionColorFactor", [1, 1, 1]), scalar(uniforms, "u_diffuseTransmissionFactor", 0)],
    diffuseTransmissionTransform: numbers(uniforms, "u_diffuseTransmissionTextureUvTransform", 9, IDENTITY3),
    diffuseTransmissionColorTransform: numbers(uniforms, "u_diffuseTransmissionColorTextureUvTransform", 9, IDENTITY3),
    fogColor: [...vec3(uniforms, "u_fogColor"), 0],
    fogParams: [...numbers(uniforms, "u_fogRange", 2, [0, 1]), scalar(uniforms, "u_fogDensity", 0), scalar(uniforms, "u_fogHeightFalloff", 0)],
    clusterGrid: [...numbers(uniforms, "u_clusterGridSize", 2, [1, 1]), ...numbers(uniforms, "u_clusterViewportSize", 2, [1, 1])],
    clipPlanes: Array.from({ length: 8 }, (_, index) => clipPlanes.slice(index * 4, index * 4 + 4)),
    clipGroups: Array.from({ length: 2 }, (_, index) => clipGroups.slice(index * 4, index * 4 + 4)),
    clipControl: [scalar(uniforms, "u_a3dClipGroupCount", 0), 0, 0, 0],
    packedLoopColor: memberColor,
    photometricOffsets: Array.from({ length: 16 }, (_, index) => photometric.offsets.slice(index * 4, index * 4 + 4)),
    photometricMeta: Array.from({ length: 16 }, (_, index) => photometric.meta.slice(index * 4, index * 4 + 4)),
    wetness: [scalar(uniforms, "u_wetness", 0), scalar(uniforms, "u_puddleThreshold", 0.62), scalar(uniforms, "u_rainRipples", 0), scalar(uniforms, "u_snowCover", 0)],
    logDepthView: numbers(uniforms, "u_a3dLogDepthView", 16, IDENTITY),
    logDepthRange: [...numbers(uniforms, "u_a3dLogDepthRange", 2, [1, 2]), 0, 0],
    // Only a program that selected the stock prd07.fog feature receives u_fogMode (its bindUniforms always writes it).
    ...packPrd07FogWgslFields(uniforms, (name, length, fallback) => uniforms.has("u_fogMode") ? numbers(uniforms, name, length, fallback) : [...fallback]),
    windDirStrength: numbers(uniforms, "u_windDirStrength", 4, [0, 0, 0, 0]),
    windGust: numbers(uniforms, "u_windGust", 4, [0, 0, 0, 0]),
    windParams: [scalar(uniforms, "u_windAssetHeight", 0), 0, 0, 0],
    rim: [...vec3(uniforms, "u_prd04RimColor", [1, 1, 1]), scalar(uniforms, "u_prd04RimStrength", 0)],
    rimParams: [scalar(uniforms, "u_prd04RimPower", 3), 0, 0, 0],
    lights: Array.from({ length: 96 }, (_, index) => lights.slice(index * 4, index * 4 + 4))
  });
}
