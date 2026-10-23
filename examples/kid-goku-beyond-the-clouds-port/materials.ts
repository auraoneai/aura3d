/** `material.custom` specs and the look constants (sky, haze, light) for the Cloud Runner. */
import type { material } from "@aura3d/engine";
import { BALL_FRAGMENT, BALL_VERTEX, SCENERY_FRAGMENT, SCENERY_VERTEX, WARN_FRAGMENT, WARN_VERTEX, SHADOW_FRAGMENT, GLOW_FRAGMENT, GLOW_VERTEX, PUFF_FRAGMENT, SKY_FRAGMENT, SKY_VERTEX, VALLEY_FRAGMENT, VALLEY_VERTEX, WATER_FRAGMENT, WATER_VERTEX } from "./shaders";

export type CustomSpec = Parameters<typeof material.custom>[0];
type Rgb = readonly [number, number, number];

const lin = (r: number, g: number, b: number): Rgb => [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];
/** Authored as display (sRGB-ish) colours and converted to the linear values custom shaders return. */
export const LOOK = {
  haze: lin(0.66, 0.79, 0.91),
  fogHex: "#a8c9e8",
  fogDensity: 0.0026,
  sunDir: [0.5, 0.42, -0.76] as Rgb,
  sunLight: [0.46, 0.8, 0.4] as Rgb,
  sunHex: "#fff0cf",
  skyTop: lin(0.12, 0.38, 0.8),
  skyMid: lin(0.3, 0.6, 0.92),
  skyHorizon: lin(0.78, 0.89, 0.96),
  cloudLight: lin(1.0, 0.98, 0.94),
  cloudShade: lin(0.62, 0.68, 0.84),
  sunTint: [0.9, 0.55, 0.22] as Rgb
};

export const skySpec = (): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  uniforms: {
    skyTop: { type: "vec3", value: [...LOOK.skyTop] }, skyMid: { type: "vec3", value: [...LOOK.skyMid] }, skyHorizon: { type: "vec3", value: [...LOOK.skyHorizon] },
    cloudLight: { type: "vec3", value: [...LOOK.cloudLight] }, cloudShade: { type: "vec3", value: [...LOOK.cloudShade] },
    sunDir: { type: "vec3", value: [...LOOK.sunDir] }, sunTint: { type: "vec3", value: [...LOOK.sunTint] },
    hazeColor: { type: "vec3", value: [...LOOK.haze] }, cloudPhase: { type: "f32", value: 0 }
  },
  side: "double",
  depthWrite: false
});

export const valleySpec = (): CustomSpec => ({
  glsl: { vertex: VALLEY_VERTEX, fragment: VALLEY_FRAGMENT },
  uniforms: { hazeColor: { type: "vec3", value: [...LOOK.haze] }, fogDensity: { type: "f32", value: 0.0011 }, cloudPhase: { type: "f32", value: 0 } },
  side: "double"
});

export const waterSpec = (): CustomSpec => ({
  glsl: { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT },
  uniforms: { hazeColor: { type: "vec3", value: [...LOOK.haze] }, fogDensity: { type: "f32", value: LOOK.fogDensity }, tClock: { type: "f32", value: 0 } },
  side: "double",
  transparent: true,
  depthWrite: false
});

export const ballSpec = (stars: number): CustomSpec => ({
  glsl: { vertex: BALL_VERTEX, fragment: BALL_FRAGMENT },
  uniforms: { ballStars: { type: "f32", value: stars }, ballGlow: { type: "f32", value: 1 } }
});

const glowUniforms = { pixelRatio: { type: "f32" as const, value: 1 }, pointScale: { type: "f32" as const, value: 420 }, pointCap: { type: "f32" as const, value: 120 }, sparkle: { type: "f32" as const, value: 1 } };
export const glowSpec = (): CustomSpec => ({
  glsl: { vertex: GLOW_VERTEX, fragment: GLOW_FRAGMENT },
  uniforms: { ...glowUniforms },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});
export const puffSpec = (): CustomSpec => ({
  glsl: { vertex: GLOW_VERTEX, fragment: PUFF_FRAGMENT },
  uniforms: { pixelRatio: { type: "f32", value: 1 }, pointScale: { type: "f32", value: 420 }, pointCap: { type: "f32", value: 160 } },
  transparent: true,
  depthWrite: false
});

export interface SceneryOptions { map?: unknown; mapMix?: number; mapScale?: number; opacity?: number; rim?: number; sun?: number; transparent?: boolean }
const SUN_W = (() => { const d = LOOK.sunLight; const l = Math.hypot(d[0], d[1], d[2]); return [d[0] / l, d[1] / l, d[2] / l]; })();
/** Lit scenery driven by a per-vertex `tone` attribute (the geometry must supply it). */
export const scenerySpec = (o: SceneryOptions = {}): CustomSpec => ({
  glsl: { vertex: SCENERY_VERTEX, fragment: SCENERY_FRAGMENT },
  uniforms: {
    sunDirW: { type: "vec3", value: SUN_W }, sunColor: { type: "vec3", value: [1.0, 0.82, 0.58] }, sunStrength: { type: "f32", value: o.sun ?? 1.15 },
    skyFill: { type: "vec3", value: lin(0.5, 0.64, 0.84) as unknown as number[] }, groundFill: { type: "vec3", value: lin(0.5, 0.42, 0.3) as unknown as number[] },
    rimColor: { type: "vec3", value: [1.0, 0.86, 0.6] }, rimStrength: { type: "f32", value: o.rim ?? 0.28 },
    hazeColor: { type: "vec3", value: [...LOOK.haze] }, fogDensity: { type: "f32", value: LOOK.fogDensity },
    mapMix: { type: "f32", value: o.map ? o.mapMix ?? 0.75 : 0 }, mapScale: { type: "f32", value: o.mapScale ?? 1 },
    opacity: { type: "f32", value: o.opacity ?? 1 },
    surfaceMap: { type: "texture2d" as const, ...(o.map ? { value: o.map as never } : {}) }
  },
  side: "double",
  ...(o.transparent ? { transparent: true, depthWrite: false } : {})
});

export const warnSpec = (round: boolean): CustomSpec => ({
  glsl: { vertex: WARN_VERTEX, fragment: WARN_FRAGMENT },
  uniforms: { warnAlpha: { type: "f32", value: 0 }, warnGold: { type: "f32", value: 0 }, warnRound: { type: "f32", value: round ? 1 : 0 }, tClock: { type: "f32", value: 0 } },
  side: "double",
  transparent: true,
  depthWrite: false
});

export const shadowSpec = (): CustomSpec => ({
  glsl: { vertex: WARN_VERTEX, fragment: SHADOW_FRAGMENT },
  uniforms: { shadowAlpha: { type: "f32", value: 0.4 } },
  side: "double",
  transparent: true,
  depthWrite: false
});

export const allProgramSpecs = (): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "sky", spec: skySpec() }, { name: "valley", spec: valleySpec() }, { name: "water", spec: waterSpec() },
  { name: "ball", spec: ballSpec(4) }, { name: "scenery", spec: scenerySpec() }, { name: "warn", spec: warnSpec(false) }, { name: "shadow", spec: shadowSpec() }, { name: "glow", spec: glowSpec() }, { name: "puff", spec: puffSpec() }
];
