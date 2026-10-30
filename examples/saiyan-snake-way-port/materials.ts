/**
 * `material.custom` specs for the port's surfaces, kept apart from the scene so a unit test can bake
 * and compile exactly what the app draws with.
 */
import type { material } from "@aura3d/engine";
import { ORIGINAL_SUN_DIR, STAGE_LOOK, linearOf } from "./art/colorScript";
import {
  AURA_FRAGMENT, AURA_VERTEX, BLOB_FRAGMENT, BLOB_VERTEX, FLAG_INSTANCED_FRAGMENT, FLAG_INSTANCED_VERTEX, ISLAND_INSTANCED_FRAGMENT, ISLAND_INSTANCED_VERTEX, FLAT_FRAGMENT, FLAT_VERTEX, GLOW_FRAGMENT, GLOW_INSTANCED_FRAGMENT, GLOW_INSTANCED_VERTEX, GLOW_VERTEX,
  ROAD_FRAGMENT, ROAD_VERTEX, SKY_FRAGMENT, SKY_VERTEX, SOLID_FRAGMENT, SOLID_VERTEX
} from "./shaders";

/**
 * GU47 SSR-01: colour-script uniforms shared by the road and sky. The defaults are the pre-GU47 constants with
 * `lookMode` 0, so a spec renders today's look until world.ts writes the stage look (`?look=original` keeps it).
 */
export const lookUniforms = () => ({
  lookMode: { type: "f32" as const, value: 0 },
  lookSunDir: { type: "vec3" as const, value: [...ORIGINAL_SUN_DIR] },
  lookSunColor: { type: "color3" as const, value: [1, 0.82, 0.9] },
  lookFogColor: { type: "color3" as const, value: [0.8, 0.62, 0.8] },
  lookFogNear: { type: "f32" as const, value: 430 },
  lookFogFar: { type: "f32" as const, value: 1010 },
  lookHemiSky: { type: "color3" as const, value: [1, 0.93, 0.9] },
  lookHemiGround: { type: "color3" as const, value: [0.62, 0.52, 0.5] }
});

/** World height of the cloud deck's base (the sky shader marches up to 55 m above it). */
export const DECK_BASE = -115;

export type CustomSpec = Parameters<typeof material.custom>[0];
export type Rgb = readonly [number, number, number];

/** sRGB integer (the original's `J.*` hex values) to the linear RGB the engine encodes on output. */
export function hexLinear(hex: number): Rgb {
  const lin = (c: number): number => {
    const s = c / 255;
    return s < 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [lin((hex >> 16) & 255), lin((hex >> 8) & 255), lin(hex & 255)];
}

/** The original's palette entries the port uses (`J`). */
export const PALETTE = {
  roadTop: 16184319, roadDark: 14472943, joint: 10130352, scale: 14999799, skyHigh: 7747764, skyMid: 11040728, skyLow: 14469618,
  cloud: 16241733, cloudLit: 16774832, cloudDark: 14260766, gi: 12866845, giDark: 9386514, teal: 2062962, skin: 15777930, hair: 1314573,
  aura: 16722458, auraLit: 16765088, auraCore: 16773328, ki: 3586559, kiCore: 14677247, spirit: 14676223, jade: 4168810, gold: 14395450,
  hazard: 2068360, hazardLit: 7336136, bone: 15920888, lacquer: 10234658, lacquerDark: 6953493
} as const;

export const solidSpec = (base: Rgb, glow: Rgb = [0, 0, 0], glowAmount = 0, extra: { transparent?: boolean; depthWrite?: boolean } = {}): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: SOLID_VERTEX, fragment: SOLID_FRAGMENT },
  uniforms: {
    baseColor: { type: "color3", value: [...base] },
    glowColor: { type: "color3", value: [...glow] },
    glow: { type: "f32", value: glowAmount }
  },
  side: "double",
  ...extra
});

export const glowSpec = (core: Rgb, shell: Rgb, alpha = 1, hollow = 0): CustomSpec => ({
  glsl: { vertex: GLOW_VERTEX, fragment: GLOW_FRAGMENT },
  uniforms: { glowCore: { type: "color3", value: [...core] }, glowShell: { type: "color3", value: [...shell] }, glowAlpha: { type: "f32", value: alpha }, glowHollow: { type: "f32", value: hollow } },
  side: "double",
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

/** GU47 SSR-18: `glowSpec` for an instanced node; `tint` 1 reads the shell colour from the instance colour; `hdr` scales the core (SSR-09). */
export const glowInstancedSpec = (core: Rgb, shell: Rgb, alpha = 1, hollow = 0, tint = 0, hdr = 2.2): CustomSpec => ({
  glsl: { vertex: GLOW_INSTANCED_VERTEX, fragment: GLOW_INSTANCED_FRAGMENT },
  uniforms: {
    glowCore: { type: "color3", value: [...core] }, glowShell: { type: "color3", value: [...shell] }, glowAlpha: { type: "f32", value: alpha },
    glowHollow: { type: "f32", value: hollow }, glowTint: { type: "f32", value: tint }, glowHdr: { type: "f32", value: hdr }
  },
  side: "double",
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

/** GU47 SSR-11: instanced spire islands for the mid / far parallax bands (instance colour .r = extra fog). */
export const islandInstancedSpec = (): CustomSpec => ({
  glsl: { vertex: ISLAND_INSTANCED_VERTEX, fragment: ISLAND_INSTANCED_FRAGMENT },
  uniforms: {
    islandLit: { type: "color3", value: [...hexLinear(0xc89a8a)] },
    islandDark: { type: "color3", value: [...hexLinear(0x2a1c3a)] },
    islandSunDir: { type: "vec3", value: [...ORIGINAL_SUN_DIR] },
    islandSunColor: { type: "color3", value: [1, 0.8, 0.6] },
    islandFogColor: { type: "color3", value: [0.8, 0.62, 0.8] }
  }
});

/** GU47 SSR-11: instanced prayer-flag cloth (colour per instance). */
export const flagInstancedSpec = (): CustomSpec => ({
  glsl: { vertex: FLAG_INSTANCED_VERTEX, fragment: FLAG_INSTANCED_FRAGMENT },
  uniforms: {
    flagTime: { type: "f32", value: 0 },
    flagSunDir: { type: "vec3", value: [...ORIGINAL_SUN_DIR] },
    flagSunColor: { type: "color3", value: [1, 0.8, 0.6] },
    flagFogColor: { type: "color3", value: [0.8, 0.62, 0.8] }
  },
  side: "double"
});

export const roadSpec = (): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: ROAD_VERTEX, fragment: ROAD_FRAGMENT },
  uniforms: {
    roadTop: { type: "color3", value: [...hexLinear(PALETTE.roadTop)] },
    roadDark: { type: "color3", value: [...hexLinear(PALETTE.roadDark)] },
    jointColor: { type: "color3", value: [...hexLinear(PALETTE.joint)] },
    scaleColor: { type: "color3", value: [...hexLinear(PALETTE.scale)] },
    /** Road distance `s` of the next missing plate and the 0..1 strength of its edge warning (hud.ts `gapAhead`). */
    gapAt: { type: "f32", value: -1e6 },
    gapWarn: { type: "f32", value: 0 },
    ...lookUniforms(),
    /** GU47 SSR-08 per-stage scale tints (rose row by default; used only when lookMode is 1) and the spine wave clock. */
    roadPearl: { type: "color3", value: [...linearOf(STAGE_LOOK[0]!.road.pearl)] },
    roadJade: { type: "color3", value: [...linearOf(STAGE_LOOK[0]!.road.jade)] },
    roadSpine: { type: "color3", value: [...linearOf(STAGE_LOOK[0]!.road.spine)] },
    roadBelly: { type: "color3", value: [...linearOf(STAGE_LOOK[0]!.road.belly)] },
    roadTime: { type: "f32", value: 0 }
  },
  side: "double"
});

export const flatSpec = (color: Rgb, alpha: number): CustomSpec => ({
  glsl: { vertex: FLAT_VERTEX, fragment: FLAT_FRAGMENT },
  uniforms: { flatColor: { type: "color3", value: [...color] }, flatAlpha: { type: "f32", value: alpha } },
  side: "double",
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

export const blobSpec = (radius: number, alpha: number): CustomSpec => ({
  glsl: { vertex: BLOB_VERTEX, fragment: BLOB_FRAGMENT },
  uniforms: { blobRadius: { type: "f32", value: radius }, blobAlpha: { type: "f32", value: alpha } },
  side: "double",
  transparent: true,
  depthWrite: false
});

export const auraSpec = (hot: Rgb, mid: Rgb, edge: Rgb, solid: number): CustomSpec => ({
  glsl: { vertex: AURA_VERTEX, fragment: AURA_FRAGMENT },
  uniforms: {
    auraTime: { type: "f32", value: 0 },
    auraIntensity: { type: "f32", value: 0 },
    auraSolid: { type: "f32", value: solid },
    auraFlank: { type: "f32", value: 1 },
    auraSheath: { type: "f32", value: 0 },
    auraHot: { type: "color3", value: [...hot] },
    auraMid: { type: "color3", value: [...mid] },
    auraEdge: { type: "color3", value: [...edge] }
  },
  side: "double",
  transparent: true,
  depthWrite: false
});

export const skySpec = (): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  uniforms: {
    skyHi: { type: "color3", value: [...hexLinear(PALETTE.skyHigh)] },
    skyMid: { type: "color3", value: [...hexLinear(PALETTE.skyMid)] },
    skyLo: { type: "color3", value: [...hexLinear(PALETTE.skyLow)] },
    cloudLit: { type: "color3", value: [...hexLinear(PALETTE.cloudLit)] },
    cloudMid: { type: "color3", value: [...hexLinear(PALETTE.cloud)] },
    cloudDark: { type: "color3", value: [...hexLinear(PALETTE.cloudDark)] },
    deckBase: { type: "f32", value: DECK_BASE },
    skyTime: { type: "f32", value: 0 },
    ...lookUniforms(),
    /** GU47 SSR-04 (used only when lookMode is 1). */
    skyBand: { type: "color3", value: [...linearOf(STAGE_LOOK[0]!.sky.band)] },
    skySunDisc: { type: "color3", value: [...linearOf(STAGE_LOOK[0]!.sun.disc)] },
    skyCorona: { type: "f32", value: STAGE_LOOK[0]!.sun.corona },
    skyStars: { type: "f32", value: STAGE_LOOK[0]!.sky.stars },
    skyMoon: { type: "f32", value: 0 }
  },
  side: "double",
  depthWrite: false
});

/** Every distinct program the app draws with, for the GLSL compile test. */
export function allProgramSpecs(): { name: string; spec: CustomSpec }[] {
  const c = hexLinear;
  return [
    { name: "road", spec: roadSpec() },
    { name: "solid", spec: solidSpec(c(PALETTE.gi), c(PALETTE.auraLit), 0.2) },
    { name: "glow", spec: glowSpec(c(PALETTE.kiCore), c(PALETTE.ki)) },
    { name: "flag-instanced", spec: flagInstancedSpec() },
    { name: "island-instanced", spec: islandInstancedSpec() },
    { name: "glow-instanced", spec: glowInstancedSpec(c(PALETTE.kiCore), c(PALETTE.ki), 1, 0, 1) },
    { name: "aura", spec: auraSpec(c(PALETTE.auraCore), c(PALETTE.auraLit), c(PALETTE.aura), 0.8) },
    { name: "sky", spec: skySpec() },
    { name: "flat", spec: flatSpec(c(PALETTE.kiCore), 0.4) },
    { name: "blob", spec: blobSpec(1.6, 0.5) }
  ];
}
