/**
 * WGSL twins of the port's sky dome programs (shaders.ts SKY_VERTEX with SKY_FRAGMENT / SKY_INK_FRAGMENT), for
 * `?backend=webgpu`. Line for line with the GLSL, so WebGPU computes the same values; WebGL2 keeps drawing the untouched GLSL
 * (default pixels unchanged). Authored uniform `foo` reads as `aura.u_foo`. The adapter's safe `pow` is `a3dPow`; GLSL
 * `atan(y, x)` is `atan2`. The canal draws with the portable water graph (water-graph.ts), which already has a WGSL half.
 */
import { WGSL_CLIP, wgslStage } from "../../apps/showcase-port-shared/wgsl-twins";

const POW = /* wgsl */ `
fn a3dPow(x: f32, y: f32) -> f32 { return pow(max(abs(x), 1e-30), y); }
`;

/** The sky fragments' `hash` / `noise`. */
const SKY_NOISE = /* wgsl */ `
fn hash(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453); }
fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2<f32>(1.0, 0.0)), f.x), mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0)), f.x), f.y);
}
`;

export const SKY_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct SkyVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) skyDirection: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> SkyVarying {
  var out: SkyVarying;
  out.skyDirection = a_position;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SKY_FRAGMENT_WGSL = wgslStage([POW, SKY_NOISE], /* wgsl */ `
@fragment fn fs_main(@location(0) skyDirection: vec3<f32>) -> @location(0) vec4<f32> {
  let dir = normalize(skyDirection);
  let h = smoothstep(-0.12, 0.62, dir.y);
  var day = mix(aura.u_skyBottom, aura.u_skyTop, vec3<f32>(h));
  let cp = dir.xz / max(0.18, dir.y + 0.25) * 1.6;
  let cl = noise(cp * 1.2) * 0.6 + noise(cp * 2.7 + vec2<f32>(7.0)) * 0.4;
  let dayCloud = smoothstep(0.5, 0.8, cl) * smoothstep(0.02, 0.2, dir.y) * (1.0 - smoothstep(0.55, 0.95, dir.y));
  day = mix(day, mix(vec3<f32>(1.0, 0.84, 0.7), aura.u_skyBottom * 1.15, vec3<f32>(0.3)), vec3<f32>(dayCloud * 0.7));
  var dark = mix(vec3<f32>(0.013, 0.029, 0.059), vec3<f32>(0.002, 0.005, 0.019), vec3<f32>(h));
  let p = vec2<f32>(atan2(dir.x, dir.z), asin(dir.y));
  let band = exp(-a3dPow((p.y - 0.16 - sin(p.x * 2.0) * 0.10) * 9.0, 2.0));
  let cloud = noise(dir.xz * 18.0 + vec2<f32>(dir.y * 7.0)) * 0.6 + noise(dir.xz * 43.0 + vec2<f32>(dir.y * 19.0)) * 0.3;
  dark = dark + mix(vec3<f32>(0.008, 0.026, 0.085), vec3<f32>(0.018, 0.115, 0.096), vec3<f32>(cloud)) * band * 0.65;
  let starP = p * 800.0;
  let sparkle = a3dPow(max(0.0, 1.0 - length(fract(starP) - vec2<f32>(0.5)) * 2.0), 12.0) * step(0.996, hash(floor(starP)));
  dark = dark + vec3<f32>(0.24, 0.36, 0.42) * sparkle * smoothstep(0.04, 0.3, dir.y);
  return vec4<f32>(mix(day, dark, vec3<f32>(aura.u_skyNight)), 1.0);
}`);

export const SKY_INK_FRAGMENT_WGSL = wgslStage([POW, SKY_NOISE], /* wgsl */ `
@fragment fn fs_main(@location(0) skyDirection: vec3<f32>) -> @location(0) vec4<f32> {
  let dir = normalize(skyDirection);
  let sd = normalize(aura.u_sunDir);
  let h = smoothstep(-0.08, 0.7, dir.y);
  var c = mix(aura.u_skyBottom, aura.u_skyTop, vec3<f32>(h));
  let cosA = dot(dir, sd);
  let glow = a3dPow(max(0.0, cosA), 24.0) * aura.u_skyGlow + a3dPow(max(0.0, cosA), 4.0) * aura.u_skyGlow * 0.18 * (1.0 - h);
  c = c + aura.u_sunColor * glow * (1.0 - aura.u_skyStorm * 0.85);
  let disc = smoothstep(cos(aura.u_sunSize * 1.08), cos(aura.u_sunSize), cosA);
  c = mix(c, aura.u_sunColor * 2.4, vec3<f32>(disc * (1.0 - aura.u_skyStorm)));
  let p = vec2<f32>(atan2(dir.x, dir.z), dir.y);
  let n = noise(vec2<f32>(p.x * 9.0, p.y * 3.0) + vec2<f32>(3.1));
  let band1 = exp(-a3dPow((p.y - 0.24 - sin(p.x * 1.5) * 0.04) * 38.0, 2.0));
  let band2 = exp(-a3dPow((p.y - 0.38 - sin(p.x * 2.3 + 1.7) * 0.05) * 52.0, 2.0));
  let cirrus = (band1 + band2 * 0.7) * smoothstep(0.35, 0.7, n) * aura.u_skyCirrus;
  c = mix(c, mix(aura.u_skyBottom, aura.u_sunColor, vec3<f32>(0.45)) * 1.08, vec3<f32>(clamp(cirrus, 0.0, 1.0) * 0.75));
  let dust = exp(-a3dPow(dir.y * 11.0, 2.0)) * (0.75 + 0.25 * noise(vec2<f32>(p.x * 14.0, 0.0))) * aura.u_skyDust;
  c = mix(c, aura.u_skyBottom * vec3<f32>(1.06, 0.98, 0.88), vec3<f32>(clamp(dust, 0.0, 1.0) * 0.6));
  let deck = noise(dir.xz / max(0.15, dir.y + 0.3) * 2.2) * 0.6 + noise(dir.xz / max(0.15, dir.y + 0.3) * 5.1) * 0.4;
  c = mix(c, mix(aura.u_skyTop, aura.u_skyBottom, vec3<f32>(0.2)) * (0.62 + 0.45 * deck), vec3<f32>(aura.u_skyStorm * smoothstep(0.03, 0.42, dir.y) * 0.85));
  let starP = vec2<f32>(atan2(dir.x, dir.z), asin(dir.y)) * 800.0;
  let sparkle = a3dPow(max(0.0, 1.0 - length(fract(starP) - vec2<f32>(0.5)) * 2.0), 12.0) * step(0.996, hash(floor(starP)));
  c = c + vec3<f32>(0.5, 0.56, 0.7) * sparkle * smoothstep(0.04, 0.3, dir.y) * aura.u_skyStars;
  c = c + vec3<f32>(0.82, 0.86, 1.0) * aura.u_skyFlash * (0.35 + 0.65 * smoothstep(-0.05, 0.45, dir.y));
  return vec4<f32>(c, 1.0);
}`);
