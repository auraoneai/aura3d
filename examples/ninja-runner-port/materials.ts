/**
 * `material.custom` specs for the port's surfaces, kept apart from the scene so a unit test can bake and
 * compile exactly what the app draws with. Uniform names never collide with the engine prelude
 * (`time` and friends lower to `u_time`), so every animated uniform has its own name.
 */
import type { material, texture } from "@aura3d/engine";
import {
  AURA_FRAGMENT, BALL_FRAGMENT, BALL_VERTEX, FALLS_FRAGMENT, FALLS_VERTEX, FLAME_FRAGMENT, FLAME_VERTEX, GROUND_FRAGMENT, GROUND_VERTEX, PARTICLE_FRAGMENT,
  PARTICLE_VERTEX, SKY_FRAGMENT, SKY_VERTEX, SOLID_FRAGMENT, SOLID_VERTEX, SPARKS_FRAGMENT, SPARKS_VERTEX, WATER_FRAGMENT, WATER_VERTEX
} from "./shaders";
import type { Rgb } from "./palette";
import { ORIGINAL_SKY } from "./districtLook";

export type CustomSpec = Parameters<typeof material.custom>[0];
export type TextureHandle = ReturnType<typeof texture.canvas>;

const fog = { fogMix: { type: "f32" as const, value: 0 } };

export const groundSpec = (): CustomSpec => ({ glsl: { vertex: GROUND_VERTEX, fragment: GROUND_FRAGMENT }, uniforms: { ...fog }, side: "double" });

export interface SolidOptions { readonly glow?: number; readonly glowColor?: Rgb; readonly alpha?: number }

export const solidSpec = (base: Rgb, options: SolidOptions = {}): CustomSpec => ({
  glsl: { vertex: SOLID_VERTEX, fragment: SOLID_FRAGMENT },
  uniforms: {
    baseColor: { type: "color3", value: [...base] },
    glowColor: { type: "color3", value: [...(options.glowColor ?? [0, 0, 0])] },
    glow: { type: "f32", value: options.glow ?? 0 },
    solidAlpha: { type: "f32", value: options.alpha ?? 1 },
    ...fog
  },
  side: "double",
  ...(options.alpha !== undefined && options.alpha < 1 ? { transparent: true, depthWrite: false } : {})
});

/** Sky dome; every default is the original shader constant (`ORIGINAL_SKY`), the evening look drives them per frame. */
export const skySpec = (): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  uniforms: {
    sunDirection: { type: "vec3", value: [...ORIGINAL_SKY.sunDirection] },
    skyZenith: { type: "color3", value: [...ORIGINAL_SKY.skyZenith] },
    skyHorizon: { type: "color3", value: [...ORIGINAL_SKY.skyHorizon] },
    skyGlow: { type: "color3", value: [...ORIGINAL_SKY.skyGlow] },
    skyCloud: { type: "color3", value: [...ORIGINAL_SKY.skyCloud] },
    skyGlowWide: { type: "f32", value: 0 },
    skyStars: { type: "f32", value: ORIGINAL_SKY.stars },
    skyMoon: { type: "f32", value: ORIGINAL_SKY.moon },
    moonDirection: { type: "vec3", value: [0, 1, 0] }
  },
  side: "back",
  depthWrite: false
});

export const waterSpec = (): CustomSpec => ({
  glsl: { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT },
  uniforms: {
    waterTime: { type: "f32", value: 0 },
    waterSky: { type: "f32", value: 0 },
    waterZenith: { type: "color3", value: [...ORIGINAL_SKY.skyZenith] },
    waterHorizon: { type: "color3", value: [...ORIGINAL_SKY.skyHorizon] },
    waterKey: { type: "vec3", value: [-0.5, 0.8, 0.3] }
  },
  transparent: true,
  depthWrite: false,
  side: "double"
});

export const fallsSpec = (): CustomSpec => ({
  glsl: { vertex: FALLS_VERTEX, fragment: FALLS_FRAGMENT },
  uniforms: { fallsTime: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

export const ballSpec = (): CustomSpec => ({
  glsl: { vertex: BALL_VERTEX, fragment: BALL_FRAGMENT },
  uniforms: { ballTime: { type: "f32", value: 0 }, ballOpacity: { type: "f32", value: 1 } },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

export const auraSpec = (): CustomSpec => ({
  glsl: { vertex: BALL_VERTEX, fragment: AURA_FRAGMENT },
  uniforms: { auraTime: { type: "f32", value: 0 }, auraStrength: { type: "f32", value: 0 }, auraColor: { type: "color3", value: [1, 0.55, 0.15] } },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

export const sparksSpec = (): CustomSpec => ({
  glsl: { vertex: SPARKS_VERTEX, fragment: SPARKS_FRAGMENT },
  uniforms: { sparkTime: { type: "f32", value: 0 }, sparkStrength: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

export const flameSpec = (map: TextureHandle): CustomSpec => ({
  glsl: { vertex: FLAME_VERTEX, fragment: FLAME_FRAGMENT },
  uniforms: { flameMap: { type: "texture2d", value: map }, flameTime: { type: "f32", value: 0 }, runnerS: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false
});

export const particleSpec = (): CustomSpec => ({
  glsl: { vertex: PARTICLE_VERTEX, fragment: PARTICLE_FRAGMENT },
  uniforms: { pixelRatio: { type: "f32", value: 1 } },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

/** One of each distinct program the scene draws (the flame needs a texture, so callers pass one in). */
export const allProgramSpecs = (flameMap: TextureHandle): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "ground", spec: groundSpec() },
  { name: "solid", spec: solidSpec([0.5, 0.5, 0.5]) },
  { name: "solid-glow", spec: solidSpec([0.5, 0.4, 0.3], { glow: 1.2, glowColor: [1, 0.5, 0.2], alpha: 0.8 }) },
  { name: "sky", spec: skySpec() },
  { name: "water", spec: waterSpec() },
  { name: "falls", spec: fallsSpec() },
  { name: "ball", spec: ballSpec() },
  { name: "aura", spec: auraSpec() },
  { name: "sparks", spec: sparksSpec() },
  { name: "flame", spec: flameSpec(flameMap) },
  { name: "particles", spec: particleSpec() }
];
