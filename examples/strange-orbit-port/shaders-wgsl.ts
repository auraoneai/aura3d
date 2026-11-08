/**
 * WGSL twins of the port's `material.custom` programs (shaders.ts), for `?backend=webgpu`. Each stage follows its GLSL
 * original line for line, per look where the GLSL varies (`gouache` / `original`), so WebGPU computes the same values;
 * WebGL2 keeps drawing the untouched GLSL (default pixels unchanged). Authored uniform `foo` reads as `aura.u_foo`.
 *
 * Mapping notes:
 *   - The GLSL adapter wraps `pow` as `pow(max(abs(x), 1e-30), y)`; the twins call `a3dPow` / `a3dPow3` with that body.
 *   - `a3d_lights` / `a3d_scene` / `a3d_shadow` are the shared WGSL halves in ../shared/wgsl-author-lights.ts.
 *   - `normalMatrix` is `mat3(u_normalMatrix)` (`a3dMat3Mul`); `dFdx` / `dFdy` are `dpdx` / `dpdy`. The track's screen-space
 *     bump is invariant to WebGPU's flipped y derivative (r1, det and dFdy(h) all change sign together).
 *   - Vertex inputs sit at the WebGPU geometry locations: position 0, normal 1, uv 2, then author attributes from the custom
 *     pool in name order (track: paintOriginal 3, pigmentBase 5, pigmentChalk 6, pigmentVein 8; points: fade 3, size 5, tint 6).
 *   - Point sprites: WebGPU has no `gl_PointSize` / `gl_PointCoord`, so the points twin draws one-pixel points
 *     (`@aura3d-point-list`) with the sprite centre's value (the documented WebGPU difference).
 */
import { WGSL_CLIP, wgslStage } from "../../apps/showcase-port-shared/wgsl-twins";
import { WGSL_A3D_LIGHTS, WGSL_A3D_SCENE, WGSL_A3D_SHADOW } from "../shared/wgsl-author-lights";
import { GIANT_POSITION, LOOKS } from "./art/look";
import { TRACK_GLAZE, TRACK_MARK_WARP } from "./shaders";

const POW = /* wgsl */ `
fn a3dPow(x: f32, y: f32) -> f32 { return pow(max(abs(x), 1e-30), y); }
`;

/** shaders.ts NOISE. */
const NOISE = /* wgsl */ `
fn hash21(p0: vec2<f32>) -> f32 {
  var p = fract(p0 * vec2<f32>(123.34, 456.21));
  p = p + vec2<f32>(dot(p, p + vec2<f32>(45.32)));
  return fract(p.x * p.y);
}
fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2<f32>(1.0, 0.0)), u.x), mix(hash21(i + vec2<f32>(0.0, 1.0)), hash21(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}
fn fbm(p0: vec2<f32>) -> f32 {
  var a = 0.5;
  var s = 0.0;
  var p = p0;
  for (var i = 0; i < 4; i = i + 1) { s = s + a * vnoise(p); p = p * 2.03 + vec2<f32>(17.1); a = a * 0.5; }
  return s;
}
`;

const HEMI_GAIN = 1.8;

/** shaders.ts `lighting(gouache)`: split tone, `shade` (a3dDirect + hemisphere) and the fog `haze`. */
const lighting = (gouache: boolean): string => /* wgsl */ `
${WGSL_A3D_SCENE}
${WGSL_A3D_SHADOW}
${WGSL_A3D_LIGHTS}
const HEMI_GAIN: f32 = ${HEMI_GAIN.toFixed(2)};
fn splitTone(c0: vec3<f32>) -> vec3<f32> {
  var c = c0;${gouache ? `
  let l = dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
  let w = smoothstep(0.04, 0.55, l);
  c = c * mix(vec3<f32>(0.84, 0.93, 1.22), vec3<f32>(1.10, 1.0, 0.84), vec3<f32>(w));` : ""}
  return c;
}
fn shade(albedo: vec3<f32>, N: vec3<f32>, emissive: vec3<f32>, world: vec3<f32>) -> vec3<f32> {
  let V = normalize(aura.u_cameraPosition - world);
  let direct = a3dDirect(N, V, albedo, 0.9, world);
  let hemi = albedo * a3dHemiLight(N) * (HEMI_GAIN / 3.14159265);
  return splitTone(direct + hemi) + emissive;
}
fn haze(c: vec3<f32>, world: vec3<f32>) -> vec3<f32> {
  let d = length(world - aura.u_cameraPosition);
  let x = max(aura.u_a3dFogDensity, 0.0) * d;
  var f = 1.0 - exp(-x * x);${gouache ? `
  let below = clamp(-world.y / 28.0, 0.0, 1.0);
  f = max(f, below * 0.6 * (1.0 - exp(-d / 140.0)));
  return mix(c, aura.u_a3dFogColor, vec3<f32>(clamp(f, 0.0, 0.78)));` : `
  return mix(c, aura.u_a3dFogColor, vec3<f32>(clamp(f, 0.0, 0.82)));`}
}
`;

export const TRACK_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct TrackVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) base: vec3<f32>,
  @location(4) vein: vec3<f32>,
  @location(5) chalk: vec3<f32>,
  @location(6) original: f32,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>,
  @location(3) paintOriginal: f32, @location(5) pigmentBase: vec3<f32>, @location(6) pigmentChalk: vec3<f32>, @location(8) pigmentVein: vec3<f32>) -> TrackVarying {
  var out: TrackVarying;
  let world = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.world = world.xyz;
  out.normal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.uv = a_uv;
  out.base = pigmentBase;
  out.vein = pigmentVein;
  out.chalk = pigmentChalk;
  out.original = paintOriginal;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/** shaders.ts GIANT_COS (the gas giant's angular radius from the orbit ring). */
const GIANT_COS = Math.cos(Math.atan(LOOKS.gouache.planet.size / 2 / Math.hypot(GIANT_POSITION[0], GIANT_POSITION[2])));

/** shaders.ts `trackFragment(gouache)`. */
export const trackFragmentWgsl = (gouache: boolean): string => wgslStage([POW, NOISE, lighting(gouache)], /* wgsl */ `
const TRACK_MARK_WARP: f32 = ${TRACK_MARK_WARP.toFixed(1)};
const GLAZE: f32 = ${TRACK_GLAZE.toFixed(2)};
const GIANT_COS: f32 = ${GIANT_COS.toFixed(4)};
fn paintNoise(p: vec2<f32>) -> f32 { return fbm(p + vec2<f32>(fbm(p * 0.35) * 4.0, 0.0)); }
fn markNoise(p: vec2<f32>) -> f32 { return fbm(p + vec2<f32>(fbm(p * 0.35) * TRACK_MARK_WARP, 0.0)); }
@fragment fn fs_main(@location(0) vWorld: vec3<f32>, @location(1) vNormal: vec3<f32>, @location(2) vUv: vec2<f32>, @location(3) vBase: vec3<f32>,
  @location(4) vVein: vec3<f32>, @location(5) vChalk: vec3<f32>, @location(6) vOriginal: f32) -> @location(0) vec4<f32> {
  let N0 = normalize(vNormal);
  var bw = a3dPow3(abs(N0), vec3<f32>(4.0));
  bw = bw / (bw.x + bw.y + bw.z + 1e-5);
  let wq = vWorld * 0.42;
  let streak = bw.x * markNoise(wq.yz) + bw.y * markNoise(wq.xz) + bw.z * markNoise(wq.xy);
  let grain = vnoise(wq.xz * 6.0 + vec2<f32>(wq.y * 3.1, 0.0));
  let sampled = mix(vec3<f32>(0.50, 0.36, 0.30), vec3<f32>(0.93, 0.74, 0.58), vec3<f32>(streak)) * (0.9 + 0.2 * grain);
  let lum = dot(sampled, vec3<f32>(0.2126, 0.7152, 0.0722));
  let warm = smoothstep(-0.005, 0.12, sampled.r - sampled.g);
  var pigment = mix(vVein, vBase, vec3<f32>(warm));
  pigment = mix(pigment, vChalk, vec3<f32>(smoothstep(0.29, 0.73, lum) * 0.84));
  var original = sampled;
  let warmMask = smoothstep(0.015, 0.18, original.r - original.g);
  original = mix(original, vec3<f32>(0.56, 0.285, 0.245) * (0.65 + lum), vec3<f32>(warmMask * 0.38));
  original = mix(original, vec3<f32>(lum), vec3<f32>(0.09));
  original = original * mix(vec3<f32>(0.94), vec3<f32>(0.88, 0.67, 0.55), vec3<f32>(warmMask));
  var albedo = mix(pigment * (0.24 + 1.38 * a3dPow(max(0.0, lum), 0.65)), original, vec3<f32>(vOriginal));
  var N = normalize(vNormal);
  if (dot(N, aura.u_cameraPosition - vWorld) < 0.0) { N = -N; }
  let vq = vWorld * 0.16;
  let veinNoise = bw.x * paintNoise(vq.yz * 1.6) + bw.y * paintNoise(vq.xz * 1.6) + bw.z * paintNoise(vq.xy * 1.6);
  let vein = smoothstep(0.5, 0.68, veinNoise);
  albedo = mix(albedo, vec3<f32>(0.08, 0.36, 0.38), vec3<f32>(vein * 0.62));
  albedo = albedo * vec3<f32>(0.80, 0.60, 0.52);
  let across = smoothstep(0.0, 0.07, vUv.y) * smoothstep(1.0, 0.93, vUv.y);
  albedo = albedo * mix(0.5, 1.0, across);
  let h = bw.x * fbm(wq.yz * 2.2) + bw.y * fbm(wq.xz * 2.2) + bw.z * fbm(wq.xy * 2.2);
  let dpx = dpdx(vWorld);
  let dpy = dpdy(vWorld);
  let r1 = cross(dpy, N);
  let r2 = cross(N, dpx);
  let det = dot(dpx, r1);
  N = normalize(abs(det) * N - ${gouache ? "0.09" : "0.05"} * sign(det) * (dpdx(h) * r1 + dpdy(h) * r2));
  let emissive = albedo * ${gouache ? "0.09" : "0.1"} + ${gouache ? "vec3<f32>(0.82, 0.52, 0.22)" : "vec3<f32>(0.18, 0.72, 0.66)"} * (1.0 - across) * 0.3;
  var lit = shade(albedo, N, emissive, vWorld);${gouache ? `
  let Vg = normalize(aura.u_cameraPosition - vWorld);
  let Rg = reflect(-Vg, N);
  let fres = 0.04 + 0.96 * a3dPow(1.0 - max(dot(N, Vg), 0.0), 5.0);
  let toGiant = normalize(vec3<f32>(${GIANT_POSITION.map((v) => v.toFixed(1)).join(", ")}) - vWorld);
  let gd = dot(Rg, toGiant);
  var refl = mix(vec3<f32>(0.02, 0.05, 0.07), vec3<f32>(0.12, 0.33, 0.34), vec3<f32>(smoothstep(-0.05, 0.55, Rg.y)));
  let giantBands = 0.85 + 0.15 * sin(Rg.y * 90.0);
  refl = mix(refl, vec3<f32>(0.98, 0.72, 0.54) * giantBands, vec3<f32>(smoothstep(GIANT_COS - 0.006, GIANT_COS + 0.006, gd)));
  refl = refl + normalize(aura.u_a3dSunColor + vec3<f32>(1e-4)) * a3dPow(max(dot(Rg, normalize(aura.u_a3dSunDirection)), 0.0), 260.0) * 5.0 * a3dSunShadowAuto(vWorld, N);
  let line = smoothstep(0.16, 0.34, vUv.y) * smoothstep(0.84, 0.66, vUv.y);
  let polish = line * mix(0.45, 1.0, smoothstep(0.42, 0.62, streak));
  lit = lit + refl * fres * polish * GLAZE;` : ""}
  return vec4<f32>(haze(lit, vWorld), 1.0);
}`);

/** MINERAL_VERTEX and SOLID_VERTEX (the same three varyings; one WGSL stage at fixed locations: object 0, normal 1, world 2). */
export const OBJECT_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct ObjectVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) object: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) world: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>) -> ObjectVarying {
  var out: ObjectVarying;
  out.object = a_position;
  out.world = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.normal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/** shaders.ts `mineralFragment(gouache)`. */
export const mineralFragmentWgsl = (gouache: boolean): string => wgslStage([POW, lighting(gouache)], /* wgsl */ `
@fragment fn fs_main(@location(0) vObject: vec3<f32>, @location(1) vNormal: vec3<f32>, @location(2) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let strata = sin(vObject.y * 3.6 + sin(vObject.z * 1.8) * 1.1 + sin(vObject.x * 2.1));
  let fine = sin(vObject.y * 37.0 + sin(vObject.z * 11.0) * 1.6);
  var albedo = aura.u_baseColor * (0.9 + 0.08 * strata + 0.02 * fine);
  if (aura.u_opal > 0.5) { albedo = albedo * mix(vec3<f32>(0.64, 0.88, 1.0), vec3<f32>(1.0, 0.69, 0.86), vec3<f32>(strata * 0.5 + 0.5)); }
  var N = normalize(vNormal);
  if (dot(N, aura.u_cameraPosition - vWorld) < 0.0) { N = -N; }
  let glow = select(0.025, 0.17, aura.u_opal > 0.5);
  return vec4<f32>(haze(shade(albedo, N, albedo * glow, vWorld), vWorld), 1.0);
}`);

/** shaders.ts `solidFragment(gouache)`. */
export const solidFragmentWgsl = (gouache: boolean): string => wgslStage([POW, NOISE, lighting(gouache)], /* wgsl */ `
@fragment fn fs_main(@location(0) vObject: vec3<f32>, @location(1) vNormal: vec3<f32>, @location(2) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  var albedo = aura.u_baseColor;
  if (aura.u_banding > 0.0) {
    let b = fbm(vec2<f32>(vObject.y * aura.u_banding, vObject.x * aura.u_banding * 0.4 + vObject.z * aura.u_banding * 0.3));
    albedo = mix(aura.u_baseColor, aura.u_glowColor, vec3<f32>(b * 0.9));
  }
  var N = normalize(vNormal);
  if (dot(N, aura.u_cameraPosition - vWorld) < 0.0) { N = -N; }
  let unbanded = select(1.0, 0.0, aura.u_banding > 0.0);
  let emissive = aura.u_glowColor * aura.u_glow * unbanded;
  let V = normalize(aura.u_cameraPosition - vWorld);
  let keyDir = normalize(aura.u_a3dSunDirection);
  let fres = a3dPow(1.0 - max(dot(N, V), 0.0), 3.0);
  let spec = a3dPow(max(dot(N, normalize(keyDir + V)), 0.0), 36.0);
  let gKey = a3dSunShadowAuto(vWorld, N);
  var lit = shade(albedo, N, emissive, vWorld);
  lit = lit + vec3<f32>(0.42, 0.58, 0.95) * fres * 0.34 * unbanded;
  lit = lit + normalize(aura.u_a3dSunColor + vec3<f32>(1e-4)) * 1.6 * spec * 0.28 * gKey * unbanded;${gouache ? `
  if (aura.u_banding > 0.0) { lit = max(lit, albedo * vec3<f32>(0.78, 0.5, 0.36)); }` : ""}
  return vec4<f32>(mix(lit, haze(lit, vWorld), vec3<f32>(select(1.0, 0.35, aura.u_banding > 0.0))), 1.0);
}`);

/** VEIL_VERTEX and RIDER_SHADOW_VERTEX (uv only). */
export const UV_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct UvVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> UvVarying {
  var out: UvVarying;
  out.uv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const VEIL_FRAGMENT_WGSL = wgslStage([POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let y = vUv.y * 13.0;
  let t = clamp((y + 0.6) / 13.5, 0.0, 1.0);
  let z = (vUv.x - 0.5) * 23.0;
  let edge = 10.1 - 8.3 * t * t - (1.3 * a3dPow(1.0 - t, 0.55) + 0.1);
  let mask = 1.0 - smoothstep(edge - 0.35, edge, abs(z));
  let stream = a3dPow(max(0.0, sin(z * 8.0 + sin(y * 0.65 - aura.u_veilTime) * 1.1 - aura.u_veilTime * 0.4)), 30.0);
  let rim = exp(-a3dPow((abs(z) - edge + 0.25) * 3.0, 2.0));
  let alpha = (stream * 0.09 + rim * 0.4) * mask * smoothstep(0.0, 0.7, y) * (1.0 - smoothstep(11.5, 13.0, y));
  return vec4<f32>(mix(vec3<f32>(0.48, 0.79, 1.0), vec3<f32>(1.0, 0.75, 0.3), vec3<f32>(0.65 + 0.35 * sin(aura.u_veilTime + y))), alpha * (1.0 + aura.u_veilPulse * 2.0));
}`);

export const RIDER_SHADOW_FRAGMENT_WGSL = wgslStage([POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let x = vUv.x;
  let y = vUv.y * 2.0 - 1.0;
  let blob = exp(-a3dPow((x - 0.3) / 0.16, 2.0) - a3dPow(y / 0.62, 2.0));
  let width = mix(0.5, 0.22, smoothstep(0.3, 1.0, x));
  let streak = smoothstep(0.12, 0.3, x) * (1.0 - smoothstep(0.65, 1.0, x)) * exp(-a3dPow(y / width, 2.0));
  let a = max(blob, streak * 0.75) * aura.u_shadowStrength;
  return vec4<f32>(0.07, 0.04, 0.10, a);
}`);

/** POINTS_VERTEX: one-pixel WebGPU points (no gl_PointSize); `size` is declared at its location but has no WebGPU effect. */
export const POINTS_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
// @aura3d-point-list: one-pixel WebGPU points (no gl_PointSize)
struct PointVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) tint: vec3<f32>,
  @location(1) fade: f32,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(3) fade: f32, @location(5) size: f32, @location(6) tint: vec3<f32>) -> PointVarying {
  var out: PointVarying;
  out.tint = tint;
  out.fade = fade;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/** POINTS_FRAGMENT at the sprite centre (gl_PointCoord = 0.5: d = 0, soft = 1). */
export const POINTS_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vTint: vec3<f32>, @location(1) vFade: f32) -> @location(0) vec4<f32> {
  return vec4<f32>(vTint * select(1.0, 1.4, aura.u_additive > 0.5), vFade);
}`);

/** NEBULA_VERTEX. */
export const NEBULA_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct NebulaVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) dir: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> NebulaVarying {
  var out: NebulaVarying;
  out.dir = normalize(a_position);
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/** shaders.ts `nebulaFragment(gouache)`. */
export const nebulaFragmentWgsl = (gouache: boolean): string => wgslStage([POW], /* wgsl */ `
fn h31(p0: vec3<f32>) -> f32 {
  var p = fract(p0 * 0.3183099 + vec3<f32>(0.1));
  p = p * 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
fn n3(x: vec3<f32>) -> f32 {
  let i = floor(x);
  var f = fract(x);
  f = f * f * (vec3<f32>(3.0) - 2.0 * f);
  return mix(
    mix(mix(h31(i), h31(i + vec3<f32>(1.0, 0.0, 0.0)), f.x), mix(h31(i + vec3<f32>(0.0, 1.0, 0.0)), h31(i + vec3<f32>(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(h31(i + vec3<f32>(0.0, 0.0, 1.0)), h31(i + vec3<f32>(1.0, 0.0, 1.0)), f.x), mix(h31(i + vec3<f32>(0.0, 1.0, 1.0)), h31(i + vec3<f32>(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
fn fbm3(p0: vec3<f32>) -> f32 {
  var a = 0.5;
  var s = 0.0;
  var p = p0;
  for (var i = 0; i < 5; i = i + 1) { s = s + a * n3(p); p = p * 2.02 + vec3<f32>(7.1, 3.7, 1.3); a = a * 0.5; }
  return s;
}
@fragment fn fs_main(@location(0) vDir: vec3<f32>) -> @location(0) vec4<f32> {
  let d = normalize(vDir);
  var col = ${gouache ? "mix(vec3<f32>(0.008, 0.022, 0.03), vec3<f32>(0.02, 0.055, 0.07), vec3<f32>(d.y * 0.5 + 0.5))" : "mix(vec3<f32>(0.012, 0.016, 0.045), vec3<f32>(0.035, 0.028, 0.085), vec3<f32>(d.y * 0.5 + 0.5))"};
  let band = exp(-a3dPow(dot(d, normalize(vec3<f32>(0.28, 0.92, -0.26))) * 3.2, 2.0));
  let c1 = fbm3(d * 2.4 + vec3<f32>(1.7, 0.3, 4.1));
  let c2 = fbm3(d * 5.1 + vec3<f32>(c1 * 1.6) + vec3<f32>(9.2, 2.2, 0.7));
  let cloud = a3dPow(clamp(c1 * 1.25, 0.0, 1.0), 2.2);
  let purple = ${gouache ? "vec3<f32>(0.05, 0.22, 0.27)" : "vec3<f32>(0.30, 0.11, 0.46)"};
  let teal = ${gouache ? "vec3<f32>(0.10, 0.40, 0.33)" : "vec3<f32>(0.04, 0.34, 0.42)"};
  let amber = ${gouache ? "vec3<f32>(0.70, 0.30, 0.13)" : "vec3<f32>(0.66, 0.30, 0.11)"};
  var neb = mix(purple, teal, vec3<f32>(smoothstep(0.30, 0.75, c2)));
  neb = mix(neb, amber, vec3<f32>(smoothstep(0.55, 0.9, fbm3(d * 1.7 + vec3<f32>(3.3, 8.8, 1.1))) * 0.7));
  col = col + neb * cloud * (0.10 + 0.55 * band);
  col = col + ${gouache ? "vec3<f32>(0.27, 0.22, 0.16)" : "vec3<f32>(0.20, 0.17, 0.30)"} * band * a3dPow(c2, 1.7) * 0.5;
  let lane = smoothstep(0.52, 0.74, fbm3(d * 3.4 + vec3<f32>(5.5, 1.2, 7.7)));
  col = col * (1.0 - 0.55 * lane * band);
  let a = aura.u_nebulaShift * 6.2831853;
  let k = vec3<f32>(0.57735);
  col = col * cos(a) + cross(k, col) * sin(a) + k * dot(k, col) * (1.0 - cos(a));
  return vec4<f32>(max(col, vec3<f32>(0.0)), 1.0);
}`);

/** ATMOS_VERTEX. */
export const ATMOS_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct AtmosVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) n: vec3<f32>,
  @location(1) world: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>) -> AtmosVarying {
  var out: AtmosVarying;
  out.world = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.n = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const ATMOS_FRAGMENT_WGSL = wgslStage([POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vN: vec3<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vN);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let f = a3dPow(1.0 - max(dot(N, V), 0.0), 2.4);
  let sun = clamp(dot(N, normalize(aura.u_a3dSunDirection)) * 0.6 + 0.55, 0.0, 1.0);
  return vec4<f32>(aura.u_atmoColor * f * (0.4 + 1.5 * sun), f * 0.9);
}`);
