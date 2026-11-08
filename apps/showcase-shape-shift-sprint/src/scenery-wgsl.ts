/**
 * A3/W6: WGSL twins of Shape Shift Sprint's game-local `material.custom` programs (scenery.ts), line for line, so a WebGPU
 * frame computes the same values. WebGL2 keeps drawing the untouched GLSL. Mapping notes: runner-kit/shaders-wgsl.ts.
 * Custom attributes: `tone` alone sits at 3; the drift layer's `anchor`, `drift`, `tone` (sorted) at 3, 5, 6.
 */
import { WGSL_CLIP, WGSL_POW, WGSL_SHOULDER, wgslStage } from "../../../examples/shared/runner-kit/index";

const VARYING = (tone: boolean): string => /* wgsl */ `
struct ToyVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
${tone ? "  @location(3) vTone: vec3<f32>," : ""}
};`;

/** `VERTEX(tone)`. */
export function toyVertexWgsl(tone: boolean): string {
  return wgslStage([WGSL_CLIP, VARYING(tone)], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>${tone ? ", @location(3) tone: vec3<f32>" : ""}) -> ToyVarying {
  var out: ToyVarying;
  out.vUv = a_uv;
${tone ? "  out.vTone = tone;" : ""}
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);
}

/** `FRAGMENT(tone, stripes)`. */
export function toyFragmentWgsl(tone: boolean, stripes = false): string {
  return wgslStage([WGSL_POW, WGSL_SHOULDER], /* wgsl */ `
fn ramp(d: f32) -> f32 {
  let c = d * 0.5 + 0.5;
  let fw = fwidth(c) * 0.5;
  return mix(0.52, 1.0, smoothstep(0.66 - fw, 0.66 + fw, c));
}
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(2) vUv: vec2<f32>${tone ? ", @location(3) vTone: vec3<f32>" : ""}) -> @location(0) vec4<f32> {
  var N = normalize(vNormal);
  let toCam = aura.u_cameraPosition - vWorld;
  if (dot(N, toCam) < 0.0) { N = -N; }
  let V = normalize(toCam);
  var base = aura.u_baseColor${tone ? " * vTone" : ""};
${stripes ? "  base = mix(aura.u_stripeA, aura.u_stripeB, step(0.5, fract(vWorld.z / aura.u_stripePeriod)));" : ""}
  let skyC = vec3<f32>(0.86, 0.93, 1.0);
  let groundC = vec3<f32>(0.36, 0.30, 0.46);
  let hemi = mix(groundC, skyC, 0.5 * N.y + 0.5) * 0.36;
  let L1 = normalize(vec3<f32>(5.0, 11.0, 7.5));
  let L2 = normalize(vec3<f32>(-7.0, 6.0, -6.0));
  let lit = hemi + vec3<f32>(0.66, 0.56, 0.42) * ramp(dot(N, L1)) + vec3<f32>(0.13, 0.18, 0.32) * ramp(dot(N, L2));
  var c = shoulder(base * lit);
  let rim = a3dPow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  c = c + vec3<f32>(1.0, 0.86, 0.72) * rim * aura.u_rimStrength;
  c = c + aura.u_emissive;
  let d = length(toCam);
  var f = 1.0 - exp(-max(d - aura.u_fogStart, 0.0) * aura.u_fogDensity);
  let low = clamp((-vWorld.y - 6.0) / 26.0, 0.0, 1.0);
  let fc = mix(aura.u_fogColor, aura.u_fogLow, low);
  f = clamp(max(f, low * 0.32), 0.0, 1.0);
  return vec4<f32>(mix(c, fc, f), aura.u_alpha);
}`);
}

export const SKY_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct SkyVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> SkyVarying {
  var out: SkyVarying;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SKY_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
fn hash(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453); }
fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2<f32>(1.0, 0.0)), u.x), mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}
fn fbm(p0: vec2<f32>) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var p = p0;
  for (var i = 0; i < 4; i = i + 1) { s = s + a * vnoise(p); p = p * 2.03 + vec2<f32>(1.7, 9.2); a = a * 0.5; }
  return s;
}
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let dir = normalize(vWorld - aura.u_cameraPosition);
  let y = dir.y;
  let zenith = vec3<f32>(0.090, 0.330, 0.760);
  let mid = vec3<f32>(0.300, 0.620, 0.900);
  let low = vec3<f32>(0.700, 0.820, 0.920);
  let horizon = aura.u_fogColor;
  var c = mix(horizon, low, smoothstep(0.0, 0.10, y));
  c = mix(c, mid, smoothstep(0.08, 0.32, y));
  c = mix(c, zenith, smoothstep(0.30, 0.85, y));
  let sun = normalize(vec3<f32>(-0.55, 0.16, -0.82));
  let s = max(dot(dir, sun), 0.0);
  c = c + vec3<f32>(1.0, 0.62, 0.34) * (a3dPow(s, 6.0) * 0.28 + a3dPow(s, 48.0) * 0.45) + vec3<f32>(1.0, 0.95, 0.85) * a3dPow(s, 900.0) * 3.0;
  let az = atan2(dir.x, -dir.z);
  let t = aura.u_time * 0.004;
  let q = vec2<f32>(az * 3.2 + t, y * 13.0);
  let band = smoothstep(0.015, 0.09, y) * (1.0 - smoothstep(0.20, 0.42, y));
  let cl = smoothstep(0.50, 0.78, fbm(q) * 0.85 + fbm(q * 2.7 + vec2<f32>(3.1)) * 0.3) * band;
  let hi = (1.0 - smoothstep(0.55, 0.9, y)) * smoothstep(0.32, 0.5, y);
  let cl2 = smoothstep(0.58, 0.8, fbm(vec2<f32>(az * 2.0 - t * 1.6, y * 5.0) + vec2<f32>(11.0))) * hi * 0.7;
  let cloudLit = mix(vec3<f32>(0.93, 0.89, 0.97), vec3<f32>(1.0, 0.97, 0.92), smoothstep(0.0, 0.3, y));
  c = mix(c, cloudLit + vec3<f32>(1.0, 0.7, 0.45) * a3dPow(s, 4.0) * 0.35, cl * 0.92);
  c = mix(c, vec3<f32>(0.97, 0.97, 1.0), cl2);
  c = mix(c, aura.u_fogLow, smoothstep(0.0, -0.18, y));
  return vec4<f32>(c, 1.0);
}`);

/** `CONTACT_VERTEX` (uv only; also the ring's vertex stage). */
export const CONTACT_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct ContactVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> ContactVarying {
  var out: ContactVarying;
  out.vUv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const CONTACT_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let ends = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
  let a = aura.u_alpha * a3dPow(1.0 - clamp(vUv.y, 0.0, 1.0), 2.2) * ends;
  return vec4<f32>(aura.u_baseColor, a);
}`);

export const RING_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let d = length(vUv - vec2<f32>(0.5)) * 2.0;
  let band = smoothstep(0.62, 0.78, d) * (1.0 - smoothstep(0.86, 1.0, d));
  let inner = (1.0 - smoothstep(0.0, 0.8, d)) * 0.25;
  return vec4<f32>(aura.u_baseColor, aura.u_alpha * (band + inner));
}`);

/** `DRIFT_VERTEX`: wraps each piece along z on uTime, bobs it and grows it in; outputs match `toyFragmentWgsl(true)`. */
export const DRIFT_VERTEX_WGSL = wgslStage([WGSL_CLIP, VARYING(true)], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) anchor: vec4<f32>, @location(5) drift: vec4<f32>, @location(6) tone: vec3<f32>) -> ToyVarying {
  var out: ToyVarying;
  out.vUv = a_uv;
  out.vTone = tone;
  let zx = drift.x + aura.u_time * drift.y;
  let z = zx - drift.z * floor(zx / drift.z) + drift.w;
  let grow = smoothstep(drift.w, drift.w + 24.0, z);
  let lp = a_position - vec3<f32>(anchor.xy, 0.0);
  var p = vec3<f32>(anchor.xy, 0.0) + lp * max(grow, 0.001);
  p.z = p.z + z;
  p.y = p.y + sin(aura.u_time * 0.7 + anchor.z) * anchor.w;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(p, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * vec4<f32>(out.vWorld, 1.0));
  return out;
}`);
