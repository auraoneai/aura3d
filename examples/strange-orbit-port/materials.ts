/**
 * `material.custom` specs for the port's surfaces, kept apart from the scene so a
 * unit test can bake and compile exactly what the app draws with.
 */
import type { material } from "@aura3d/engine";
import {
  ATMOS_FRAGMENT, ATMOS_VERTEX, MINERAL_VERTEX, NEBULA_FRAGMENT, NEBULA_FRAGMENT_GOUACHE, NEBULA_VERTEX, POINTS_FRAGMENT, POINTS_VERTEX, SOLID_VERTEX,
  RIDER_SHADOW_FRAGMENT, RIDER_SHADOW_VERTEX, TRACK_VERTEX, VEIL_FRAGMENT, VEIL_VERTEX, mineralFragment, solidFragment, trackFragment
} from "./shaders";
import {
  ATMOS_FRAGMENT_WGSL, ATMOS_VERTEX_WGSL, NEBULA_VERTEX_WGSL, OBJECT_VERTEX_WGSL, POINTS_FRAGMENT_WGSL, POINTS_VERTEX_WGSL, RIDER_SHADOW_FRAGMENT_WGSL,
  TRACK_VERTEX_WGSL, UV_VERTEX_WGSL, VEIL_FRAGMENT_WGSL, mineralFragmentWgsl, nebulaFragmentWgsl, solidFragmentWgsl, trackFragmentWgsl
} from "./shaders-wgsl";
import { POINT_QUAD_SHADERS } from "./point-quads";
import type { OrbitLook } from "./art/look";

export type CustomSpec = Parameters<typeof material.custom>[0];
type Rgb = readonly [number, number, number];

/** Fragment sources per look, built once (the program cache keys on the source). */
const FRAGMENTS = {
  gouache: { track: trackFragment(true), mineral: mineralFragment(true), solid: solidFragment(true) },
  original: { track: trackFragment(false), mineral: mineralFragment(false), solid: solidFragment(false) }
} as const;

/** WGSL twins of FRAGMENTS for the WebGPU backend (shaders-wgsl.ts); WebGL2 keeps drawing the GLSL above. */
const WGSL_FRAGMENTS = {
  gouache: { track: trackFragmentWgsl(true), mineral: mineralFragmentWgsl(true), solid: solidFragmentWgsl(true), nebula: nebulaFragmentWgsl(true) },
  original: { track: trackFragmentWgsl(false), mineral: mineralFragmentWgsl(false), solid: solidFragmentWgsl(false), nebula: nebulaFragmentWgsl(false) }
} as const;

/**
 * GU47 phase 4: gouache custom surfaces do not sample the key's cascade map. On the software-WebGL2 runner the
 * `a3dSunShadowAuto` term read fully shadowed on every track pixel (`?dbg=shadow` captures g15p4-r2/r3, with and
 * without the ribbons casting), so the painted road never got its key light and every frame read "flat, ambient".
 * Grounding comes from the soft rider shadow quads; `?look=original` keeps receiving.
 */
export const trackSpec = (look: OrbitLook = "gouache"): CustomSpec => ({ receiveShadow: look === "original", glsl: { vertex: TRACK_VERTEX, fragment: FRAGMENTS[look].track }, wgsl: { vertex: TRACK_VERTEX_WGSL, fragment: WGSL_FRAGMENTS[look].track }, side: "double" });

export interface SolidExtra {
  readonly transparent?: boolean;
  readonly blending?: "additive" | "normal";
  readonly depthWrite?: boolean;
}

export const solidSpec = (base: Rgb, glow: Rgb = [0, 0, 0], glowAmount = 0, banding = 0, extra: SolidExtra = {}, look: OrbitLook = "gouache"): CustomSpec => ({
  receiveShadow: look === "original",
  glsl: { vertex: SOLID_VERTEX, fragment: FRAGMENTS[look].solid },
  wgsl: { vertex: OBJECT_VERTEX_WGSL, fragment: WGSL_FRAGMENTS[look].solid },
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
  receiveShadow: look === "original",
  glsl: { vertex: MINERAL_VERTEX, fragment: FRAGMENTS[look].mineral },
  wgsl: { vertex: OBJECT_VERTEX_WGSL, fragment: WGSL_FRAGMENTS[look].mineral },
  uniforms: { baseColor: { type: "color3", value: [...base] }, opal: { type: "f32", value: opal ? 1 : 0 } },
  side: "double"
});

export const pointsSpec = (additive: boolean): CustomSpec => ({
  glsl: { vertex: POINTS_VERTEX, fragment: POINTS_FRAGMENT },
  wgsl: { vertex: POINTS_VERTEX_WGSL, fragment: POINTS_FRAGMENT_WGSL },
  uniforms: { additive: { type: "f32", value: additive ? 1 : 0 } },
  transparent: true,
  depthWrite: false,
  blending: additive ? "additive" : "normal"
});

/** The sprite quads a requested lab backend draws instead of the points (point-quads.ts; WebGPU has no point size). */
export const pointQuadSpec = (additive: boolean): CustomSpec => ({
  glsl: POINT_QUAD_SHADERS.glsl,
  wgsl: POINT_QUAD_SHADERS.wgsl,
  uniforms: { additive: { type: "f32", value: additive ? 1 : 0 } },
  transparent: true,
  depthWrite: false,
  blending: additive ? "additive" : "normal"
});

/** The veil's uniforms are not named `time`/`pulse`: those lower to `u_time`, which the engine prelude already declares. */
export const veilSpec = (): CustomSpec => ({
  glsl: { vertex: VEIL_VERTEX, fragment: VEIL_FRAGMENT },
  wgsl: { vertex: UV_VERTEX_WGSL, fragment: VEIL_FRAGMENT_WGSL },
  uniforms: { veilTime: { type: "f32", value: 0 }, veilPulse: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "double",
  blending: "additive"
});

export const skySpec = (nebulaShift = 0, look: OrbitLook = "original"): CustomSpec => ({
  glsl: { vertex: NEBULA_VERTEX, fragment: look === "gouache" ? NEBULA_FRAGMENT_GOUACHE : NEBULA_FRAGMENT },
  wgsl: { vertex: NEBULA_VERTEX_WGSL, fragment: WGSL_FRAGMENTS[look].nebula },
  uniforms: { nebulaShift: { type: "f32", value: nebulaShift } },
  side: "double",
  depthWrite: false
});

export const atmosphereSpec = (color: Rgb): CustomSpec => ({
  glsl: { vertex: ATMOS_VERTEX, fragment: ATMOS_FRAGMENT },
  wgsl: { vertex: ATMOS_VERTEX_WGSL, fragment: ATMOS_FRAGMENT_WGSL },
  uniforms: { atmoColor: { type: "color3", value: [...color] } },
  transparent: true,
  depthWrite: false,
  side: "front",
  blending: "additive"
});

/** GU47 phase 3: the soft rider shadow quad (gouache only). */
export const riderShadowSpec = (strength = 0.7): CustomSpec => ({
  glsl: { vertex: RIDER_SHADOW_VERTEX, fragment: RIDER_SHADOW_FRAGMENT },
  wgsl: { vertex: UV_VERTEX_WGSL, fragment: RIDER_SHADOW_FRAGMENT_WGSL },
  uniforms: { shadowStrength: { type: "f32", value: strength } },
  transparent: true,
  depthWrite: false,
  side: "double",
  blending: "normal"
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
  { name: "point-quads-additive", spec: pointQuadSpec(true) },
  { name: "point-quads-normal", spec: pointQuadSpec(false) },
  { name: "veil", spec: veilSpec() },
  { name: "sky", spec: skySpec() },
  { name: "sky-gouache", spec: skySpec(0, "gouache") },
  { name: "atmosphere", spec: atmosphereSpec([1, 0.7, 0.55]) },
  { name: "rider-shadow", spec: riderShadowSpec() }
];
