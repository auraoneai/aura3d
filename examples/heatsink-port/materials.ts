/**
 * `material.custom` specs for the port, kept apart from the scene so a unit test can bake and compile exactly what the
 * app draws with. Lighting values come from the Vesper Heights `lighting` block.
 */
import type { material } from "@aura3d/engine";
import { LOOKS, type HeatsinkLookRow } from "./art/look";
import { VESPER } from "./map";
import { BLOB_FRAGMENT, BLOB_VERTEX, POINTS_FRAGMENT, POINTS_VERTEX, ROAD_FRAGMENT, ROAD_VERTEX, SKY_FRAGMENT, SKY_VERTEX, SOLID_FRAGMENT, SOLID_VERTEX, STREAK_FRAGMENT, STREAK_VERTEX, BEACON_FRAGMENT, BEACON_VERTEX, TERRAIN_FRAGMENT, VEIL_FRAGMENT, VEIL_VERTEX, WAKE_FRAGMENT, WAKE_VERTEX } from "./shaders";

export type CustomSpec = Parameters<typeof material.custom>[0];
export type Rgb = readonly [number, number, number];

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** 0xRRGGBB integer (how the map stores its colours) to linear RGB */
export const intLinear = (n: number): Rgb => [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];

const L = VESPER.lighting;
export const SUN_DIR: Rgb = L.sky.sunDir as unknown as Rgb;
export const SUN_COLOR: Rgb = L.sky.sunColor as unknown as Rgb;
const hemi = L.hemi as unknown as { sky: number; ground: number; intensity: number };
export const SKY_AMBIENT: Rgb = intLinear(hemi.sky).map((c) => c * hemi.intensity) as unknown as Rgb;
export const GROUND_AMBIENT: Rgb = intLinear(hemi.ground).map((c) => c * hemi.intensity) as unknown as Rgb;

/** the five uniforms every shader built on COMMON (fog + hemisphere/sun lighting) must author */
/** the map's `atmosphere.low` is the haze colour seen near the ground (teal grey); the per-district `fog` ints are lighter lavender tints the original does not show at ground level */
export const FOG_LOW: Rgb = (VESPER.atmosphere as unknown as { low: Rgb }).low;

/**
 * GU47: the look row every spec below reads (twilight terms in `lit()`, fog, sky, causeway). `buildWorld` sets it before
 * it builds the scene; the default is `original`, so a spec built outside a world is today's program.
 */
let shading: HeatsinkLookRow = LOOKS.original;
export const setShading = (row: HeatsinkLookRow): void => { shading = row; };
export const currentShading = (): HeatsinkLookRow => shading;

export const lightUniforms = (fog: Rgb = shading.fog.color): NonNullable<CustomSpec["uniforms"]> => ({
  fogColor: { type: "color3", value: [...fog] },
  litScale: { type: "f32", value: shading.lit.scale },
  bounceColor: { type: "color3", value: [...shading.lit.bounce] },
  topFill: { type: "color3", value: [...shading.lit.topFill] },
  sunDir: { type: "vec3", value: [...SUN_DIR] },
  sunColor: { type: "color3", value: [...SUN_COLOR] },
  skyAmbient: { type: "color3", value: [...SKY_AMBIENT] },
  groundAmbient: { type: "color3", value: [...GROUND_AMBIENT] },
  /* IC-02 glow pools: explicit zeros (the mat4 default is identity, which would light one pool) */
  poolPos: { type: "mat4", value: new Array<number>(16).fill(0) },
  poolCol: { type: "mat4", value: new Array<number>(16).fill(0) }
});

export const roadSpec = (): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: ROAD_VERTEX, fragment: ROAD_FRAGMENT },
  uniforms: {
    ...lightUniforms(),
    roadAlbedo: { type: "f32", value: shading.lit.roadAlbedo },
    glass: { type: "f32", value: shading.causeway.glass },
    veinHdr: { type: "f32", value: shading.causeway.veinHdr },
    seams: { type: "f32", value: shading.causeway.seams },
    ionSpeed: { type: "f32", value: 0 }
  },
  side: "double"
});

export interface SolidExtra {
  readonly transparent?: boolean;
  readonly blending?: "additive" | "normal";
  readonly depthWrite?: boolean;
}

export const solidSpec = (base: Rgb, glowColor: Rgb = [0, 0, 0], glowAmount = 0, extra: SolidExtra = {}): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: SOLID_VERTEX, fragment: SOLID_FRAGMENT },
  uniforms: {
    ...lightUniforms(),
    baseColor: { type: "color3", value: [...base] },
    glowColor: { type: "color3", value: [...glowColor] },
    glow: { type: "f32", value: glowAmount },
    heat: { type: "f32", value: 0 },
    flash: { type: "f32", value: 0 },
    chase: { type: "f32", value: 0 }
  },
  side: "double",
  ...extra
});

export const veilSpec = (color: Rgb, mode: "gate" | "pad"): CustomSpec => ({
  glsl: { vertex: VEIL_VERTEX, fragment: VEIL_FRAGMENT },
  uniforms: {
    veilColor: { type: "color3", value: [...color] },
    veilPulse: { type: "f32", value: 0 },
    veilMode: { type: "f32", value: mode === "gate" ? 1 : 0 }
  },
  transparent: true,
  depthWrite: false,
  side: "double",
  blending: "additive"
});

const sky = L.sky as unknown as { zenith: Rgb; mid: Rgb; horizon: Rgb; glow: Rgb; moon: { dir: Rgb }; alien: { planet: { dir: Rgb } } };
export const skySpec = (): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  uniforms: {
    ...lightUniforms(),
    zenith: { type: "color3", value: [...sky.zenith] },
    midColor: { type: "color3", value: [...sky.mid] },
    horizon: { type: "color3", value: [...sky.horizon] },
    glowColor: { type: "color3", value: [...sky.glow] },
    planetDir: { type: "vec3", value: [...sky.alien.planet.dir] },
    twilight: { type: "f32", value: shading.sky.twilight },
    planetScale: { type: "f32", value: shading.sky.planetScale },
    auroraGain: { type: "f32", value: shading.sky.aurora },
    bandLow: { type: "color3", value: [...shading.sky.bandLow] },
    bandHigh: { type: "color3", value: [...shading.sky.bandHigh] },
    moonDir: { type: "vec3", value: [...sky.moon.dir] }
  },
  side: "back",
  depthWrite: false
});

/** Hills and plains. `snowLine` is the world height where frost starts on upward faces; `tint` scales the rock colour. */
export const terrainSpec = (snowLine: number, tint: Rgb = [1, 1, 1]): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: SOLID_VERTEX, fragment: TERRAIN_FRAGMENT },
  uniforms: {
    ...lightUniforms(),
    snowLine: { type: "f32", value: snowLine },
    terrainTint: { type: "color3", value: [...tint] }
  },
  side: "double"
});

/** Additive camera-facing speed streaks (a dynamic quad strip rebuilt every frame). */
export const streakSpec = (): CustomSpec => ({
  glsl: { vertex: STREAK_VERTEX, fragment: STREAK_FRAGMENT },
  uniforms: {
    streakColor: { type: "color3", value: [1, 0.82, 0.55] },
    streakAlpha: { type: "f32", value: 0.5 }
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double"
});

export const pointsSpec = (): CustomSpec => ({
  glsl: { vertex: POINTS_VERTEX, fragment: POINTS_FRAGMENT },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

/** the drone's contact shadow: an alpha-blended dark blob drawn over the road (HP-08) */
export const blobSpec = (): CustomSpec => ({
  glsl: { vertex: BLOB_VERTEX, fragment: BLOB_FRAGMENT },
  uniforms: { blobAlpha: { type: "f32", value: 0.5 } },
  transparent: true,
  depthWrite: false,
  blending: "normal",
  side: "double"
});

/** GU47 IC-18: the ion wake ribbon (additive, no depth write) */
export const wakeSpec = (): CustomSpec => ({
  glsl: { vertex: WAKE_VERTEX, fragment: WAKE_FRAGMENT },
  uniforms: { wakeGain: { type: "f32", value: 1.8 } },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double"
});

/** GU47 IC-24 lane beacons (HDR glow above the bloom threshold) */
export const beaconSpec = (): CustomSpec => ({
  glsl: { vertex: BEACON_VERTEX, fragment: BEACON_FRAGMENT },
  uniforms: { ...lightUniforms(), beaconGlow: { type: "f32", value: 1.8 } },
  side: "double"
});

export const allProgramSpecs = (): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  ...withShading(LOOKS.twilight, () => [{ name: "road-twilight", spec: roadSpec() }, { name: "sky-twilight", spec: skySpec() }, { name: "terrain-twilight", spec: terrainSpec(80) }]),
  { name: "road", spec: roadSpec() },
  { name: "solid", spec: solidSpec([0.5, 0.5, 0.5]) },
  { name: "solid-glow", spec: solidSpec([0.5, 0.5, 0.5], [1, 0.8, 0.4], 1.4) },
  { name: "solid-additive", spec: solidSpec([0.5, 0.9, 0.8], [0.5, 0.9, 0.8], 1, { transparent: true, blending: "additive", depthWrite: false }) },
  { name: "veil-gate", spec: veilSpec([0.6, 0.9, 1], "gate") },
  { name: "veil-pad", spec: veilSpec([1, 0.7, 0.2], "pad") },
  { name: "sky", spec: skySpec() },
  { name: "terrain", spec: terrainSpec(80, [1, 1, 1]) },
  { name: "streak", spec: streakSpec() },
  { name: "points", spec: pointsSpec() },
  { name: "blob", spec: blobSpec() },
  { name: "wake", spec: wakeSpec() },
  ...withShading(LOOKS.twilight, () => [{ name: "beacon-twilight", spec: beaconSpec() }])
];

/** builds specs under one look row and restores the previous one (tests bake both looks) */
export function withShading<T>(row: HeatsinkLookRow, build: () => T): T {
  const prev = shading;
  shading = row;
  try { return build(); } finally { shading = prev; }
}
