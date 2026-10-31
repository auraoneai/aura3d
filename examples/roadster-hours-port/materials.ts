/** `material.custom` specs for the port's surfaces, apart from the scene so a unit test can compile exactly what the app draws. */
import type { material } from "@aura3d/engine";
import type { Look } from "./look";
import { DETAIL_ASSETS, DETAIL_TILES } from "./art/detail";
import { SPRAY_FRAGMENT, SPRAY_VERTEX, SPRAY_WINDOW, sprayAmount, sprayWind } from "./art/spray";
import {
  BEAM_FRAGMENT, BEAM_VERTEX, BLOB_FRAGMENT, CITY_FRAGMENT, PLUME_FRAGMENT, PLUME_VERTEX, RAMP_FRAGMENT, ROAD_FRAGMENT, ROAD_VERTEX, SKY_FRAGMENT, SKY_VERTEX, SOLID_FRAGMENT, SOLID_VERTEX, TERRAIN_FRAGMENT, TERRAIN_VERTEX, TOWER_FRAGMENT, TOWN_FRAGMENT, TOWN_VERTEX, WATER_FRAGMENT, WATER_VERTEX
} from "./shaders";

export type CustomSpec = Parameters<typeof material.custom>[0];
export type Rgb = readonly [number, number, number];

export interface FogLook { readonly fogColor: Rgb; readonly fogNear: number; readonly fogFar: number }

const c3 = (value: Rgb) => ({ type: "color3" as const, value: [...value] as [number, number, number] });
const f32 = (value: number) => ({ type: "f32" as const, value });
const v2 = (value: readonly [number, number]) => ({ type: "vec2" as const, value: [...value] as [number, number] });
const v3 = (value: readonly [number, number, number]) => ({ type: "vec3" as const, value: [...value] as [number, number, number] });

/** The uniforms every lit program reads (see `ATMOS` in shaders.ts). */
export const atmosphereUniforms = (look: Look) => ({
  sunDir: v3(look.sunDir), sunColor: c3(look.sunColor), zenithColor: c3(look.zenith), horizonColor: c3(look.horizon),
  ambSky: c3(look.ambSky), ambGround: c3(look.ambGround), nightAmt: f32(look.night), fogNear: f32(look.fogNear), fogFar: f32(look.fogFar)
});

/** RH47-10: the detail strength of a look (0 on `?look=original`, which keeps today's procedural-only surfaces). */
export const detailAmount = (look: Look): number => look.row?.surfaces.detail.amount ?? 0;
/** RH47-10: the rock detail set of a look (sandstone on Redline, limestone elsewhere and on the original look). */
export const rockDetailKey = (look: Look): "limestone" | "sandstone" => look.row?.surfaces.detail.rock ?? "limestone";

export const roadSpec = (look: Look, line: Rgb, glow: Rgb): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: ROAD_VERTEX, fragment: ROAD_FRAGMENT },
  uniforms: {
    asphalt: c3(look.asphalt), lineColor: c3(line), glowColor: c3(glow), roadGloss: f32(look.roadGloss),
    carPos: v3([0, -1000, 0]), carDir: { type: "vec2" as const, value: [0, -1] as [number, number] }, beamAmt: f32(look.beam),
    tailAmt: f32(look.row ? look.row.surfaces.tail : 0.25), tailSoft: f32(look.row ? 1 : 0),
    roadDetail: { type: "texture2d" as const, value: DETAIL_ASSETS.asphalt }, detailAmt: f32(detailAmount(look)), detailTiles: v2(DETAIL_TILES.road),
    ...atmosphereUniforms(look)
  },
  side: "double"
});


export const waterSpec = (look: Look): CustomSpec => ({
  glsl: { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT },
  uniforms: { deepWater: c3(look.deepWater), shallowWater: c3(look.shallowWater), whitecaps: f32(look.whitecaps), windVec: v2(look.wind), ...atmosphereUniforms(look) },
  side: "double"
});

/** GU47 RH47-06: Halo's city carpet below the skyway (same plane and vertex stage as the water). */
export const citySpec = (look: Look, gain = 1): CustomSpec => ({
  glsl: { vertex: WATER_VERTEX, fragment: CITY_FRAGMENT },
  uniforms: { cityGain: f32(gain), ...atmosphereUniforms(look) },
  side: "double"
});

export const skySpec = (look: Look): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  uniforms: {
    cloudAmt: f32(look.cloudAmount), mountainAmt: f32(look.style === "coast" ? 1 : 0),
    cloudHigh: f32(look.cloudHigh), windVec: v2(look.wind), bandColor: c3(look.band), bandAmt: f32(look.bandAmount),
    bandSide: f32(look.style === "skyway" ? 0 : 1), seaSign: f32(look.seaSide),
    ...atmosphereUniforms(look)
  },
  side: "double",
  depthWrite: false
});

/** RH47-06: shoreline foam strength (the route's whitecaps; 0 on Halo's city carpet and on `?look=original`). */
export const surfAmount = (look: Look): number => (look.row && !look.cityCarpet ? look.whitecaps : 0);
/** RH47-06: foam surge speed; reduced motion slows the wash to 30%. */
export const surfSpeedFor = (reducedMotion: boolean): number => (reducedMotion ? 0.3 : 1);

export const terrainSpec = (look: Look): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: TERRAIN_VERTEX, fragment: TERRAIN_FRAGMENT },
  uniforms: {
    rockA: c3(look.rockA), rockB: c3(look.rockB), grass: c3(look.grass), sand: c3(look.sand),
    rockDetail: { type: "texture2d" as const, value: DETAIL_ASSETS[rockDetailKey(look)] }, detailAmt: f32(detailAmount(look)), detailTiles: v2(DETAIL_TILES.rock),
    surfAmt: f32(surfAmount(look)), surfSpeed: f32(surfSpeedFor(false)),
    ...atmosphereUniforms(look)
  },
  side: "double"
});

export const towerSpec = (look: Look): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: SOLID_VERTEX, fragment: TOWER_FRAGMENT },
  uniforms: { ...atmosphereUniforms(look) },
  side: "double"
});

export const beamSpec = (gain: number): CustomSpec => ({
  glsl: { vertex: BEAM_VERTEX, fragment: BEAM_FRAGMENT },
  uniforms: { beamColor: c3([1, 0.93, 0.78]), beamGain: f32(gain) },
  side: "double",
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

/** GU47 RH47-03: the roadster's contact blob (alpha blended, no depth write, drawn on the road under the car). */
export const blobSpec = (strength = 0.55): CustomSpec => ({
  glsl: { vertex: BEAM_VERTEX, fragment: BLOB_FRAGMENT },
  uniforms: { blobFade: f32(1), blobStrength: f32(strength) },
  side: "double",
  transparent: true,
  depthWrite: false
});

/** Contact-blob opacity for a ride height `h` (metres above the road): 1 on the ground, 0 from 4 m up (RH47-03). */
export const blobFadeFor = (h: number): number => Math.max(0, Math.min(1, 1 - h / 4)) ** 1.5;

export const rampSpec = (look: Look, glow: Rgb): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: ROAD_VERTEX, fragment: RAMP_FRAGMENT },
  uniforms: { glowColor: c3(glow), ...atmosphereUniforms(look) },
  side: "double"
});

export const townSpec = (look: Look): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: TOWN_VERTEX, fragment: TOWN_FRAGMENT },
  uniforms: { ...atmosphereUniforms(look) },
  side: "double"
});

export interface PlumeStyle {
  readonly color: Rgb; readonly alpha: number; readonly life: readonly [number, number]; readonly size: readonly [number, number];
  readonly width: number; readonly spread: number; readonly lift: number; readonly trail: number; readonly glow: number; readonly additive: boolean;
}

export const plumeSpec = (style: PlumeStyle): CustomSpec => ({
  glsl: { vertex: PLUME_VERTEX, fragment: PLUME_FRAGMENT },
  uniforms: {
    ptPos: v3([0, -1000, 0]), ptBack: v3([0, 0, 1]), ptSpeed: f32(0), ptAmount: f32(0),
    ptLife: { type: "vec2" as const, value: [...style.life] as [number, number] }, ptSize: { type: "vec2" as const, value: [...style.size] as [number, number] },
    ptWidth: f32(style.width), ptSpread: f32(style.spread), ptLift: f32(style.lift), ptTrail: f32(style.trail), ptGlow: f32(style.glow), ptColor: c3(style.color)
  },
  side: "double",
  transparent: true,
  depthWrite: false,
  ...(style.additive ? { blending: "additive" as const } : {})
});

/** `spangle` (0..1, GU47 RH47-10) adds the galvanised crystal pattern; the guardrails use it on the GU47 look. */
export const solidSpec = (look: Look, base: Rgb, glow: Rgb, glowAmount: number, rough = 0.55, metal = 0, spangle = 0): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: SOLID_VERTEX, fragment: SOLID_FRAGMENT },
  uniforms: {
    baseColor: c3(base), glowColor: c3(glow), glowAmount: f32(glowAmount), surfaceRough: f32(rough), surfaceMetal: f32(metal), spangle: f32(spangle),
    ...atmosphereUniforms(look)
  },
  side: "double"
});

/** GU47 RH47-12: the crosswind spray sheets (signature); null on `?look=original`. */
export const spraySpec = (look: Look, halfWidth: number, reducedMotion = false): CustomSpec | null => {
  const spray = look.row?.spray;
  if (!spray) return null;
  const hex = parseInt(spray.color.slice(1), 16);
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const color: Rgb = [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
  return {
    glsl: { vertex: SPRAY_VERTEX, fragment: SPRAY_FRAGMENT },
    uniforms: {
      spOrigin: v3([0, -1000, 0]), spAlong: v3([0, 0, -1]), spAcross: v3([1, 0, 0]),
      spWindow: v2(SPRAY_WINDOW), spHalfWidth: f32(halfWidth), spSeaSign: f32(look.seaSide),
      spWind: f32(sprayWind(spray, reducedMotion)), spAmount: f32(sprayAmount(spray, { reducedMotion })), spAlpha: f32(spray.alpha),
      spHeight: v2(spray.height), spSize: v2(spray.size), spColor: c3(color)
    },
    side: "double",
    transparent: true,
    depthWrite: false
  };
};

/** One of each distinct program the scene uses. */
export const allProgramSpecs = (look: Look): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "road", spec: roadSpec(look, [0.9, 0.9, 0.85], [0.2, 0.8, 0.9]) },
  { name: "water", spec: waterSpec(look) },
  { name: "city", spec: citySpec(look) },
  { name: "sky", spec: skySpec(look) },
  { name: "terrain", spec: terrainSpec(look) },
  { name: "solid", spec: solidSpec(look, [0.6, 0.6, 0.65], [0.1, 0.8, 0.9], 0) },
  { name: "solid-glow", spec: solidSpec(look, [0.2, 0.8, 0.9], [0.2, 0.9, 1.0], 1.4) },
  { name: "tower", spec: towerSpec(look) },
  { name: "ramp", spec: rampSpec(look, [0.2, 0.8, 0.9]) },
  { name: "town", spec: townSpec(look) },
  { name: "plume-dust", spec: plumeSpec({ color: [0.78, 0.76, 0.72], alpha: 1, life: [0.9, 1.8], size: [0.7, 3.4], width: 1.6, spread: 1.4, lift: 1.1, trail: 0.85, glow: 0, additive: false }) },
  { name: "plume-sparks", spec: plumeSpec({ color: [1, 0.6, 0.2], alpha: 1, life: [0.25, 0.55], size: [0.18, 0.05], width: 0.5, spread: 1.2, lift: 0.6, trail: 0.6, glow: 1, additive: true }) },
  { name: "beam", spec: beamSpec(look.beam * 0.2) },
  { name: "blob", spec: blobSpec() },
  ...(look.row ? [{ name: "spray", spec: spraySpec(look, 11)! }] : []),
  { name: "rail-metal", spec: solidSpec(look, [0.7, 0.72, 0.75], [0, 0, 0], 0, 0.35, 0.9, look.row ? 1 : 0) }
];
