/** `material.custom` specs for the port's custom surfaces, kept apart so a unit test can bake exactly what the app draws with. */
import { material as materialFactory, type material, type AuraMaterialSpec } from "@aura3d/engine";
import type { ShaderGraphDocument } from "@aura3d/engine/shader-graph-runtime";
import { CLOUD_FRAGMENT, CLOUD_VERTEX, POINTS_FRAGMENT, POINTS_VERTEX, RAIN_FRAGMENT, RAIN_VERTEX, SKY_FRAGMENT, SKY_VERTEX } from "./shaders";
import {
  CLOUD_FRAGMENT_WGSL, CLOUD_VERTEX_WGSL, POINTS_FRAGMENT_WGSL, POINTS_VERTEX_WGSL, RAIN_FRAGMENT_WGSL, RAIN_VERTEX_WGSL, SKY_FRAGMENT_WGSL, SKY_VERTEX_WGSL
} from "./shaders-wgsl";
import { POINT_QUAD_SHADERS } from "./point-quads";

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

export const allProgramSpecs = (): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "sky", spec: skySpec() },
  { name: "clouds", spec: cloudSpec() },
  { name: "snow", spec: pointsSpec([0.7, 0.8, 1]) },
  { name: "snow-quads", spec: pointQuadSpec([0.7, 0.8, 1]) },
  { name: "rain-streaks", spec: rainSpec([0.75, 0.85, 1]) }
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
