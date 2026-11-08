/**
 * WGSL twins of the port's `material.custom` programs (shaders.ts: sky dome, cloud sea, weather / mote points, rain
 * streaks), for `?backend=webgpu`. Line for line with the GLSL, so WebGPU computes the same values; WebGL2 keeps drawing the
 * untouched GLSL (default pixels unchanged). Authored uniform `foo` reads as `aura.u_foo`; the adapter's safe `pow` is
 * `a3dPow`; `#include <colorspace_decode>` is the shared `a3dSrgbToLinear`.
 *
 * Point sprites: WebGPU has no `gl_PointSize` / `gl_PointCoord`, so the points twin draws one-pixel points
 * (`@aura3d-point-list`) with the sprite centre's value (the documented WebGPU difference). Its inputs sit at the geometry's
 * custom-pool locations in name order (fade 3, size 5).
 */
import { WGSL_CLIP, WGSL_COLOR, wgslStage } from "../../apps/showcase-port-shared/wgsl-twins";

const POW = /* wgsl */ `
fn a3dPow(x: f32, y: f32) -> f32 { return pow(max(abs(x), 1e-30), y); }
`;

/** shaders.ts HASH. */
const HASH = /* wgsl */ `
fn hash31(p0: vec3<f32>) -> f32 {
  var p = fract(p0 * 0.3183099 + vec3<f32>(0.1));
  p = p * 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
fn hash21(p0: vec2<f32>) -> f32 {
  var p = fract(p0 * vec2<f32>(123.34, 456.21));
  p = p + vec2<f32>(dot(p, p + vec2<f32>(45.32)));
  return fract(p.x * p.y);
}
fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2<f32>(1.0, 0.0)), f.x), mix(hash21(i + vec2<f32>(0.0, 1.0)), hash21(i + vec2<f32>(1.0, 1.0)), f.x), f.y);
}
`;

export const SKY_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct SkyVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) dir: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> SkyVarying {
  var out: SkyVarying;
  out.dir = normalize(a_position);
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SKY_FRAGMENT_WGSL = wgslStage([POW, WGSL_COLOR, HASH], /* wgsl */ `
fn fbm(p: vec2<f32>) -> f32 {
  return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + vec2<f32>(7.1)) + 0.125 * vnoise(p * 4.07 + vec2<f32>(3.3)) + 0.0625 * vnoise(p * 8.1 + vec2<f32>(1.7));
}
@fragment fn fs_main(@location(0) vDir: vec3<f32>) -> @location(0) vec4<f32> {
  let d = normalize(vDir);
  let h = clamp(d.y * 1.5 + 0.1, 0.0, 1.0);
  let day = mix(aura.u_skyHorizon, aura.u_skyTop, vec3<f32>(a3dPow(h, 0.6)));
  let night = mix(vec3<f32>(0.12, 0.17, 0.34), vec3<f32>(0.012, 0.02, 0.08), vec3<f32>(a3dPow(h, 0.5)));
  var col = mix(day, night, vec3<f32>(aura.u_nightMix));
  let sd = max(dot(d, normalize(aura.u_sunDir)), 0.0);
  let sunCol = mix(vec3<f32>(1.0, 0.93, 0.74), vec3<f32>(0.78, 0.86, 1.0), vec3<f32>(aura.u_nightMix));
  let disc = smoothstep(mix(0.9994, 0.9988, aura.u_nightMix), 0.99985, sd);
  col = col + sunCol * (a3dPow(sd, 8.0) * 0.28 + a3dPow(sd, 64.0) * 0.45) * mix(1.0, 0.35, aura.u_nightMix);
  col = mix(col, sunCol * 1.6, vec3<f32>(disc));
  let cp = d.xz / max(d.y + 0.28, 0.12);
  var cl = smoothstep(0.52, 0.86, fbm(cp * 0.55 + vec2<f32>(0.0, 0.0)));
  cl = cl * smoothstep(0.0, 0.2, d.y);
  let cloudCol = mix(vec3<f32>(1.0, 0.99, 0.96), vec3<f32>(0.2, 0.25, 0.42), vec3<f32>(aura.u_nightMix));
  col = mix(col, cloudCol * (0.78 + 0.22 * a3dPow(sd, 3.0)), vec3<f32>(cl * 0.62));
  let haze = exp(-max(d.y, 0.0) * 7.0);
  col = mix(col, mix(aura.u_skyHorizon, vec3<f32>(0.06, 0.09, 0.2), vec3<f32>(aura.u_nightMix)), vec3<f32>(haze * 0.55));
  let star = step(0.9962, hash31(floor(d * 420.0)));
  col = col + vec3<f32>(star) * max(aura.u_nightMix, aura.u_starMix) * smoothstep(0.08, 0.45, d.y) * (1.0 - cl * 0.8);
  let sh = normalize(aura.u_sunDir.xz + vec2<f32>(1e-5));
  let dh = normalize(d.xz + vec2<f32>(1e-5));
  let az = max(dot(sh, dh), 0.0);
  col = col + vec3<f32>(1.0, 0.55, 0.32) * aura.u_afterglow * a3dPow(az, 3.0) * exp(-abs(d.y) * 9.0) * 0.6;
  if (d.y < 0.0) { col = mix(aura.u_skyHorizon, vec3<f32>(0.06, 0.09, 0.2), vec3<f32>(aura.u_nightMix)); }
  return vec4<f32>(a3dSrgbToLinear(col), 1.0);
}`);

export const CLOUD_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct CloudVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) xz: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> CloudVarying {
  var out: CloudVarying;
  let world = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.xz = world.xz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const CLOUD_FRAGMENT_WGSL = wgslStage([WGSL_COLOR, HASH], /* wgsl */ `
fn fbm(p: vec2<f32>) -> f32 {
  return 0.5 * vnoise(p) + 0.27 * vnoise(p * 2.1 + vec2<f32>(4.0)) + 0.14 * vnoise(p * 4.3 + vec2<f32>(9.0)) + 0.09 * vnoise(p * 9.1 + vec2<f32>(2.0));
}
@fragment fn fs_main(@location(0) vXZ: vec2<f32>) -> @location(0) vec4<f32> {
  let p = vXZ * 0.0036 + vec2<f32>(aura.u_cloudPhase * 0.016, aura.u_cloudPhase * 0.011);
  let n = fbm(p);
  let e = fbm(p + vec2<f32>(0.03, 0.02));
  let lit = clamp(0.5 + (n - e) * 9.0, 0.0, 1.0);
  let dayLo = vec3<f32>(0.66, 0.74, 0.88);
  let dayHi = vec3<f32>(1.0, 0.98, 0.93);
  let nightLo = vec3<f32>(0.04, 0.06, 0.15);
  let nightHi = vec3<f32>(0.2, 0.25, 0.44);
  let lo = mix(dayLo, nightLo, vec3<f32>(aura.u_nightMix));
  let hi = mix(dayHi, nightHi, vec3<f32>(aura.u_nightMix));
  var col = mix(lo, hi, vec3<f32>(smoothstep(0.25, 0.75, n * 0.75 + lit * 0.45)));
  let toSun = normalize(aura.u_sunDir.xz + vec2<f32>(1e-5));
  let sunSide = 0.5 + 0.5 * dot(normalize(vXZ - aura.u_cameraPosition.xz + vec2<f32>(1e-5)), toSun);
  let band = mix(aura.u_cloudValley, aura.u_cloudLit * mix(1.0, aura.u_sunGain, sunSide), vec3<f32>(smoothstep(0.25, 0.75, n * 0.75 + lit * 0.45)));
  col = mix(col, band, vec3<f32>(aura.u_bandMix));
  let dist = length(vXZ - aura.u_cameraPosition.xz);
  col = mix(col, aura.u_hazeColor, vec3<f32>(smoothstep(500.0, 3000.0, dist)));
  return vec4<f32>(a3dSrgbToLinear(col), 1.0);
}`);

/** POINTS_VERTEX: one-pixel WebGPU points (no gl_PointSize); `size` is declared at its location but has no WebGPU effect. */
export const POINTS_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
// @aura3d-point-list: one-pixel WebGPU points (no gl_PointSize)
struct PointVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) fade: f32,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(3) fade: f32, @location(5) size: f32) -> PointVarying {
  var out: PointVarying;
  out.fade = fade;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/** POINTS_FRAGMENT at the sprite centre (gl_PointCoord = 0.5: d = 0, alpha = vFade). */
export const POINTS_FRAGMENT_WGSL = wgslStage([WGSL_COLOR], /* wgsl */ `
@fragment fn fs_main(@location(0) vFade: f32) -> @location(0) vec4<f32> {
  return vec4<f32>(a3dSrgbToLinear(aura.u_weatherTint), vFade);
}`);

export const RAIN_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct RainVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) fade: f32,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(3) fade: f32) -> RainVarying {
  var out: RainVarying;
  out.fade = fade;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const RAIN_FRAGMENT_WGSL = wgslStage([WGSL_COLOR], /* wgsl */ `
@fragment fn fs_main(@location(0) vFade: f32) -> @location(0) vec4<f32> {
  return vec4<f32>(a3dSrgbToLinear(aura.u_rainTint), vFade);
}`);
