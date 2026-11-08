/**
 * `ProgramFeatures` helpers (PRD-01 §6.4) — canonical feature records.
 *
 * `computeProgramKey` only sorts keys: `{ maps: {} }` and a record missing
 * `maps` produce different keys for the same draw. `normalizeProgramFeatures`
 * fills every field of the frozen C-02 record with canonical defaults and
 * strips `undefined` leaves, so records built anywhere (materials, depth
 * passes, warmup) key identically.
 */

import type { ProgramFeatures, TextureSlotFeature } from "../contracts/program";
import type { ShaderGraphCompileResult } from "./ShaderGraphCompiler";

/** Graph code and layout are structural; live resource values travel separately. */
export type ProgramGraphFeatures = ProgramFeatures & { readonly graph?: ShaderGraphCompileResult };

/**
 * Feature bit (in `ProgramFeatures.features`): this forward program writes straight to the canvas (the direct render
 * path: no post chain, no OutputPass), so it must encode its own output. Set by `ForwardPass` and the warm-up exactly
 * when the frame's output colour space is `srgb`; absent on every HDR/post-chain program, which stay byte-identical.
 */
export const PROGRAM_OUTPUT_SRGB_FEATURE = "a3d.output.srgb";

/** Structural shader switches. Their associated plane, camera and material
 * values are uniforms, not variant keys. */
export const PROGRAM_CLIPPING_FEATURE = "a3d.clipping";
export const PROGRAM_LOG_DEPTH_FEATURE = "a3d.logarithmicDepth";
/**
 * WebGL2 reversed-depth frame: the default (non-hook) fog reads its distance from standard window depth
 * (1 - gl_FragCoord.z). Absent on standard frames, whose programs stay byte-identical.
 */
export const PROGRAM_REVERSED_FOG_DEPTH_FEATURE = "a3d.reversedFogDepth";
export const PROGRAM_TRANSPARENCY_FEATURE = "a3d.transparency";

/** Structural axes for the optional per-frame advanced diffuse sources. */
export const NATIVE_PROBE_GRID_FEATURE = "a3d.nativeProbeGrid";
export const NATIVE_VOXEL_INDIRECT_FEATURE = "a3d.nativeVoxelIndirect";
export const NATIVE_BAKED_LIGHTMAP_FEATURE = "a3d.nativeBakedLightmap";
export const NATIVE_LIGHTMAP_UV_FEATURE = "a3d.nativeLightmapUv";

/** Independent legacy punctual shadow maps, selected only for matching lights. */
export const LEGACY_POINT_SHADOW_FEATURE = "a3d.legacyPointShadow";
export const LEGACY_SPOT_SHADOW_FEATURE = "a3d.legacySpotShadow";

/** Per-selected-light measured Type-C candela profiles, supplied by a frame-owned atlas. */
export const PHOTOMETRIC_PROFILE_FEATURE = "a3d.photometricProfile";

/** One frame-admitted projected image on a selected, non-clustered spot light. */
export const PROJECTED_SPOT_FEATURE = "a3d.projectedSpot";

/**
 * A forward program writes a separate, depth-matched coverage attachment.
 * This is distinct from output background coverage: a device must still prove
 * that the paired color and depth writes, attachments and frame are compatible.
 */
export const DEPTH_COVERAGE_FEATURE = "a3d.depthCoverage";

/** Return the structural reason this staged variant cannot produce paired coverage. */
export function depthCoverageUnsupportedReason(f: ProgramGraphFeatures): string | null {
  const enabled = f.features[DEPTH_COVERAGE_FEATURE];
  if (enabled === undefined) return null;
  if (enabled !== true) return "the depth coverage feature must be true when present";
  if (f.pass !== "forward" || (f.lighting !== "lit" && f.lighting !== "unlit")) return "only generated forward lighting is supported";
  if (f.backgroundCoverage) return "background coverage uses a different attachment contract";
  if (f.alphaMode !== "opaque" && f.alphaMode !== "mask") return "blended surfaces do not have a matching single surface depth";
  if (f.features[PROGRAM_OUTPUT_SRGB_FEATURE] !== undefined && f.features[PROGRAM_OUTPUT_SRGB_FEATURE] !== false) return "depth coverage requires a linear scene target";
  if (f.features[PROGRAM_LOG_DEPTH_FEATURE] !== undefined && f.features[PROGRAM_LOG_DEPTH_FEATURE] !== false) return "logarithmic fragment depth requires a different reconstruction contract";
  if (f.features[PROGRAM_TRANSPARENCY_FEATURE] !== undefined && f.features[PROGRAM_TRANSPARENCY_FEATURE] !== false) return "weighted transparency uses a different attachment contract";
  if (f.features["prd03.indirectFraction"] !== undefined && f.features["prd03.indirectFraction"] !== false) return "indirect-fraction alpha tags are not premultiplied opacity";
  if (f.features["prd04.transmissionTarget"] !== undefined && f.features["prd04.transmissionTarget"] !== false) return "scene transmission requires a different depth contract";
  if (f.graph) return "custom shader graphs do not provide a depth-coverage contract";
  if (f.drawId) return "batched draw identifiers do not provide a paired-depth contract";
  const unsupportedLobes = new Set(["transmission", "diffuse-transmission", "volume", "dispersion",
    "KHR_materials_transmission", "KHR_materials_diffuse_transmission", "KHR_materials_volume", "KHR_materials_dispersion"]);
  if (f.extensions.some((extension) => unsupportedLobes.has(extension.lobe))) return "transmission and layered materials require a different depth contract";
  return null;
}

export const DEFAULT_SHADOW_RECEIVE: ProgramFeatures["shadows"] = {
  cascades: 0,
  pcfTaps: 1,
  localShadows: 0,
  contact: false
};

export const DEFAULT_LIGHTS: ProgramFeatures["lights"] = {
  dir: 0,
  point: 0,
  spot: 0,
  rect: 0,
  clustered: false,
  hemisphere: false
};

export const DEFAULT_PROGRAM_FEATURES: ProgramFeatures = {
  pass: "forward",
  target: "glsl300es",
  lighting: "unlit",
  maps: {},
  extensions: [],
  alphaMode: "opaque",
  doubleSided: false,
  vertexColors: false,
  flatShading: false,
  lights: DEFAULT_LIGHTS,
  shadows: DEFAULT_SHADOW_RECEIVE,
  environment: "none",
  fog: "none",
  diffuseModel: "lambert",
  specularAntialiasing: false,
  backgroundCoverage: false,
  features: {}
};

/** Removes `undefined` leaves in place. Only called on objects `normalizeProgramFeatures` has just spread into a fresh copy. */
function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const k in value) {
    if (value[k] === undefined) delete value[k];
  }
  return value;
}

/** Fill every ProgramFeatures field with canonical defaults; strips undefined leaves. */
export function normalizeProgramFeatures(features: Partial<ProgramGraphFeatures> | undefined): ProgramGraphFeatures {
  const f = features ?? {};
  const lights = dropUndefined({ ...DEFAULT_LIGHTS, ...(f.lights ?? {}) });
  const shadows = dropUndefined({ ...DEFAULT_SHADOW_RECEIVE, ...(f.shadows ?? {}) });
  return {
    pass: f.pass ?? "forward",
    target: f.target ?? "glsl300es",
    lighting: f.lighting ?? "unlit",
    maps: dropUndefined({ ...(f.maps ?? {}) }) as ProgramFeatures["maps"],
    extensions: f.extensions ?? [],
    alphaMode: f.alphaMode ?? "opaque",
    doubleSided: f.doubleSided ?? false,
    vertexColors: f.vertexColors ?? false,
    flatShading: f.flatShading ?? false,
    skinning: f.skinning,
    morph: f.morph,
    instancing: f.instancing,
    drawId: f.drawId,
    lights,
    shadows,
    environment: f.environment ?? "none",
    fog: f.fog ?? "none",
    diffuseModel: f.diffuseModel ?? "lambert",
    specularAntialiasing: f.specularAntialiasing ?? false,
    backgroundCoverage: f.backgroundCoverage ?? false,
    ...(f.graph ? { graph: f.graph } : {}),
    features: { ...(f.features ?? {}) }
  };
}

/** The light-count keys that bound the unrolled `fragment:lights` loop. */
export function totalLightCount(lights: ProgramFeatures["lights"]): number {
  return lights.dir + lights.point + lights.spot + lights.rect;
}

/** Texture map feature bits → define names, in frozen map order. */
export const MAP_DEFINES: readonly [keyof ProgramFeatures["maps"], string][] = [
  ["baseColor", "USE_BASE_COLOR_MAP"],
  ["normal", "USE_NORMAL_MAP"],
  ["metallicRoughness", "USE_METALLIC_ROUGHNESS_MAP"],
  ["occlusion", "USE_OCCLUSION_MAP"],
  ["emissive", "USE_EMISSIVE_MAP"],
  ["diffuseRoughness", "USE_DIFFUSE_ROUGHNESS_MAP"],
  ["bump", "USE_BUMP_MAP"]
];

export function mapUvSet(slot: TextureSlotFeature | undefined): 0 | 1 {
  return slot?.uvSet ?? 0;
}
