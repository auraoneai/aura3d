/**
 * `material.custom` specs for the port's surfaces, kept apart from the scene so a unit test can bake
 * and compile exactly what the app draws with.
 */
import type { material } from "@aura3d/engine";
import {
  AURA_FRAGMENT, AURA_VERTEX, GLOW_FRAGMENT, GLOW_VERTEX, ROAD_FRAGMENT, ROAD_VERTEX, SKY_FRAGMENT, SKY_VERTEX, SOLID_FRAGMENT, SOLID_VERTEX
} from "./shaders";

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
  glsl: { vertex: SOLID_VERTEX, fragment: SOLID_FRAGMENT },
  uniforms: {
    baseColor: { type: "color3", value: [...base] },
    glowColor: { type: "color3", value: [...glow] },
    glow: { type: "f32", value: glowAmount }
  },
  side: "double",
  ...extra
});

export const glowSpec = (core: Rgb, shell: Rgb): CustomSpec => ({
  glsl: { vertex: GLOW_VERTEX, fragment: GLOW_FRAGMENT },
  uniforms: { glowCore: { type: "color3", value: [...core] }, glowShell: { type: "color3", value: [...shell] } },
  side: "double",
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

export const roadSpec = (): CustomSpec => ({
  glsl: { vertex: ROAD_VERTEX, fragment: ROAD_FRAGMENT },
  uniforms: {
    roadTop: { type: "color3", value: [...hexLinear(PALETTE.roadTop)] },
    roadDark: { type: "color3", value: [...hexLinear(PALETTE.roadDark)] },
    jointColor: { type: "color3", value: [...hexLinear(PALETTE.joint)] },
    scaleColor: { type: "color3", value: [...hexLinear(PALETTE.scale)] }
  },
  side: "double"
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
    deckBase: { type: "f32", value: -115 },
    skyTime: { type: "f32", value: 0 }
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
    { name: "aura", spec: auraSpec(c(PALETTE.auraCore), c(PALETTE.auraLit), c(PALETTE.aura), 0.8) },
    { name: "sky", spec: skySpec() }
  ];
}
