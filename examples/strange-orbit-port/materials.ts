/**
 * `material.custom` specs for the port's surfaces, kept apart from the scene so a
 * unit test can bake and compile exactly what the app draws with.
 */
import type { material } from "@aura3d/engine";
import {
  ATMOS_FRAGMENT, ATMOS_VERTEX, MINERAL_VERTEX, NEBULA_FRAGMENT, NEBULA_VERTEX, POINTS_FRAGMENT, POINTS_VERTEX, SOLID_VERTEX,
  TRACK_VERTEX, VEIL_FRAGMENT, VEIL_VERTEX, CONTACT_UNIFORMS, mineralFragment, solidFragment, trackFragment
} from "./shaders";
import type { OrbitLook } from "./art/look";

export type CustomSpec = Parameters<typeof material.custom>[0];
type Rgb = readonly [number, number, number];

/** Fragment sources per look, built once (the program cache keys on the source). */
const FRAGMENTS = {
  gouache: { track: trackFragment(true), mineral: mineralFragment(true), solid: solidFragment(true) },
  original: { track: trackFragment(false), mineral: mineralFragment(false), solid: solidFragment(false) }
} as const;

export const trackSpec = (look: OrbitLook = "gouache"): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: TRACK_VERTEX, fragment: FRAGMENTS[look].track },
  side: "double",
  // GU47 phase 3 (gouache): rider contact shadows, moved every frame by world.ts (w 0 = off until placed).
  ...(look === "gouache" ? { uniforms: Object.fromEntries(CONTACT_UNIFORMS.map((n) => [n, { type: "vec4" as const, value: [0, -1000, 0, 0] }])) } : {})
});

export interface SolidExtra {
  readonly transparent?: boolean;
  readonly blending?: "additive" | "normal";
  readonly depthWrite?: boolean;
}

export const solidSpec = (base: Rgb, glow: Rgb = [0, 0, 0], glowAmount = 0, banding = 0, extra: SolidExtra = {}, look: OrbitLook = "gouache"): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: SOLID_VERTEX, fragment: FRAGMENTS[look].solid },
  uniforms: {
    baseColor: { type: "color3", value: [...base] },
    glowColor: { type: "color3", value: [...glow] },
    glow: { type: "f32", value: glowAmount },
    banding: { type: "f32", value: banding }
  },
  side: "double",
  ...extra
});

export const mineralSpec = (base: Rgb, opal: boolean, look: OrbitLook = "gouache"): CustomSpec => ({
  receiveShadow: true,
  glsl: { vertex: MINERAL_VERTEX, fragment: FRAGMENTS[look].mineral },
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

export const skySpec = (nebulaShift = 0): CustomSpec => ({
  glsl: { vertex: NEBULA_VERTEX, fragment: NEBULA_FRAGMENT },
  uniforms: { nebulaShift: { type: "f32", value: nebulaShift } },
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

/** One of each distinct program the scene uses (solid/mineral/points have two variants each; lit ones also per look). */
export const allProgramSpecs = (): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "track-original", spec: trackSpec("original") },
  { name: "solid-original", spec: solidSpec([0.5, 0.5, 0.5], [1, 0.8, 0.4], 1.4, 0, {}, "original") },
  { name: "mineral-original", spec: mineralSpec([0.5, 0.6, 0.8], true, "original") },
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
