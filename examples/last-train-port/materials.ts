/** `material.custom` specs for the port's custom surfaces, kept apart so a unit test can bake exactly what the app draws with. */
import type { material } from "@aura3d/engine";
import { CLOUD_FRAGMENT, CLOUD_VERTEX, POINTS_FRAGMENT, POINTS_VERTEX, RAIN_FRAGMENT, RAIN_VERTEX, SKY_FRAGMENT, SKY_VERTEX } from "./shaders";

export type CustomSpec = Parameters<typeof material.custom>[0];

export const skySpec = (): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  uniforms: { skyTop: { type: "color3", value: [0.3, 0.6, 0.9] }, skyHorizon: { type: "color3", value: [0.85, 0.92, 0.85] }, nightMix: { type: "f32", value: 0 }, sunDir: { type: "vec3", value: [0.7, 0.6, 0.4] }, afterglow: { type: "f32", value: 0 }, starMix: { type: "f32", value: 0 } },
  side: "double",
  depthWrite: true
});

export const cloudSpec = (): CustomSpec => ({
  glsl: { vertex: CLOUD_VERTEX, fragment: CLOUD_FRAGMENT },
  uniforms: { cloudPhase: { type: "f32", value: 0 }, nightMix: { type: "f32", value: 0 }, hazeColor: { type: "color3", value: [0.8, 0.9, 0.95] },
    sunDir: { type: "vec3", value: [0.7, 0.6, 0.4] }, cloudLit: { type: "color3", value: [1, 0.96, 0.9] }, cloudValley: { type: "color3", value: [0.74, 0.7, 0.86] }, sunGain: { type: "f32", value: 1 }, bandMix: { type: "f32", value: 0 } },
  side: "double"
});

export const pointsSpec = (tint: readonly [number, number, number]): CustomSpec => ({
  glsl: { vertex: POINTS_VERTEX, fragment: POINTS_FRAGMENT },
  uniforms: { weatherTint: { type: "color3", value: [...tint] } },
  transparent: true,
  depthWrite: false
});

export const rainSpec = (tint: readonly [number, number, number]): CustomSpec => ({
  glsl: { vertex: RAIN_VERTEX, fragment: RAIN_FRAGMENT },
  uniforms: { rainTint: { type: "color3", value: [...tint] } },
  side: "double",
  transparent: true,
  depthWrite: false
});

export const allProgramSpecs = (): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "sky", spec: skySpec() },
  { name: "clouds", spec: cloudSpec() },
  { name: "snow", spec: pointsSpec([0.7, 0.8, 1]) },
  { name: "rain-streaks", spec: rainSpec([0.75, 0.85, 1]) }
];
