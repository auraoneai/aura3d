/**
 * GU47 AO-M4: energy plumes. The thruster cylinders (rear, ventral, lateral, the Rocket Send cone and the sky-lane jets) keep
 * their nodes, sizes and per-frame scales; only the material changes from a flat emissive to an additive fresnel cone:
 *
 * - the vertex stage pinches the unit cylinder (radius 0.5, y -0.5..0.5) toward its tip, so a plume reads as a cone from the
 *   nozzle (local -y, where every caller anchors it) to the tip (+y);
 * - the fragment stage glows at the silhouette (fresnel edge in the plume colour), burns white-hot along the view-facing axis
 *   near the nozzle (the core), and breaks the body up with value noise scrolling from nozzle to tip.
 *
 * Draws unchanged (same nodes, one material each). Reduced motion stops the scroll (`plumeScroll` 0, PRD §6.3); the core
 * never flashes, so reduced flash needs nothing. Low keeps the same shader (no extra pass).
 */
import type { material } from "@aura3d/engine";
import { hexToUnit } from "./look";

type CustomSpec = Parameters<typeof material.custom>[0];

export interface ApexPlumeOptions {
  /** Edge (fresnel) colour, sRGB hex. */
  readonly color: string;
  /** Overall gain; the old emissive intensity of the same plume. */
  readonly intensity: number;
  /** Tip radius as a fraction of the nozzle radius (0..1). */
  readonly tipRadius?: number;
}

/** Scroll speed (noise cells per second, nozzle to tip); 0 under reduced motion. */
export const APEX_PLUME_SCROLL = 3.4;

export function plumeScroll(reducedMotion: boolean): number {
  return reducedMotion ? 0 : APEX_PLUME_SCROLL;
}

/** Hot core colour (linear, before gain): near-white with a cyan cast, the brightest pixels of a plume. */
export const APEX_PLUME_CORE: readonly [number, number, number] = [0.92, 0.98, 1.0];

const VERTEX = /* glsl */ `
out vec3 vN;
out vec3 vW;
out float vAlong;
out float vAngle;
void main() {
  // unit cylinder: radius 0.5, y -0.5 (nozzle) .. 0.5 (tip); pinch the radius toward the tip
  float t = clamp(position.y + 0.5, 0.0, 1.0);
  float r = mix(1.0, plumeTip, t);
  vec3 local = vec3(position.x * r, position.y, position.z * r);
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(local, 1.0);
  vW = w.xyz;
  vN = mat3(m) * vec3(position.x, 0.0, position.z);
  vAlong = t;
  vAngle = atan(position.z, position.x);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <colorspace_decode>
in vec3 vN;
in vec3 vW;
in float vAlong;
in float vAngle;
out vec4 outColor;
float plumeHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float plumeNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = plumeHash(i);
  float b = plumeHash(i + vec2(1.0, 0.0));
  float c = plumeHash(i + vec2(0.0, 1.0));
  float d = plumeHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
void main() {
  vec3 n = a3dSafeNormalize(vN, vec3(1.0, 0.0, 0.0));
  vec3 v = a3dSafeNormalize(cameraPosition - vW, vec3(0.0, 0.0, 1.0));
  float facing = abs(dot(n, v));
  float edge = pow(1.0 - facing, 2.0);
  float tip = 1.0 - vAlong;
  // noise scrolls from nozzle to tip; 6 cells around, 5 along
  vec2 q = vec2(vAngle * 0.9549, vAlong * 5.0 - uTime * plumeScroll);
  float noise = 0.55 + 0.45 * plumeNoise(q) * plumeNoise(q * 2.1 + 7.3);
  float core = pow(facing, 6.0) * tip * tip;
  float body = a3dSaturate(edge * 0.85 + 0.25) * tip * noise;
  vec3 col = a3dSrgbToLinear(plumeColor) * body + plumeCore * core;
  float a = a3dSaturate(body + core);
  outColor = vec4(a3dFinite(col * plumeGain), a);
}`;

export function plumeSpec(options: ApexPlumeOptions, reducedMotion: boolean): CustomSpec {
  const tip = Math.min(1, Math.max(0, options.tipRadius ?? 0.18));
  return {
    glsl: { vertex: VERTEX, fragment: FRAGMENT },
    uniforms: {
      plumeColor: { type: "vec3", value: hexToUnit(options.color) },
      plumeCore: { type: "vec3", value: [...APEX_PLUME_CORE] },
      plumeGain: { type: "f32", value: options.intensity },
      plumeTip: { type: "f32", value: tip },
      plumeScroll: { type: "f32", value: plumeScroll(reducedMotion) }
    },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    side: "double"
  };
}

/** The game's plume set: cyan thrusters (identity cyan is the player's and the sky lane's), tangerine Rocket Send. */
export const APEX_PLUMES = {
  rear: { color: "#4df0ff", intensity: 1.9 },
  down: { color: "#38bdf8", intensity: 1.75 },
  side: { color: "#7dd3fc", intensity: 1.7 },
  rocket: { color: "#ff8a3d", intensity: 2.3, tipRadius: 0.1 },
  sky: { color: "#4df0ff", intensity: 1.9 }
} as const satisfies Record<string, ApexPlumeOptions>;
