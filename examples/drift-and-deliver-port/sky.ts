/**
 * Drift & Deliver port: skies and distant city. The original look's day sky is the engine `sky.gradient` (5.7.0); the
 * shift look's sky dome and both far-city layers stay `material.custom` shaders.
 */
import type { CustomSpec } from "./headlights";
import type { AuraSkyGradientOptions } from "@aura3d/engine";
import { WGSL_CLIP, WGSL_COLOR, WGSL_FOG, WGSL_MATH, WGSL_NOISE, WGSL_SKY, wgslStage } from "../shared/wgsl-twins";

export const SUN_DIR: readonly [number, number, number] = (() => {
  const v = [88, 38, 50];
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l] as const;
})();

/** Sky dome vertex stage (the shift look's dome; the original look draws the engine `sky.gradient`, `daySkyOptions`). */
export const SKY_VERTEX = /* glsl */ `
out vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/** A3/W6: WGSL twin for the WebGPU backend. */
export const SKY_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct SkyVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) w: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> SkyVarying {
  var out: SkyVarying;
  let wp = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.w = wp.xyz;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * wp);
  return out;
}`);

/** An sRGB triple (0..1) as the nearest hex colour. */
const hex = (r: number, g: number, b: number): string => `#${[r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;

/**
 * 5.7.0: the original look's day sky on the engine `sky.gradient` (stylised profile) instead of a 3600 m custom dome.
 * Same colours as the 5.6 program within 1/255 (tests/unit/sky/game-sky-migration-parity.test.ts): horizon to mid over
 * `smoothstep(0, 0.09, y)`, to top over `smoothstep(0.08, 0.36, y)`, the horizon colour below the horizon, and a warm
 * sun glow `0.24 * pow(cos, 28) + 0.65 * pow(cos, 260)` with no disc. The 5.6 colours were 3-decimal sRGB triples;
 * the nearest hex is within 0.06 of a display code value.
 */
export const daySkyOptions = (): AuraSkyGradientOptions => ({
  name: "sky",
  style: "stylized",
  horizon: hex(0.839, 0.918, 0.973),
  mid: { color: hex(0.345, 0.627, 0.863), blend: [0, 0.09] },
  zenith: hex(0.114, 0.388, 0.722),
  zenithBlend: [0.08, 0.36],
  sun: {
    elevationDeg: (Math.asin(SUN_DIR[1]) * 180) / Math.PI,
    azimuthDeg: (Math.atan2(SUN_DIR[0], SUN_DIR[2]) * 180) / Math.PI,
    color: hex(1.0, 0.941, 0.831),
    glow: [{ exponent: 28, intensity: 0.24 }, { exponent: 260, intensity: 0.65 }],
    discIntensity: 0
  },
  captureEnvironment: false,
  affectsFog: false
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

/** A3/W6: WGSL twin for the WebGPU backend; WebGL2 keeps drawing the GLSL (same pixels as before). Line for line. */
export const FAR_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct FarVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> FarVarying {
  var out: FarVarying;
  out.uv = a_uv;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)));
  return out;
}`);

export const FAR_FRAGMENT_WGSL = wgslStage([WGSL_COLOR], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(a3dSrgbToLinear(textureSample(u_farPaletteTexture, u_farPaletteSampler, vUv).rgb), 1.0);
}`);

export const farCitySpec = (palette: unknown): CustomSpec => ({
  glsl: { vertex: FAR_VERTEX, fragment: FAR_FRAGMENT },
  wgsl: { vertex: FAR_VERTEX_WGSL, fragment: FAR_FRAGMENT_WGSL },
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
  vec3 col = mix(skyHorizon, skyMid, smoothstep(0.0, 0.09, h));
  col = mix(col, skyTop, smoothstep(0.08, 0.36, h));
  vec3 sd = normalize(sunDirection);
  float glow = a3dSunGlow(dir, sd, 22.0) * 0.24 + a3dSunGlow(dir, sd, 120.0) * 0.55;
  col += skyGlow * glow * smoothstep(-0.12, 0.05, sd.y);
  col += skyGlow * 2.6 * a3dSunDisc(dir, sd, 0.012) * smoothstep(-0.02, 0.02, sd.y);
  // post-rain cumulus: fbm on the dome projected over the horizon, lit from the sun side
  vec2 cp = dir.xz / max(dir.y + 0.12, 0.05) * 0.9 + vec2(skyDrift, 0.0);
  float n = a3dFbm(cp, 5);
  float cov = smoothstep(1.0 - skyClouds, 1.0 - skyClouds + 0.32, n) * smoothstep(0.05, 0.22, h);
  float lit = 0.55 + 0.45 * clamp(dot(normalize(vec3(dir.x, 0.0, dir.z) + 1e-4), normalize(vec3(sd.x, 0.0, sd.z) + 1e-4)), 0.0, 1.0);
  vec3 cloud = mix(skyMid * 0.92, skyGlow * 0.92, lit * 0.42) * (0.82 + 0.22 * n);
  col = mix(col, cloud, cov * 0.56);
  // stars above 10 deg, behind the clouds
  float stars = a3dStars(dir, 0.0035) * smoothstep(0.17, 0.35, h) * skyStars * (1.0 - cov);
  col += vec3(0.85, 0.9, 1.0) * stars * 1.6;
  outColor = vec4(col, 1.0);
}`;

/** A3/W6: WGSL twin for the WebGPU backend; WebGL2 keeps drawing the GLSL (same pixels as before). Line for line. */
export const SHIFT_SKY_FRAGMENT_WGSL = wgslStage([WGSL_MATH, WGSL_NOISE, WGSL_SKY], /* wgsl */ `
@fragment fn fs_main(@location(0) vW: vec3<f32>) -> @location(0) vec4<f32> {
  let dir = normalize(vW - aura.u_cameraPosition);
  let h = max(dir.y, 0.0);
  var col = mix(aura.u_skyHorizon, aura.u_skyMid, vec3<f32>(smoothstep(0.0, 0.09, h)));
  col = mix(col, aura.u_skyTop, vec3<f32>(smoothstep(0.08, 0.36, h)));
  let sd = normalize(aura.u_sunDirection);
  let glow = a3dSunGlow(dir, sd, 22.0) * 0.24 + a3dSunGlow(dir, sd, 120.0) * 0.55;
  col = col + aura.u_skyGlow * glow * smoothstep(-0.12, 0.05, sd.y);
  col = col + aura.u_skyGlow * 2.6 * a3dSunDisc(dir, sd, 0.012) * smoothstep(-0.02, 0.02, sd.y);
  let cp = dir.xz / max(dir.y + 0.12, 0.05) * 0.9 + vec2<f32>(aura.u_skyDrift, 0.0);
  let n = a3dFbm2(cp, 5);
  let cov = smoothstep(1.0 - aura.u_skyClouds, 1.0 - aura.u_skyClouds + 0.32, n) * smoothstep(0.05, 0.22, h);
  let lit = 0.55 + 0.45 * clamp(dot(normalize(vec3<f32>(dir.x, 0.0, dir.z) + vec3<f32>(1e-4)), normalize(vec3<f32>(sd.x, 0.0, sd.z) + vec3<f32>(1e-4))), 0.0, 1.0);
  let cloud = mix(aura.u_skyMid * 0.92, aura.u_skyGlow * 0.92, vec3<f32>(lit * 0.42)) * (0.82 + 0.22 * n);
  col = mix(col, cloud, vec3<f32>(cov * 0.56));
  let stars = a3dStars(dir, 0.0035) * smoothstep(0.17, 0.35, h) * aura.u_skyStars * (1.0 - cov);
  col = col + vec3<f32>(0.85, 0.9, 1.0) * stars * 1.6;
  return vec4<f32>(col, 1.0);
}`);

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
  wgsl: { vertex: SKY_VERTEX_WGSL, fragment: SHIFT_SKY_FRAGMENT_WGSL },
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

/** A3/W6: WGSL twin for the WebGPU backend; WebGL2 keeps drawing the GLSL (same pixels as before). Line for line. */
export const SHIFT_FAR_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct ShiftFarVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) w: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> ShiftFarVarying {
  var out: ShiftFarVarying;
  out.uv = a_uv;
  let wp = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.w = wp.xyz;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * wp);
  return out;
}`);

export const SHIFT_FAR_FRAGMENT_WGSL = wgslStage([WGSL_COLOR, WGSL_NOISE, WGSL_FOG], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vW: vec3<f32>) -> @location(0) vec4<f32> {
  var base = a3dSrgbToLinear(textureSample(u_farPaletteTexture, u_farPaletteSampler, vUv).rgb) * aura.u_farLight;
  let cell = floor(vec2<f32>((vW.x + vW.z) / 6.0, vW.y / 3.5));
  let lit = step(1.0 - aura.u_farLitFraction, a3dHash21(cell)) * step(6.0, vW.y);
  let f = fract(vec2<f32>((vW.x + vW.z) / 6.0, vW.y / 3.5));
  let pane = step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.8);
  base = base + vec3<f32>(1.0, 0.72, 0.38) * lit * pane * aura.u_farWindows * 2.2;
  let dist = length(vW - aura.u_cameraPosition);
  return vec4<f32>(a3dFogExp2(base, aura.u_farFogColor, dist, aura.u_farFogDensity), 1.0);
}`);

export interface ShiftFarUniforms {
  farLight: number;
  farFogColor: readonly [number, number, number];
  farFogDensity: number;
  farWindows: number;
  farLitFraction: number;
}

export const shiftFarSpec = (palette: unknown, u: ShiftFarUniforms): CustomSpec => ({
  glsl: { vertex: SHIFT_FAR_VERTEX, fragment: SHIFT_FAR_FRAGMENT },
  wgsl: { vertex: SHIFT_FAR_VERTEX_WGSL, fragment: SHIFT_FAR_FRAGMENT_WGSL },
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
