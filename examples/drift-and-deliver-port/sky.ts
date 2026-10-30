/**
 * Drift & Deliver port: sky dome and distant city as `material.custom` shaders. A custom shader is used because the
 * built-in unlit/emissive PBR paths did not draw the sky in this app configuration (the dome came out black), while custom
 * programs are exercised by the headlight beam on the same page.
 */
import type { CustomSpec } from "./headlights";

export const SUN_DIR: readonly [number, number, number] = (() => {
  const v = [88, 38, 50];
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l] as const;
})();

export const SKY_VERTEX = /* glsl */ `
out vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const SKY_FRAGMENT = /* glsl */ `
#include <colorspace_decode>
in vec3 vW;
out vec4 outColor;
vec3 lin(vec3 c) { return a3dSrgbToLinear(c); }
void main() {
  vec3 dir = normalize(vW - cameraPosition);
  float h = max(dir.y, 0.0);
  vec3 horizon = lin(vec3(0.941, 0.863, 0.753));
  vec3 mid = lin(vec3(0.961, 0.835, 0.690));
  vec3 top = lin(vec3(0.914, 0.753, 0.549));
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
  col = mix(col, top, smoothstep(0.18, 0.85, h));
  float s = max(dot(dir, normalize(sunDirection)), 0.0);
  col += lin(vec3(1.0, 0.82, 0.55)) * (0.55 * pow(s, 18.0) + 0.9 * pow(s, 220.0));
  outColor = vec4(col, 1.0);
}`;

export const skySpec = (): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  uniforms: { sunDirection: { type: "color3", value: [SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]] } },
  depthWrite: false,
  depthTest: true,
  side: "double"
});

export const FAR_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * (modelMatrix * vec4(position, 1.0));
}`;

export const FAR_FRAGMENT = /* glsl */ `
#include <colorspace_decode>
in vec2 vUv;
out vec4 outColor;
void main() {
  outColor = vec4(a3dSrgbToLinear(texture(farPalette, vUv).rgb), 1.0);
}`;

export const farCitySpec = (palette: unknown): CustomSpec => ({
  glsl: { vertex: FAR_VERTEX, fragment: FAR_FRAGMENT },
  uniforms: { farPalette: { type: "texture2d", value: palette as never } },
  side: "double"
});

/* ------------------------------------------------------------------ GU47 WP-28: the shift sky (GC-S1, GC-S2, GC-S4) */

/**
 * Time-driven sky (GC-S1): gradient horizon / mid / top, a sun disc and glow, post-rain cumulus and stars from blue
 * hour. Every colour is a uniform written each frame from the look table (`phases.ts`) with `setUniform`, so the
 * program never recompiles. Colours arrive linear (the driver decodes the sRGB table values).
 */
export const SHIFT_SKY_FRAGMENT = /* glsl */ `
#include <a3d_noise>
#include <a3d_sky>
in vec3 vW;
out vec4 outColor;
void main() {
  vec3 dir = normalize(vW - cameraPosition);
  float h = max(dir.y, 0.0);
  vec3 col = mix(skyHorizon, skyMid, smoothstep(0.0, 0.2, h));
  col = mix(col, skyTop, smoothstep(0.16, 0.8, h));
  vec3 sd = normalize(sunDirection);
  float glow = a3dSunGlow(dir, sd, 6.0) * 0.55 + a3dSunGlow(dir, sd, 40.0) * 0.6;
  col += skyGlow * glow * smoothstep(-0.12, 0.05, sd.y);
  col += skyGlow * 3.0 * a3dSunDisc(dir, sd, 0.012) * smoothstep(-0.02, 0.02, sd.y);
  // post-rain cumulus: fbm on the dome projected over the horizon, lit from the sun side
  vec2 cp = dir.xz / max(dir.y + 0.12, 0.05) * 0.9 + vec2(skyDrift, 0.0);
  float n = a3dFbm(cp, 5);
  float cov = smoothstep(1.0 - skyClouds, 1.0 - skyClouds + 0.32, n) * smoothstep(0.02, 0.2, h);
  float lit = 0.55 + 0.45 * clamp(dot(normalize(vec3(dir.x, 0.0, dir.z) + 1e-4), normalize(vec3(sd.x, 0.0, sd.z) + 1e-4)), 0.0, 1.0);
  vec3 cloud = mix(skyMid * 0.85, skyGlow * 1.1, lit * 0.6) * (0.75 + 0.25 * n);
  col = mix(col, cloud, cov * 0.85);
  // stars above 10 deg, behind the clouds
  float stars = a3dStars(dir, 0.0035) * smoothstep(0.17, 0.35, h) * skyStars * (1.0 - cov);
  col += vec3(0.85, 0.9, 1.0) * stars * 1.6;
  outColor = vec4(col, 1.0);
}`;

export interface ShiftSkyUniforms {
  sunDirection: readonly [number, number, number];
  skyHorizon: readonly [number, number, number];
  skyMid: readonly [number, number, number];
  skyTop: readonly [number, number, number];
  skyGlow: readonly [number, number, number];
  skyClouds: number;
  skyStars: number;
  skyDrift: number;
}

export const shiftSkySpec = (u: ShiftSkyUniforms): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SHIFT_SKY_FRAGMENT },
  uniforms: {
    sunDirection: { type: "color3", value: [...u.sunDirection] },
    skyHorizon: { type: "color3", value: [...u.skyHorizon] },
    skyMid: { type: "color3", value: [...u.skyMid] },
    skyTop: { type: "color3", value: [...u.skyTop] },
    skyGlow: { type: "color3", value: [...u.skyGlow] },
    skyClouds: { type: "f32", value: u.skyClouds },
    skyStars: { type: "f32", value: u.skyStars },
    skyDrift: { type: "f32", value: u.skyDrift }
  },
  depthWrite: false,
  depthTest: true,
  side: "double"
});

/**
 * Skyline aerial perspective (GC-S2): the far ring fades into the mist with exp2 (`a3dFogExp2`) toward a colour
 * between the fog and the sky horizon, and a seeded window mask lights up at dusk (`farWindows` 0..1).
 */
export const SHIFT_FAR_VERTEX = /* glsl */ `
out vec2 vUv;
out vec3 vW;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const SHIFT_FAR_FRAGMENT = /* glsl */ `
#include <colorspace_decode>
#include <a3d_noise>
#include <a3d_fog>
in vec2 vUv;
in vec3 vW;
out vec4 outColor;
void main() {
  vec3 base = a3dSrgbToLinear(texture(farPalette, vUv).rgb) * farLight;
  // windows: 6 m x 3.5 m cells on the tower walls, a seeded fraction lit
  vec2 cell = floor(vec2((vW.x + vW.z) / 6.0, vW.y / 3.5));
  float lit = step(1.0 - farLitFraction, a3dHash21(cell)) * step(6.0, vW.y);
  vec2 f = fract(vec2((vW.x + vW.z) / 6.0, vW.y / 3.5));
  float pane = step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.8);
  base += vec3(1.0, 0.72, 0.38) * lit * pane * farWindows * 2.2;
  float dist = length(vW - cameraPosition);
  outColor = vec4(a3dFogExp2(base, farFogColor, dist, farFogDensity), 1.0);
}`;

export interface ShiftFarUniforms {
  farLight: number;
  farFogColor: readonly [number, number, number];
  farFogDensity: number;
  farWindows: number;
  farLitFraction: number;
}

export const shiftFarSpec = (palette: unknown, u: ShiftFarUniforms): CustomSpec => ({
  glsl: { vertex: SHIFT_FAR_VERTEX, fragment: SHIFT_FAR_FRAGMENT },
  uniforms: {
    farPalette: { type: "texture2d", value: palette as never },
    farLight: { type: "f32", value: u.farLight },
    farFogColor: { type: "color3", value: [...u.farFogColor] },
    farFogDensity: { type: "f32", value: u.farFogDensity },
    farWindows: { type: "f32", value: u.farWindows },
    farLitFraction: { type: "f32", value: u.farLitFraction }
  },
  side: "double"
});
