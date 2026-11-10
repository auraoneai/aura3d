/**
 * WGSL twins of Lamplight Line's `material.custom` programs (shaders.ts: sky dome, cloud sea, weather / mote points, rain
 * streaks, overhead catenary wire, and Fresnel railway signal lenses), for `?backend=webgpu`. Line for line with the GLSL,
 * so WebGPU computes the same values. Authored uniform `foo` reads as `aura.u_foo`; the adapter's safe `pow` is `a3dPow`;
 * `#include <colorspace_decode>` is the shared `a3dSrgbToLinear`.
 *
 * Point sprites: WebGPU has no `gl_PointSize` / `gl_PointCoord`, so the points twin draws one-pixel points
 * (`@aura3d-point-list`) with the sprite centre's value (the documented WebGPU difference). Its inputs sit at the geometry's
 * custom-pool locations in name order (fade 3, size 5).
 */
import { WGSL_CLIP, WGSL_COLOR, wgslStage } from "../shared/wgsl-twins";

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
  let night = mix(vec3<f32>(0.11, 0.16, 0.33), vec3<f32>(0.011, 0.019, 0.078), vec3<f32>(a3dPow(h, 0.5)));
  var col = mix(day, night, vec3<f32>(aura.u_nightMix));
  let sd = max(dot(d, normalize(aura.u_sunDir)), 0.0);
  let sunCol = mix(vec3<f32>(1.0, 0.92, 0.72), vec3<f32>(0.78, 0.86, 1.0), vec3<f32>(aura.u_nightMix));
  let disc = smoothstep(mix(0.9994, 0.9988, aura.u_nightMix), 0.99985, sd);
  col = col + sunCol * (a3dPow(sd, 8.0) * 0.3 + a3dPow(sd, 64.0) * 0.46) * mix(1.0, 0.35, aura.u_nightMix);
  col = mix(col, sunCol * 1.62, vec3<f32>(disc));
  let cp = d.xz / max(d.y + 0.28, 0.12);
  var cl = smoothstep(0.52, 0.86, fbm(cp * 0.55 + vec2<f32>(0.0, 0.0)));
  cl = cl * smoothstep(0.0, 0.2, d.y);
  let cloudCol = mix(vec3<f32>(1.0, 0.985, 0.95), vec3<f32>(0.19, 0.24, 0.41), vec3<f32>(aura.u_nightMix));
  col = mix(col, cloudCol * (0.78 + 0.24 * a3dPow(sd, 3.0)), vec3<f32>(cl * 0.62));
  let haze = exp(-max(d.y, 0.0) * 7.0);
  col = mix(col, mix(aura.u_skyHorizon, vec3<f32>(0.06, 0.09, 0.2), vec3<f32>(aura.u_nightMix)), vec3<f32>(haze * 0.58));
  let star = step(0.9962, hash31(floor(d * 420.0)));
  col = col + vec3<f32>(star) * max(aura.u_nightMix, aura.u_starMix) * smoothstep(0.08, 0.45, d.y) * (1.0 - cl * 0.8);
  let sh = normalize(aura.u_sunDir.xz + vec2<f32>(1e-5));
  let dh = normalize(d.xz + vec2<f32>(1e-5));
  let az = max(dot(sh, dh), 0.0);
  col = col + vec3<f32>(1.0, 0.56, 0.31) * aura.u_afterglow * a3dPow(az, 2.8) * exp(-abs(d.y) * 8.5) * 0.66;
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
  let lit = clamp(0.5 + (n - e) * 9.5, 0.0, 1.0);
  let dayLo = vec3<f32>(0.65, 0.73, 0.88);
  let dayHi = vec3<f32>(1.0, 0.98, 0.93);
  let nightLo = vec3<f32>(0.038, 0.058, 0.15);
  let nightHi = vec3<f32>(0.21, 0.26, 0.45);
  let lo = mix(dayLo, nightLo, vec3<f32>(aura.u_nightMix));
  let hi = mix(dayHi, nightHi, vec3<f32>(aura.u_nightMix));
  var col = mix(lo, hi, vec3<f32>(smoothstep(0.24, 0.76, n * 0.75 + lit * 0.46)));
  let toSun = normalize(aura.u_sunDir.xz + vec2<f32>(1e-5));
  let sunSide = 0.5 + 0.5 * dot(normalize(vXZ - aura.u_cameraPosition.xz + vec2<f32>(1e-5)), toSun);
  let band = mix(aura.u_cloudValley, aura.u_cloudLit * mix(1.0, aura.u_sunGain, sunSide), vec3<f32>(smoothstep(0.24, 0.76, n * 0.75 + lit * 0.46)));
  col = mix(col, band, vec3<f32>(aura.u_bandMix));
  let dist = length(vXZ - aura.u_cameraPosition.xz);
  col = mix(col, aura.u_hazeColor, vec3<f32>(smoothstep(480.0, 3000.0, dist)));
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

export const CATENARY_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct CatenaryVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) world: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> CatenaryVarying {
  var out: CatenaryVarying;
  let world = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.uv = a_uv;
  out.world = world.xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const CATENARY_FRAGMENT_WGSL = wgslStage([POW, WGSL_COLOR], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let radial = clamp(1.0 - abs(vUv.x * 2.0 - 1.0), 0.0, 1.0);
  let sheen = a3dPow(radial, 1.8);
  let dist = length(vWorld - aura.u_cameraPosition);
  let nearFade = 1.0 - smoothstep(35.0, 160.0, dist);
  let waveA = smoothstep(0.9, 1.0, sin(vUv.y * 0.42 - aura.u_wirePhase * 3.6) * 0.5 + 0.5);
  let dew = smoothstep(0.86, 1.0, sin(vUv.y * 5.8 + 1.3) * 0.5 + 0.5) * sheen;
  let base = aura.u_wireTint * (0.55 + 0.85 * sheen);
  let corona = aura.u_arcTint * (waveA * 0.85 + dew * 0.45) * aura.u_arcBoost * nearFade;
  return vec4<f32>(a3dSrgbToLinear(base + corona), 1.0);
}`);

export const SIGNAL_LENS_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct SignalLensVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> SignalLensVarying {
  var out: SignalLensVarying;
  out.uv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SIGNAL_LENS_FRAGMENT_WGSL = wgslStage([WGSL_COLOR], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let clearAspect = step(1.5, vUv.y);
  let localUv = vec2<f32>(vUv.x, vUv.y - clearAspect * 2.0);
  let p = localUv * 2.0 - vec2<f32>(1.0);
  let r = length(p);
  let alpha = smoothstep(1.0, 0.78, r);
  let rings = 0.74 + 0.26 * sin(r * 22.0);
  let core = exp(-r * r * 5.2);
  let breath = 0.94 + 0.06 * sin(aura.u_signalPhase * 3.1 + clearAspect * 2.2);
  let hue = mix(aura.u_lensWarm, aura.u_lensClear, vec3<f32>(clearAspect));
  let col = mix(hue * rings, vec3<f32>(1.0, 0.97, 0.9), vec3<f32>(core * 0.62)) * breath * (1.15 + aura.u_nightBoost * 1.1);
  return vec4<f32>(a3dSrgbToLinear(col), alpha * (0.52 + 0.48 * core));
}`);

export const SPARK_CARD_VERTEX_WGSL = SIGNAL_LENS_VERTEX_WGSL;

export const SPARK_CARD_FRAGMENT_WGSL = wgslStage([WGSL_COLOR], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let fi = clamp(floor(aura.u_burstState.x), 0.0, 31.0);
  let col = fi - 8.0 * floor(fi / 8.0);
  let row = floor(fi / 8.0);
  let cellUv = (vec2<f32>(col, row) + clamp(vUv, vec2<f32>(0.02), vec2<f32>(0.98))) / vec2<f32>(8.0, 4.0);
  let tex = textureSample(u_sheetTexture, u_sheetSampler, cellUv);
  let a = tex.a * clamp(aura.u_burstState.y, 0.0, 1.0);
  let rgb = a3dSrgbToLinear(tex.rgb) * max(aura.u_burstState.z, 0.25);
  return vec4<f32>(rgb, a);
}`);
