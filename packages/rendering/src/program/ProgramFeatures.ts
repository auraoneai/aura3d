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

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/** Fill every ProgramFeatures field with canonical defaults; strips undefined leaves. */
export function normalizeProgramFeatures(features: Partial<ProgramFeatures> | undefined): ProgramFeatures {
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
  ["emissive", "USE_EMISSIVE_MAP"]
];

export function mapUvSet(slot: TextureSlotFeature | undefined): 0 | 1 {
  return slot?.uvSet ?? 0;
}
