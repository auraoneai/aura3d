/**
 * `material.custom` specs for the port's surfaces, kept apart from the scene so a
 * unit test can bake and compile exactly what the app draws with.
 */
import type { material } from "@aura3d/engine";
import {
  ATMOS_FRAGMENT, ATMOS_VERTEX, MINERAL_FRAGMENT, MINERAL_VERTEX, NEBULA_FRAGMENT, NEBULA_VERTEX, POINTS_FRAGMENT, POINTS_VERTEX, SOLID_FRAGMENT, SOLID_VERTEX,
  TRACK_FRAGMENT, TRACK_VERTEX, VEIL_FRAGMENT, VEIL_VERTEX
} from "./shaders";

export type CustomSpec = Parameters<typeof material.custom>[0];
type Rgb = readonly [number, number, number];

export const trackSpec = (): CustomSpec => ({ receiveShadow: true, glsl: { vertex: TRACK_VERTEX, fragment: TRACK_FRAGMENT }, side: "double" });

export interface SolidExtra {
  readonly transparent?: boolean;
  readonly blending?: "additive" | "normal";
  readonly depthWrite?: boolean;
}

export const solidSpec = (base: Rgb, glow: Rgb = [0, 0, 0], glowAmount = 0, banding = 0, extra: SolidExtra = {}): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: SOLID_VERTEX, fragment: SOLID_FRAGMENT },
  uniforms: {
    baseColor: { type: "color3", value: [...base] },
    glowColor: { type: "color3", value: [...glow] },
    glow: { type: "f32", value: glowAmount },
    banding: { type: "f32", value: banding }
  },
  side: "double",
  ...extra
});

export const mineralSpec = (base: Rgb, opal: boolean): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: MINERAL_VERTEX, fragment: MINERAL_FRAGMENT },
  uniforms: { baseColor: { type: "color3", value: [...base] }, opal: { type: "f32", value: opal ? 1 : 0 } },
  side: "double"
});

export const pointsSpec = (additive: boolean): CustomSpec => ({
  glsl: { vertex: POINTS_VERTEX, fragment: POINTS_FRAGMENT },
  uniforms: { additive: { type: "f32", value: additive ? 1 : 0 } },
  transparent: true,
  depthWrite: false,
  blending: additive ? "additive" : "normal"
});

/** The veil's uniforms are not named `time`/`pulse`: those lower to `u_time`, which the engine prelude already declares. */
export const veilSpec = (): CustomSpec => ({
  glsl: { vertex: VEIL_VERTEX, fragment: VEIL_FRAGMENT },
  uniforms: { veilTime: { type: "f32", value: 0 }, veilPulse: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "double",
  blending: "additive"
});

export const skySpec = (): CustomSpec => ({
  glsl: { vertex: NEBULA_VERTEX, fragment: NEBULA_FRAGMENT },
  side: "double",
  depthWrite: false
});

export const atmosphereSpec = (color: Rgb): CustomSpec => ({
  glsl: { vertex: ATMOS_VERTEX, fragment: ATMOS_FRAGMENT },
  uniforms: { atmoColor: { type: "color3", value: [...color] } },
  transparent: true,
  depthWrite: false,
  side: "front",
  blending: "additive"
});

/** One of each distinct program the scene uses (solid/mineral/points have two variants each). */
export const allProgramSpecs = (): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "track", spec: trackSpec() },
  { name: "solid", spec: solidSpec([0.5, 0.5, 0.5]) },
  { name: "solid-glow", spec: solidSpec([0.5, 0.5, 0.5], [1, 0.8, 0.4], 1.4) },
  { name: "solid-banded", spec: solidSpec([0.9, 0.8, 0.75], [0.8, 0.5, 0.4], 0, 0.045) },
  { name: "solid-additive", spec: solidSpec([0.5, 0.9, 0.8], [0.5, 0.9, 0.8], 1, 0, { transparent: true, blending: "additive", depthWrite: false }) },
  { name: "mineral-opal", spec: mineralSpec([0.5, 0.6, 0.8], true) },
  { name: "mineral-plain", spec: mineralSpec([0.8, 0.75, 0.7], false) },
  { name: "points-additive", spec: pointsSpec(true) },
  { name: "points-normal", spec: pointsSpec(false) },
  { name: "veil", spec: veilSpec() },
  { name: "sky", spec: skySpec() },
  { name: "atmosphere", spec: atmosphereSpec([1, 0.7, 0.55]) }
];
