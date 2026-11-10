/**
 * `material.custom` specs for the port's surfaces, kept apart from the scene so a unit test can bake and
 * compile exactly what the app draws with. Uniform names never collide with the engine prelude
 * (`time` and friends lower to `u_time`), so every animated uniform has its own name.
 */
import type { material, texture } from "@aura3d/engine";
import {
  AURA_FRAGMENT, BALL_FRAGMENT, BALL_VERTEX, FALLS_FRAGMENT, FALLS_VERTEX, FLAME_FRAGMENT, FLAME_VERTEX, GROUND_FRAGMENT, GROUND_VERTEX, PARTICLE_FRAGMENT,
  PARTICLE_VERTEX, SKY_FRAGMENT, SKY_VERTEX, SLASH_FRAGMENT, SLASH_VERTEX, SOLID_FRAGMENT, SOLID_VERTEX, SPARKS_FRAGMENT, SPARKS_VERTEX, THREAT_FRAGMENT,
  THREAT_VERTEX, WATER_FRAGMENT, WATER_VERTEX
} from "./shaders";
import {
  AURA_FRAGMENT_WGSL, BALL_FRAGMENT_WGSL, BALL_VERTEX_WGSL, FALLS_FRAGMENT_WGSL, FALLS_VERTEX_WGSL, FLAME_FRAGMENT_WGSL, FLAME_VERTEX_WGSL, GROUND_FRAGMENT_WGSL,
  GROUND_VERTEX_WGSL, PARTICLE_FRAGMENT_WGSL, PARTICLE_VERTEX_WGSL, SKY_FRAGMENT_WGSL, SKY_VERTEX_WGSL, SLASH_FRAGMENT_WGSL, SLASH_VERTEX_WGSL, SOLID_FRAGMENT_WGSL,
  SOLID_VERTEX_WGSL, SPARKS_FRAGMENT_WGSL, SPARKS_VERTEX_WGSL, THREAT_FRAGMENT_WGSL, THREAT_VERTEX_WGSL, WATER_FRAGMENT_WGSL, WATER_VERTEX_WGSL
} from "./shaders-wgsl";
import type { Rgb } from "./palette";
import { ORIGINAL_SKY } from "./districtLook";

export type CustomSpec = Parameters<typeof material.custom>[0];
export type TextureHandle = ReturnType<typeof texture.canvas>;

const fog = { fogMix: { type: "f32" as const, value: 0 } };

export const groundSpec = (): CustomSpec => ({ glsl: { vertex: GROUND_VERTEX, fragment: GROUND_FRAGMENT }, wgsl: { vertex: GROUND_VERTEX_WGSL, fragment: GROUND_FRAGMENT_WGSL }, uniforms: { ...fog }, side: "double" });

export interface SolidOptions { readonly glow?: number; readonly glowColor?: Rgb; readonly alpha?: number }

export const solidSpec = (base: Rgb, options: SolidOptions = {}): CustomSpec => ({
  glsl: { vertex: SOLID_VERTEX, fragment: SOLID_FRAGMENT },
  wgsl: { vertex: SOLID_VERTEX_WGSL, fragment: SOLID_FRAGMENT_WGSL },
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
  wgsl: { vertex: SKY_VERTEX_WGSL, fragment: SKY_FRAGMENT_WGSL },
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
  wgsl: { vertex: WATER_VERTEX_WGSL, fragment: WATER_FRAGMENT_WGSL },
  uniforms: {
    waterTime: { type: "f32", value: 0 },
    waterSky: { type: "f32", value: 0 },
    waterLake: { type: "f32", value: 0 },
    waterZenith: { type: "color3", value: [...ORIGINAL_SKY.skyZenith] },
    waterHorizon: { type: "color3", value: [...ORIGINAL_SKY.skyHorizon] },
    waterKey: { type: "vec3", value: [-0.5, 0.8, 0.3] }
  },
  transparent: true,
  depthWrite: false,
  side: "double"
});

export const fallsSpec = (soft = 0): CustomSpec => ({
  glsl: { vertex: FALLS_VERTEX, fragment: FALLS_FRAGMENT },
  wgsl: { vertex: FALLS_VERTEX_WGSL, fragment: FALLS_FRAGMENT_WGSL },
  uniforms: { fallsTime: { type: "f32", value: 0 }, fallsSoft: { type: "f32", value: soft } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

export const ballSpec = (): CustomSpec => ({
  glsl: { vertex: BALL_VERTEX, fragment: BALL_FRAGMENT },
  wgsl: { vertex: BALL_VERTEX_WGSL, fragment: BALL_FRAGMENT_WGSL },
  uniforms: { ballTime: { type: "f32", value: 0 }, ballOpacity: { type: "f32", value: 1 } },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

export const auraSpec = (): CustomSpec => ({
  glsl: { vertex: BALL_VERTEX, fragment: AURA_FRAGMENT },
  wgsl: { vertex: BALL_VERTEX_WGSL, fragment: AURA_FRAGMENT_WGSL },
  uniforms: { auraTime: { type: "f32", value: 0 }, auraStrength: { type: "f32", value: 0 }, auraColor: { type: "color3", value: [1, 0.55, 0.15] } },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

export const sparksSpec = (): CustomSpec => ({
  glsl: { vertex: SPARKS_VERTEX, fragment: SPARKS_FRAGMENT },
  wgsl: { vertex: SPARKS_VERTEX_WGSL, fragment: SPARKS_FRAGMENT_WGSL },
  uniforms: { sparkTime: { type: "f32", value: 0 }, sparkStrength: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

export const flameSpec = (map: TextureHandle): CustomSpec => ({
  glsl: { vertex: FLAME_VERTEX, fragment: FLAME_FRAGMENT },
  wgsl: { vertex: FLAME_VERTEX_WGSL, fragment: FLAME_FRAGMENT_WGSL },
  uniforms: { flameMap: { type: "texture2d", value: map }, flameTime: { type: "f32", value: 0 }, runnerS: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false
});

export const particleSpec = (): CustomSpec => ({
  glsl: { vertex: PARTICLE_VERTEX, fragment: PARTICLE_FRAGMENT },
  wgsl: { vertex: PARTICLE_VERTEX_WGSL, fragment: PARTICLE_FRAGMENT_WGSL },
  uniforms: { pixelRatio: { type: "f32", value: 1 } },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

export const slashSpec = (): CustomSpec => ({
  glsl: { vertex: SLASH_VERTEX, fragment: SLASH_FRAGMENT },
  wgsl: { vertex: SLASH_VERTEX_WGSL, fragment: SLASH_FRAGMENT_WGSL },
  uniforms: {
    slashTime: { type: "f32", value: 0 },
    slashProgress: { type: "f32", value: 0 },
    slashEdge: { type: "color3", value: [0.92, 0.97, 1.0] },
    slashInk: { type: "color3", value: [0.16, 0.34, 0.68] }
  },
  transparent: true,
  depthWrite: false,
  side: "double",
  blending: "additive"
});

export const threatRingSpec = (): CustomSpec => ({
  glsl: { vertex: THREAT_VERTEX, fragment: THREAT_FRAGMENT },
  wgsl: { vertex: THREAT_VERTEX_WGSL, fragment: THREAT_FRAGMENT_WGSL },
  uniforms: {
    glow: { type: "f32", value: 0.8 },
    ringTime: { type: "f32", value: 0 },
    ringColor: { type: "color3", value: [0.92, 0.22, 0.14] },
    inkColor: { type: "color3", value: [0.08, 0.10, 0.18] }
  },
  transparent: true,
  depthWrite: false,
  side: "double"
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
  { name: "particles", spec: particleSpec() },
  { name: "slash", spec: slashSpec() },
  { name: "threat-ring", spec: threatRingSpec() }
];
