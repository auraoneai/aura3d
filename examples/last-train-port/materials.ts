/** `material.custom` specs for Lamplight Line's custom surfaces, kept apart so unit tests can bake and verify both GLSL + WGSL stages. */
import { material as materialFactory, type material, type AuraMaterialSpec } from "@aura3d/engine";
import type { ShaderGraphDocument } from "@aura3d/engine/shader-graph-runtime";
import {
  CATENARY_FRAGMENT, CATENARY_VERTEX, CLOUD_FRAGMENT, CLOUD_VERTEX, POINTS_FRAGMENT, POINTS_VERTEX,
  RAIN_FRAGMENT, RAIN_VERTEX, SIGNAL_LENS_FRAGMENT, SIGNAL_LENS_VERTEX, SKY_FRAGMENT, SKY_VERTEX,
  SPARK_CARD_FRAGMENT, SPARK_CARD_VERTEX
} from "./shaders";
import {
  CATENARY_FRAGMENT_WGSL, CATENARY_VERTEX_WGSL, CLOUD_FRAGMENT_WGSL, CLOUD_VERTEX_WGSL, POINTS_FRAGMENT_WGSL, POINTS_VERTEX_WGSL,
  RAIN_FRAGMENT_WGSL, RAIN_VERTEX_WGSL, SIGNAL_LENS_FRAGMENT_WGSL, SIGNAL_LENS_VERTEX_WGSL, SKY_FRAGMENT_WGSL, SKY_VERTEX_WGSL,
  SPARK_CARD_FRAGMENT_WGSL, SPARK_CARD_VERTEX_WGSL
} from "./shaders-wgsl";
import { POINT_QUAD_SHADERS } from "./point-quads";
import { createFlipbookAtlas, type FlipbookAtlasSpec } from "../../apps/showcase-port-shared/vfx-pack";

export const FLANGE_SPARKS_ATLAS: FlipbookAtlasSpec = createFlipbookAtlas("sparks", [255, 208, 118]);

export type CustomSpec = Parameters<typeof material.custom>[0];

export const skySpec = (): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  wgsl: { vertex: SKY_VERTEX_WGSL, fragment: SKY_FRAGMENT_WGSL },
  uniforms: { skyTop: { type: "color3", value: [0.3, 0.6, 0.9] }, skyHorizon: { type: "color3", value: [0.85, 0.92, 0.85] }, nightMix: { type: "f32", value: 0 }, sunDir: { type: "vec3", value: [0.7, 0.6, 0.4] }, afterglow: { type: "f32", value: 0 }, starMix: { type: "f32", value: 0 } },
  side: "double",
  depthWrite: true
});

export const cloudSpec = (): CustomSpec => ({
  glsl: { vertex: CLOUD_VERTEX, fragment: CLOUD_FRAGMENT },
  wgsl: { vertex: CLOUD_VERTEX_WGSL, fragment: CLOUD_FRAGMENT_WGSL },
  uniforms: { cloudPhase: { type: "f32", value: 0 }, nightMix: { type: "f32", value: 0 }, hazeColor: { type: "color3", value: [0.8, 0.9, 0.95] },
    sunDir: { type: "vec3", value: [0.7, 0.6, 0.4] }, cloudLit: { type: "color3", value: [1, 0.96, 0.9] }, cloudValley: { type: "color3", value: [0.74, 0.7, 0.86] }, sunGain: { type: "f32", value: 1 }, bandMix: { type: "f32", value: 0 } },
  side: "double"
});

export const pointsSpec = (tint: readonly [number, number, number]): CustomSpec => ({
  glsl: { vertex: POINTS_VERTEX, fragment: POINTS_FRAGMENT },
  wgsl: { vertex: POINTS_VERTEX_WGSL, fragment: POINTS_FRAGMENT_WGSL },
  uniforms: { weatherTint: { type: "color3", value: [...tint] } },
  transparent: true,
  depthWrite: false
});

/** The sprite quads a requested lab backend draws instead of the weather / mote points (point-quads.ts; WebGPU has no point size). */
export const pointQuadSpec = (tint: readonly [number, number, number]): CustomSpec => ({
  glsl: POINT_QUAD_SHADERS.glsl,
  wgsl: POINT_QUAD_SHADERS.wgsl,
  uniforms: { weatherTint: { type: "color3", value: [...tint] } },
  transparent: true,
  depthWrite: false
});

export const rainSpec = (tint: readonly [number, number, number]): CustomSpec => ({
  glsl: { vertex: RAIN_VERTEX, fragment: RAIN_FRAGMENT },
  wgsl: { vertex: RAIN_VERTEX_WGSL, fragment: RAIN_FRAGMENT_WGSL },
  uniforms: { rainTint: { type: "color3", value: [...tint] } },
  side: "double",
  transparent: true,
  depthWrite: false
});

/** Overhead bronze-copper catenary contact wire with grazed metallic highlight and travelling pantograph corona. */
export const catenarySpec = (arcBoost = 0.35): CustomSpec => ({
  glsl: { vertex: CATENARY_VERTEX, fragment: CATENARY_FRAGMENT },
  wgsl: { vertex: CATENARY_VERTEX_WGSL, fragment: CATENARY_FRAGMENT_WGSL },
  uniforms: {
    wireTint: { type: "color3", value: [0.36, 0.29, 0.22] },
    arcTint: { type: "color3", value: [0.78, 0.9, 1.0] },
    wirePhase: { type: "f32", value: 0 },
    arcBoost: { type: "f32", value: arcBoost }
  },
  side: "double"
});

/** Fresnel optical bullseye lens for station approach (stop) and departure (clear) railway signals. */
export const signalLensSpec = (nightBoost = 0.6): CustomSpec => ({
  glsl: { vertex: SIGNAL_LENS_VERTEX, fragment: SIGNAL_LENS_FRAGMENT },
  wgsl: { vertex: SIGNAL_LENS_VERTEX_WGSL, fragment: SIGNAL_LENS_FRAGMENT_WGSL },
  uniforms: {
    lensWarm: { type: "color3", value: [1.0, 0.24, 0.16] },
    lensClear: { type: "color3", value: [0.22, 1.0, 0.54] },
    signalPhase: { type: "f32", value: 0 },
    nightBoost: { type: "f32", value: nightBoost }
  },
  side: "double",
  transparent: true,
  depthWrite: false
});

/** Dual-backend 8x4 sprite-sheet flipbook burst card sampling `createFlipbookAtlas("sparks")` for wheel-flange sparks. */
export const flangeSparkSpec = (atlas: FlipbookAtlasSpec = FLANGE_SPARKS_ATLAS, gain = 1.65): CustomSpec => ({
  glsl: { vertex: SPARK_CARD_VERTEX, fragment: SPARK_CARD_FRAGMENT },
  wgsl: { vertex: SPARK_CARD_VERTEX_WGSL, fragment: SPARK_CARD_FRAGMENT_WGSL },
  uniforms: {
    sheet: { type: "texture2d", value: atlas.texture },
    burstState: { type: "vec4", value: [0, 0, gain, 0] }
  },
  side: "double",
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

export const allProgramSpecs = (): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "sky", spec: skySpec() },
  { name: "clouds", spec: cloudSpec() },
  { name: "snow", spec: pointsSpec([0.7, 0.8, 1]) },
  { name: "snow-quads", spec: pointQuadSpec([0.7, 0.8, 1]) },
  { name: "rain-streaks", spec: rainSpec([0.75, 0.85, 1]) },
  { name: "catenary-wire", spec: catenarySpec() },
  { name: "signal-lens", spec: signalLensSpec() },
  { name: "flange-sparks", spec: flangeSparkSpec() }
];

/**
 * A4 pilot: the rain streaks as a portable shader-graph material (`material.node({ graph })`). One graph compiles to a GLSL
 * and a WGSL twin, so this surface also draws on `?backend=webgpu`. The GLSL `fade` author attribute becomes the geometry's
 * `uv0.x` (the graph builtins carry no author attributes); alpha is `fade`, colour is the sRGB tint decoded to linear on the
 * CPU (`a3dSrgbToLinear` has no graph twin). The GLSL `rainSpec` stays as the baseline (`?fx=rainglsl`) and the pixel-diff reference.
 */
const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export const rainGraphDocument = (): ShaderGraphDocument => ({
  version: 1,
  stage: "material",
  resources: [{ name: "rainTint", kind: "uniform", type: "vec3" }],
  nodes: [
    { id: "uv", op: "input", name: "uv0", type: "vec2" },
    { id: "fade", op: "swizzle", type: "f32", inputs: ["uv"], components: "x" },
    { id: "tint", op: "uniform", type: "vec3", resource: "rainTint" }
  ],
  outputs: { color: "tint", opacity: "fade" }
});

export const rainGraphSpec = (tint: readonly [number, number, number]): AuraMaterialSpec => materialFactory.node({
  graph: rainGraphDocument(),
  uniforms: { rainTint: [srgbToLinear(tint[0]), srgbToLinear(tint[1]), srgbToLinear(tint[2])] },
  transparent: true,
  depthWrite: false,
  side: "double"
});
