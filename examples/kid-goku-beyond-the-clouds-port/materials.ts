/** `material.custom` specs and the look constants (sky, haze, light) for the Cloud Runner. */
import type { material } from "@aura3d/engine";
import { ACTIVE_LOOK, lookRow, type CumulusLookRow } from "./art/look";
import { BALL_FRAGMENT, BALL_VERTEX, SCENERY_FRAGMENT, SCENERY_SHADOWED_FRAGMENT, SCENERY_VERTEX, WARN_FRAGMENT, WARN_VERTEX, SHADOW_FRAGMENT, GLOW_FRAGMENT, GLOW_QUAD_FRAGMENT, GLOW_VERTEX, PUFF_FRAGMENT, PUFF_QUAD_FRAGMENT, SPRITE_QUAD_VERTEX, PUDDLE_FRAGMENT, PUDDLE_VERTEX, SKY_FRAGMENT, SKY_VERTEX, STORM_SKY_FRAGMENT, VALLEY_FRAGMENT, VALLEY_VERTEX, WATER_FRAGMENT, WATER_VERTEX, WATERFALL_FRAGMENT, WATERFALL_VERTEX } from "./shaders";
import {
  BALL_FRAGMENT_WGSL, BALL_VERTEX_WGSL, GLOW_QUAD_FRAGMENT_WGSL, PUDDLE_FRAGMENT_WGSL, PUFF_QUAD_FRAGMENT_WGSL, SCENERY_FRAGMENT_WGSL, SCENERY_SHADOWED_FRAGMENT_WGSL,
  SCENERY_VERTEX_WGSL, SHADOW_FRAGMENT_WGSL, SKY_FRAGMENT_WGSL, SKY_VERTEX_WGSL, SPRITE_QUAD_VERTEX_WGSL, STORM_SKY_FRAGMENT_WGSL, UV_WORLD_VERTEX_WGSL, VALLEY_FRAGMENT_WGSL,
  VALLEY_VERTEX_WGSL, WARN_FRAGMENT_WGSL, WARN_VERTEX_WGSL, WATER_FRAGMENT_WGSL, WATERFALL_FRAGMENT_WGSL
} from "./shaders-wgsl";

export type CustomSpec = Parameters<typeof material.custom>[0];
type Rgb = readonly [number, number, number];

/** The shader-side constants of one look-table row (art/look.ts): sky, haze, the sky's sun disc and the scenery sun. */
export function lookConstants(row: CumulusLookRow) {
  return {
    haze: row.fog.haze,
    fogHex: row.fog.color,
    fogDensity: row.fog.density,
    /** Sun disc direction in the sky dome. */
    sunDir: row.sky.sunDir as Rgb,
    /** Scenery shader light direction (toward the sun). */
    sunLight: row.scenery.sunDir as Rgb,
    sunHex: row.sun.color,
    skyTop: row.sky.top,
    skyMid: row.sky.mid,
    skyHorizon: row.sky.horizon,
    cloudLight: row.sky.cloudLight,
    cloudShade: row.sky.cloudShade,
    sunTint: row.sky.sunTint
  };
}
/** Today's (4.6) look constants, value for value: the `?look=original` row. */
export const LOOK = lookConstants(lookRow("original"));
/** The constants of the row this page boots with (storm-washed unless `?look=original`). */
export const ACTIVE = lookConstants(ACTIVE_LOOK);
const lin = (r: number, g: number, b: number): Rgb => [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];
void lin;

/** The sky dome. Rows with `sky.rainbow/towers/rain` > 0 get the post-storm fragment (CD-05); the original row keeps its own. */
export const skySpec = (row: CumulusLookRow = ACTIVE_LOOK): CustomSpec => {
  const k = lookConstants(row), storm = row.sky.rainbow > 0 || row.sky.towers > 0 || row.sky.rain > 0;
  return {
  glsl: { vertex: SKY_VERTEX, fragment: storm ? STORM_SKY_FRAGMENT : SKY_FRAGMENT },
  // A3/W6: WebGPU twin (shaders-wgsl.ts); WebGL2 keeps drawing the GLSL.
  wgsl: { vertex: SKY_VERTEX_WGSL, fragment: storm ? STORM_SKY_FRAGMENT_WGSL : SKY_FRAGMENT_WGSL },
  uniforms: {
    skyTop: { type: "vec3", value: [...k.skyTop] }, skyMid: { type: "vec3", value: [...k.skyMid] }, skyHorizon: { type: "vec3", value: [...k.skyHorizon] },
    cloudLight: { type: "vec3", value: [...k.cloudLight] }, cloudShade: { type: "vec3", value: [...k.cloudShade] },
    sunDir: { type: "vec3", value: [...k.sunDir] }, sunTint: { type: "vec3", value: [...k.sunTint] },
    hazeColor: { type: "vec3", value: [...k.haze] }, cloudPhase: { type: "f32", value: 0 },
    ...(storm ? { rainbowStrength: { type: "f32" as const, value: row.sky.rainbow }, towerStrength: { type: "f32" as const, value: row.sky.towers }, rainStrength: { type: "f32" as const, value: row.sky.rain } } : {})
  },
  side: "double",
  depthWrite: false
  };
};

export const valleySpec = (row: CumulusLookRow = ACTIVE_LOOK): CustomSpec => ({
  glsl: { vertex: VALLEY_VERTEX, fragment: VALLEY_FRAGMENT },
  wgsl: { vertex: VALLEY_VERTEX_WGSL, fragment: VALLEY_FRAGMENT_WGSL },
  uniforms: { hazeColor: { type: "vec3", value: [...row.fog.haze] }, fogDensity: { type: "f32", value: 0.0011 }, cloudPhase: { type: "f32", value: 0 } },
  side: "double"
});

export const waterSpec = (row: CumulusLookRow = ACTIVE_LOOK): CustomSpec => ({
  glsl: { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT },
  wgsl: { vertex: UV_WORLD_VERTEX_WGSL, fragment: WATER_FRAGMENT_WGSL },
  uniforms: { hazeColor: { type: "vec3", value: [...row.fog.haze] }, fogDensity: { type: "f32", value: row.fog.density }, tClock: { type: "f32", value: 0 } },
  side: "double",
  transparent: true,
  depthWrite: false
});

/** CD-16 waterfall ribbon off the sun-side drop (storm-washed row); `fallLength` is the path length in metres. */
export const waterfallSpec = (fallLength = 60, row: CumulusLookRow = ACTIVE_LOOK): CustomSpec => ({
  glsl: { vertex: WATERFALL_VERTEX, fragment: WATERFALL_FRAGMENT },
  wgsl: { vertex: UV_WORLD_VERTEX_WGSL, fragment: WATERFALL_FRAGMENT_WGSL },
  uniforms: { hazeColor: { type: "vec3", value: [...row.fog.haze] }, fogDensity: { type: "f32", value: row.fog.density }, tClock: { type: "f32", value: 0 }, fallLength: { type: "f32", value: fallLength } },
  side: "double",
  transparent: true,
  depthWrite: false
});

/** Sky pearl. `ballGlow` is the row's `pearlGlow` (CD-14: the pearls are the brightest objects, above the bloom threshold). */
/** CD-12 rain puddles on the track (storm-washed row). */
export const puddleSpec = (row: CumulusLookRow = ACTIVE_LOOK): CustomSpec => ({
  glsl: { vertex: PUDDLE_VERTEX, fragment: PUDDLE_FRAGMENT },
  wgsl: { vertex: UV_WORLD_VERTEX_WGSL, fragment: PUDDLE_FRAGMENT_WGSL },
  uniforms: {
    skyTop: { type: "vec3", value: [...row.sky.top] }, skyHorizon: { type: "vec3", value: [...row.sky.horizon] },
    sunDir: { type: "vec3", value: [...row.sky.sunDir] }, hazeColor: { type: "vec3", value: [...row.fog.haze] },
    fogDensity: { type: "f32", value: row.fog.density }, tClock: { type: "f32", value: 0 }
  },
  side: "double",
  transparent: true,
  depthWrite: false
});

export const ballSpec = (stars: number, row: CumulusLookRow = ACTIVE_LOOK): CustomSpec => ({
  glsl: { vertex: BALL_VERTEX, fragment: BALL_FRAGMENT },
  wgsl: { vertex: BALL_VERTEX_WGSL, fragment: BALL_FRAGMENT_WGSL },
  uniforms: { ballStars: { type: "f32", value: stars }, ballGlow: { type: "f32", value: row.pearlGlow } }
});

const glowUniforms = { pixelRatio: { type: "f32" as const, value: 1 }, pointScale: { type: "f32" as const, value: 420 }, pointCap: { type: "f32" as const, value: 120 }, sparkle: { type: "f32" as const, value: 1 } };
/**
 * Pooled glow points. `quads` (a requested WebGPU backend, which has no `gl_PointSize`) draws each point as a screen-aligned
 * quad with a WGSL twin (SPRITE_QUAD_*); the default is the WebGL2 points program, unchanged.
 */
export const glowSpec = (quads = false): CustomSpec => ({
  ...(quads
    ? { glsl: { vertex: SPRITE_QUAD_VERTEX, fragment: GLOW_QUAD_FRAGMENT }, wgsl: { vertex: SPRITE_QUAD_VERTEX_WGSL, fragment: GLOW_QUAD_FRAGMENT_WGSL }, side: "double" as const }
    : { glsl: { vertex: GLOW_VERTEX, fragment: GLOW_FRAGMENT } }),
  uniforms: { ...glowUniforms },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});
/** Soft puffs; `quads` as for `glowSpec`. */
export const puffSpec = (quads = false): CustomSpec => ({
  ...(quads
    ? { glsl: { vertex: SPRITE_QUAD_VERTEX, fragment: PUFF_QUAD_FRAGMENT }, wgsl: { vertex: SPRITE_QUAD_VERTEX_WGSL, fragment: PUFF_QUAD_FRAGMENT_WGSL }, side: "double" as const }
    : { glsl: { vertex: GLOW_VERTEX, fragment: PUFF_FRAGMENT } }),
  uniforms: { pixelRatio: { type: "f32", value: 1 }, pointScale: { type: "f32", value: 420 }, pointCap: { type: "f32", value: 160 } },
  transparent: true,
  depthWrite: false
});

export interface SceneryOptions { map?: unknown; mapMix?: number; mapScale?: number; opacity?: number; rim?: number; sun?: number; /** Hemisphere fill multiplier (default 1). */ fill?: number; /** Storm row: IBL diffuse / sheen scale (default 1). */ ibl?: number; transparent?: boolean }
/** Storm row (GU47 phase 4): sun-shadow floor of the scenery program and its IBL diffuse / Fresnel-sheen weights. */
export const SCENERY_SHADOW_FLOOR = 0.2;
export const SCENERY_IBL = { diffuse: 0.3, spec: 0.16, roughness: 0.9 } as const;
const unit = (d: Rgb): number[] => { const l = Math.hypot(d[0], d[1], d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };
/**
 * Lit scenery driven by a per-vertex `tone` attribute (the geometry must supply it). On rows with `scenery.receiveShadow`
 * (storm-washed, CD-02) the program receives the look key's cascaded sun shadow through `a3d_shadow`; the light direction is
 * the same one the key, the sky disc and the shadow use (CD-01).
 */
export const scenerySpec = (o: SceneryOptions = {}, row: CumulusLookRow = ACTIVE_LOOK): CustomSpec => ({
  glsl: { vertex: SCENERY_VERTEX, fragment: row.scenery.receiveShadow ? SCENERY_SHADOWED_FRAGMENT : SCENERY_FRAGMENT },
  wgsl: { vertex: SCENERY_VERTEX_WGSL, fragment: row.scenery.receiveShadow ? SCENERY_SHADOWED_FRAGMENT_WGSL : SCENERY_FRAGMENT_WGSL },
  uniforms: {
    sunDirW: { type: "vec3", value: unit(row.scenery.sunDir) }, sunColor: { type: "vec3", value: [...row.scenery.sunColor] }, sunStrength: { type: "f32", value: o.sun ?? 1.15 },
    skyFill: { type: "vec3", value: row.scenery.skyFill.map((c) => c * (o.fill ?? 1)) }, groundFill: { type: "vec3", value: row.scenery.groundFill.map((c) => c * (o.fill ?? 1)) },
    rimColor: { type: "vec3", value: [...row.scenery.rimColor] }, rimStrength: { type: "f32", value: o.rim ?? 0.28 },
    hazeColor: { type: "vec3", value: [...row.fog.haze] }, fogDensity: { type: "f32", value: row.fog.density },
    mapMix: { type: "f32", value: o.map ? o.mapMix ?? 0.75 : 0 }, mapScale: { type: "f32", value: o.mapScale ?? 1 },
    opacity: { type: "f32", value: o.opacity ?? 1 },
    surfaceMap: { type: "texture2d" as const, ...(o.map ? { value: o.map as never } : {}) },
    ...(row.scenery.receiveShadow ? {
      shadowFloor: { type: "f32" as const, value: SCENERY_SHADOW_FLOOR },
      iblDiffuse: { type: "f32" as const, value: SCENERY_IBL.diffuse * (o.ibl ?? 1) }, iblSpec: { type: "f32" as const, value: SCENERY_IBL.spec * (o.ibl ?? 1) },
      iblRoughness: { type: "f32" as const, value: SCENERY_IBL.roughness }
    } : {})
  },
  side: "double",
  ...(row.scenery.receiveShadow ? { receiveShadow: true } : {}),
  ...(o.transparent ? { transparent: true, depthWrite: false } : {})
});

export const warnSpec = (round: boolean): CustomSpec => ({
  glsl: { vertex: WARN_VERTEX, fragment: WARN_FRAGMENT },
  wgsl: { vertex: WARN_VERTEX_WGSL, fragment: WARN_FRAGMENT_WGSL },
  uniforms: { warnAlpha: { type: "f32", value: 0 }, warnGold: { type: "f32", value: 0 }, warnRound: { type: "f32", value: round ? 1 : 0 }, tClock: { type: "f32", value: 0 } },
  side: "double",
  transparent: true,
  depthWrite: false
});

export const shadowSpec = (): CustomSpec => ({
  glsl: { vertex: WARN_VERTEX, fragment: SHADOW_FRAGMENT },
  wgsl: { vertex: WARN_VERTEX_WGSL, fragment: SHADOW_FRAGMENT_WGSL },
  uniforms: { shadowAlpha: { type: "f32", value: 0.4 } },
  side: "double",
  transparent: true,
  depthWrite: false
});

export const allProgramSpecs = (): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "sky", spec: skySpec(lookRow("storm-washed")) }, { name: "sky-original", spec: skySpec(lookRow("original")) }, { name: "valley", spec: valleySpec() }, { name: "puddle", spec: puddleSpec() }, { name: "water", spec: waterSpec() }, { name: "waterfall", spec: waterfallSpec() },
  { name: "ball", spec: ballSpec(4) }, { name: "scenery", spec: scenerySpec({}, lookRow("storm-washed")) }, { name: "scenery-original", spec: scenerySpec({}, lookRow("original")) }, { name: "warn", spec: warnSpec(false) }, { name: "shadow", spec: shadowSpec() }, { name: "glow", spec: glowSpec() }, { name: "puff", spec: puffSpec() },
  { name: "glow-quads", spec: glowSpec(true) }, { name: "puff-quads", spec: puffSpec(true) }
];
