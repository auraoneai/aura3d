/**
 * Gridlock Courier (GU47 WP-28 GC-S4): the animated harbour water, a `material.custom` shader on the existing harbour
 * quad (no extra draw). Analytic normal octaves move with `waterTime`; a Schlick fresnel mixes the deep harbour
 * colour with the phase's sky colours; a sharp specular lobe lays the sun-glitter path toward the camera; a band of
 * foam runs along the quay (the water's south edge at z = 510). Fog matches the far skyline (exp2 toward the mist).
 *
 * GU47(E-G): swap to `world.water` once the harbour can use its export (world.water draws through
 * prd10.waterOnly; this game keeps its own shader until the phase-2 capture compares the two).
 */
import type { CustomSpec } from "./headlights";

/** World z of the quay edge (look.ts `waterPlane`). */
export const QUAY_Z = 510;

export const WATER_VERTEX = /* glsl */ `
out vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const WATER_FRAGMENT = /* glsl */ `
#include <a3d_fog>
in vec3 vW;
out vec4 outColor;
vec2 waveGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  // four octaves of directional sines: (direction, wavelength m, speed m/s, amplitude)
  vec2 d0 = normalize(vec2(0.8, 0.6)); float k0 = 6.2831 / 9.0;
  vec2 d1 = normalize(vec2(-0.5, 0.9)); float k1 = 6.2831 / 4.3;
  vec2 d2 = normalize(vec2(0.95, -0.3)); float k2 = 6.2831 / 1.9;
  vec2 d3 = normalize(vec2(-0.2, -1.0)); float k3 = 6.2831 / 0.9;
  g += d0 * k0 * 0.08 * cos(dot(d0, p) * k0 + t * 1.6);
  g += d1 * k1 * 0.05 * cos(dot(d1, p) * k1 + t * 2.3);
  g += d2 * k2 * 0.025 * cos(dot(d2, p) * k2 + t * 3.4);
  g += d3 * k3 * 0.012 * cos(dot(d3, p) * k3 + t * 4.9);
  return g;
}
void main() {
  vec2 g = waveGrad(vW.xz, waterTime);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(cameraPosition - vW);
  float cosT = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(waterHorizon, waterTop, smoothstep(0.0, 0.6, max(r.y, 0.0)));
  vec3 col = mix(waterDeep, sky, fres);
  vec3 sd = normalize(waterSun);
  float spec = pow(max(dot(r, sd), 0.0), 380.0) * smoothstep(-0.05, 0.04, sd.y);
  col += waterGlow * spec * 14.0 * waterGlitter;
  // quay foam: a broken band on the first 3 m of water
  float q = vW.z - ${QUAY_Z.toFixed(1)};
  float foam = (1.0 - smoothstep(0.0, 3.0, q)) * (0.55 + 0.45 * sin(vW.x * 0.9 + waterTime * 1.3) * sin(vW.x * 0.37 - waterTime * 0.7));
  col = mix(col, waterFoam, clamp(foam, 0.0, 1.0) * 0.6);
  float dist = length(vW - cameraPosition);
  outColor = vec4(a3dFogExp2(col, waterFogColor, dist, waterFogDensity), 1.0);
}`;

export interface WaterUniforms {
  waterTime: number;
  waterSun: readonly [number, number, number];
  waterDeep: readonly [number, number, number];
  waterHorizon: readonly [number, number, number];
  waterTop: readonly [number, number, number];
  waterGlow: readonly [number, number, number];
  waterFoam: readonly [number, number, number];
  waterGlitter: number;
  waterFogColor: readonly [number, number, number];
  waterFogDensity: number;
}

export const WATER_UNIFORM_NAMES = ["waterTime", "waterSun", "waterDeep", "waterHorizon", "waterTop", "waterGlow", "waterFoam", "waterGlitter", "waterFogColor", "waterFogDensity"] as const;

export const waterSpec = (u: WaterUniforms): CustomSpec => ({
  glsl: { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT },
  uniforms: Object.fromEntries(
    WATER_UNIFORM_NAMES.map((k) => {
      const v = u[k];
      return [k, typeof v === "number" ? { type: "f32", value: v } : { type: "color3", value: [...v] }];
    })
  ) as CustomSpec["uniforms"],
  depthWrite: true,
  depthTest: true,
  side: "double"
});
