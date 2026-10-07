/**
 * PRD-10 §8.8 / T6.6 — `PlanetMaterial`: the planet surface + additive
 * atmosphere shell programs.
 *
 * Surface program composes `a3d_prd10_planet` (terminator wrap
 * `(dot(n,L)+0.2)/1.2`, night-side city map where `dot(n,L)<0` with a 0.1
 * ramp, cloud self-shadow from a sun-offset UV) — drawn opaque on the planet
 * sphere. The atmosphere program draws a second sphere at 1.025× radius,
 * additive blending, `pow(1−sat(dot(n,V)),3.5)·sat(dot(n,L)+0.35)·color`.
 */
import type { ShaderSources } from "../../RenderDevice.js";
import { a3d_prd10_planet } from "./shaders/planet.js";

const PLANET_VERT_GLSL = /* glsl */ `#version 300 es
precision highp float;
// prd10.planet — marker for the RenderDevice shader contract.
in vec3 a_position;     // unit-sphere position (scaled by u_planetRadius)
in vec3 a_normal;
in vec2 a_uv;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform float u_planetRadius;
out vec3 v_worldPosition;
out vec3 v_normal;
out vec2 v_uv;
void main() {
  vec4 world = u_model * vec4(a_position * u_planetRadius, 1.0);
  v_worldPosition = world.xyz;
  v_normal = normalize(mat3(u_model) * a_normal);
  v_uv = a_uv;
  gl_Position = u_viewProjection * world;
}
`;

const PLANET_FRAG_GLSL = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
// prd10.planet — marker for the RenderDevice shader contract.
in vec3 v_worldPosition;
in vec3 v_normal;
in vec2 v_uv;
uniform vec3 u_sunDirection;    // L: toward the sun, normalized
uniform vec3 u_cameraPosition;
uniform vec3 u_ambient;         // night-side ambient floor
out vec4 o_color;
${a3d_prd10_planet.glsl}
void main() {
  vec3 n = normalize(v_normal);
  vec3 L = normalize(u_sunDirection);
  vec3 V = normalize(u_cameraPosition - v_worldPosition);
  vec3 surface = a3dPlanetSurface(v_uv, n, L);
  surface += u_ambient;                              // night-side floor
  surface += a3dPlanetAtmosphere(n, V, L) * 0.25;    // limb term on the surface itself
  o_color = vec4(surface, 1.0);
}
`;

/** Second sphere at 1.025×: additive rim (§8.8). */
const PLANET_ATMOSPHERE_FRAG_GLSL = /* glsl */ `#version 300 es
precision highp float;
// prd10.planet — marker for the RenderDevice shader contract.
in vec3 v_worldPosition;
in vec3 v_normal;
in vec2 v_uv;
uniform vec3 u_sunDirection;
uniform vec3 u_cameraPosition;
out vec4 o_color;
${a3d_prd10_planet.glsl}
void main() {
  vec3 n = normalize(v_normal);
  vec3 V = normalize(u_cameraPosition - v_worldPosition);
  vec3 L = normalize(u_sunDirection);
  vec3 rim = a3dPlanetAtmosphere(n, V, L);
  o_color = vec4(rim, 1.0); // additive blend set by the pass descriptor
}
`;

export function planetShaderSources(): ShaderSources {
  return {
    label: "prd10-planet",
    marker: "prd10.planet",
    vertex: PLANET_VERT_GLSL,
    fragment: PLANET_FRAG_GLSL,
    webgpu: undefined // WGSL twin lands with the Path G variant (chunk wgsl on a3d_prd10_planet)
  };
}

export function planetAtmosphereShaderSources(): ShaderSources {
  return {
    label: "prd10-planet-atmosphere",
    marker: "prd10.planet",
    vertex: PLANET_VERT_GLSL.replace(/u_planetRadius\b/g, "u_planetRadius"),
    fragment: PLANET_ATMOSPHERE_FRAG_GLSL,
    webgpu: undefined
  };
}

/** Uniform/texture contract for `planetShaderSources` (§8.8). */
export interface PlanetMaterialSpec {
  readonly albedo: string;      // texture asset id → u_planetAlbedo
  readonly night?: string;      // → u_planetNight (city lights)
  readonly clouds?: string;     // → u_planetClouds (alpha in .r)
  readonly atmosphereColor?: readonly [number, number, number]; // → u_atmosphereColor
  readonly radius?: number;     // → u_planetRadius (atmosphere shell = ×1.025)
  readonly ambient?: readonly [number, number, number];         // → u_ambient
}

export const PLANET_ATMOSPHERE_RADIUS_RATIO = 1.025;
