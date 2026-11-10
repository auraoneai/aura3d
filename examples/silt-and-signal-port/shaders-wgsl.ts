/**
 * WGSL twins for every `material.custom` program in `shaders.ts` (`?backend=webgpu` / `backend: "auto"`).
 * Uses `/* @aura3d-bindings * /` via `wgslStage`, `a3dRasterPosition(...)` for clip-space depth remap,
 * and `aura.u_<uniform>` bindings so WebGPU and WebGL2 render with 100% dual-backend parity.
 */
import { WGSL_CLIP, wgslStage } from "../shared/wgsl-twins";

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

const SURFACE_NOISE = /* wgsl */ `
fn hash21(p0: vec2<f32>) -> f32 {
  var p = fract(p0 * vec2<f32>(123.34, 456.21));
  p = p + dot(p, p + vec2<f32>(45.32));
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
  for (var i = 0; i < 4; i = i + 1) {
    s = s + a * vnoise(p);
    p = p * 2.03 + vec2<f32>(17.1);
    a = a * 0.5;
  }
  return s;
}
`;

const ROAD_WGSL = /* wgsl */ `
fn roadX(z: f32) -> f32 { return 82.0 + sin(z * 0.006) * 8.0; }
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
  let h = smoothstep(-0.08, 0.72, dir.y);
  let midBand = mix(aura.u_skyBottom * vec3<f32>(1.08, 0.94, 0.82), aura.u_skyTop, vec3<f32>(0.44));
  var c = mix(mix(aura.u_skyBottom, midBand, vec3<f32>(smoothstep(-0.06, 0.24, dir.y))), aura.u_skyTop, vec3<f32>(smoothstep(0.18, 0.76, dir.y)));
  let cosA = dot(dir, sd);
  let mie = a3dPow(max(0.0, cosA), 7.0) * exp(-max(0.0, dir.y) * 5.2) * aura.u_skyGlow * 0.42;
  let glow = a3dPow(max(0.0, cosA), 26.0) * aura.u_skyGlow + a3dPow(max(0.0, cosA), 4.0) * aura.u_skyGlow * 0.22 * (1.0 - h) + mie;
  c = c + aura.u_sunColor * glow * (1.0 - aura.u_skyStorm * 0.85);
  let disc = smoothstep(cos(aura.u_sunSize * 1.1), cos(aura.u_sunSize * 0.96), cosA);
  c = mix(c, aura.u_sunColor * 2.65, vec3<f32>(disc * (1.0 - aura.u_skyStorm)));
  let p = vec2<f32>(atan2(dir.x, dir.z), dir.y);
  let n = noise(vec2<f32>(p.x * 9.0, p.y * 3.0) + vec2<f32>(3.1)) * 0.68 + noise(vec2<f32>(p.x * 21.0 - 1.7, p.y * 7.5)) * 0.32;
  let band1 = exp(-a3dPow((p.y - 0.22 - sin(p.x * 1.5) * 0.04) * 36.0, 2.0));
  let band2 = exp(-a3dPow((p.y - 0.37 - sin(p.x * 2.3 + 1.7) * 0.05) * 50.0, 2.0));
  let band3 = exp(-a3dPow((p.y - 0.13 - cos(p.x * 1.9 - 0.8) * 0.03) * 44.0, 2.0)) * 0.55;
  let cirrus = (band1 + band2 * 0.72 + band3) * smoothstep(0.34, 0.72, n) * aura.u_skyCirrus;
  c = mix(c, mix(aura.u_skyBottom, aura.u_sunColor, vec3<f32>(0.52)) * 1.12, vec3<f32>(clamp(cirrus, 0.0, 1.0) * 0.78));
  let dust = exp(-a3dPow(dir.y * 9.5, 2.0)) * (0.72 + 0.28 * noise(vec2<f32>(p.x * 14.0, dir.y * 6.0))) * aura.u_skyDust;
  c = mix(c, mix(aura.u_skyBottom, aura.u_sunColor, vec3<f32>(0.22)) * vec3<f32>(1.08, 0.98, 0.86), vec3<f32>(clamp(dust, 0.0, 1.0) * 0.66));
  let deck = noise(dir.xz / max(0.15, dir.y + 0.3) * 2.2) * 0.6 + noise(dir.xz / max(0.15, dir.y + 0.3) * 5.1) * 0.4;
  c = mix(c, mix(aura.u_skyTop, aura.u_skyBottom, vec3<f32>(0.2)) * (0.62 + 0.45 * deck), vec3<f32>(aura.u_skyStorm * smoothstep(0.03, 0.42, dir.y) * 0.85));
  let starP = vec2<f32>(atan2(dir.x, dir.z), asin(dir.y)) * 800.0;
  let sparkle = a3dPow(max(0.0, 1.0 - length(fract(starP) - vec2<f32>(0.5)) * 2.0), 12.0) * step(0.996, hash(floor(starP)));
  c = c + vec3<f32>(0.55, 0.62, 0.78) * sparkle * smoothstep(0.04, 0.3, dir.y) * aura.u_skyStars;
  c = c + vec3<f32>(0.82, 0.86, 1.0) * aura.u_skyFlash * (0.35 + 0.65 * smoothstep(-0.05, 0.45, dir.y));
  return vec4<f32>(c, 1.0);
}`);

export const WATER_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct WaterVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> WaterVarying {
  var out: WaterVarying;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const WATER_FRAGMENT_WGSL = wgslStage([POW, SURFACE_NOISE, ROAD_WGSL], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let d = abs(vWorld.x - (roadX(vWorld.z) - aura.u_canalShift));
  let flow = vec2<f32>(vWorld.x * 0.12, vWorld.z * 0.05 + aura.u_siltTime * 0.35);
  let ripple = fbm(flow * 3.0) * 0.6 + fbm(flow * 9.0 + vec2<f32>(3.7)) * 0.4;
  let view = normalize(aura.u_cameraPosition - vWorld);
  let fres = a3dPow(1.0 - clamp(view.y, 0.0, 1.0), 3.0);
  let body = mix(aura.u_waterColor * 0.55, aura.u_waterColor * 1.3, vec3<f32>(ripple));
  let skyTint = mix(aura.u_waterColor * 1.7, vec3<f32>(0.78, 0.86, 0.9), vec3<f32>(0.55));
  var c = mix(body, skyTint, vec3<f32>(fres * 0.6));
  let glint = a3dPow(max(0.0, vnoise(flow * 24.0 + vec2<f32>(aura.u_siltTime * 0.4)) - 0.8) * 5.0, 2.0);
  c = c + vec3<f32>(1.0, 0.92, 0.78) * glint * 0.5;
  let foam = smoothstep(aura.u_canalHalf - 4.5, aura.u_canalHalf - 1.2, d) * (0.45 + 0.55 * vnoise(flow * 15.0));
  c = mix(c, vec3<f32>(0.93, 0.95, 0.9), vec3<f32>(foam * 0.7));
  if (aura.u_inkLook > 0.5) {
    let n = normalize(vec3<f32>((ripple - 0.5) * 0.35, 1.0, (fbm(flow * 5.0 + vec2<f32>(1.3)) - 0.5) * 0.35));
    let r = reflect(-view, n);
    let sd = max(0.0, dot(r, normalize(aura.u_sunDir)));
    let spec = a3dPow(sd, 420.0);
    let skyRef = mix(aura.u_inkSky, aura.u_inkSkyTop, vec3<f32>(smoothstep(0.02, 0.55, r.y)));
    c = mix(c, skyRef, vec3<f32>(0.28 + fres * 0.5));
    c = c + aura.u_sunColor * (spec * 1.4 + a3dPow(sd, 36.0) * 0.32 * (0.6 + 0.8 * ripple));
    let streak = smoothstep(0.62, 0.9, vnoise(vec2<f32>(vWorld.x * 0.6, vWorld.z * 0.02 + aura.u_siltTime * 0.9)));
    c = mix(c, vec3<f32>(0.86, 0.78, 0.62), vec3<f32>(streak * 0.18 + foam * 0.12));
  }
  let fogT = clamp(length(vWorld - aura.u_cameraPosition) / aura.u_fogFar, 0.0, 1.0);
  let alpha = 0.92 * (1.0 - smoothstep(aura.u_canalHalf - 1.2, aura.u_canalHalf, d));
  return vec4<f32>(mix(c, aura.u_fogColor, vec3<f32>(fogT * fogT)), alpha);
}`);

const LIT_WORLD_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct WorldVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>) -> WorldVarying {
  var out: WorldVarying;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const RING_VERTEX_WGSL = LIT_WORLD_VERTEX_WGSL;

export const RING_FRAGMENT_WGSL = wgslStage([POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let rim = a3dPow(1.0 - abs(dot(N, normalize(aura.u_cameraPosition - vWorld))), 1.6);
  let pulse = 0.65 + 0.35 * sin(aura.u_siltTime * 3.0 + vWorld.z * 0.05);
  let c = aura.u_ringColor * (0.3 + 0.8 * rim) * mix(1.0, pulse, aura.u_ringActive);
  return vec4<f32>(c, mix(0.3, 0.85, aura.u_ringActive));
}`);

export const DUNE_SAND_VERTEX_WGSL = LIT_WORLD_VERTEX_WGSL;

export const DUNE_SAND_FRAGMENT_WGSL = wgslStage([POW, SURFACE_NOISE, ROAD_WGSL], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let L = normalize(aura.u_sunDir);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let dist = length(aura.u_cameraPosition - vWorld);
  let warp = fbm(vWorld.xz * 0.045);
  let ripA = sin(vWorld.x * 2.15 + vWorld.z * 0.68 + warp * 5.6);
  let ripB = sin(vWorld.x * 0.92 - vWorld.z * 1.85 + fbm(vWorld.xz * 0.09 + vec2<f32>(4.3)) * 3.8);
  let ripple = ripA * 0.68 + ripB * 0.32;
  let ripFade = 1.0 - smoothstep(45.0, 260.0, dist);
  let N = normalize(vNormal + vec3<f32>(cos(vWorld.x * 2.15 + vWorld.z * 0.68 + warp * 5.6) * 0.22, 0.0, ripB * 0.11) * ripFade);
  let ndl = clamp(dot(N, L), 0.0, 1.0);
  let crest = smoothstep(-0.35, 0.65, ripple);
  var sandBase = mix(aura.u_sandShadow, mix(aura.u_sandSlope, aura.u_sandCrest, vec3<f32>(crest)), vec3<f32>(smoothstep(0.02, 0.78, ndl * 0.85 + 0.15)));
  let fres = a3dPow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);
  sandBase = sandBase + aura.u_sunColor * fres * (0.14 + 0.18 * max(0.0, dot(-V, L)));
  let H = normalize(L + V);
  let spec = a3dPow(max(0.0, dot(N, H)), 24.0);
  let g1 = hash21(floor(vWorld.xz * 24.0));
  let g2 = hash21(floor(vWorld.xz * 39.0 + vec2<f32>(13.7, 7.9)));
  let twinkle = 0.5 + 0.5 * sin(g1 * 62.83 + aura.u_siltTime * 2.6 + dot(vWorld.xz, V.xz) * 4.5);
  let mica = (step(0.968, g1) + step(0.982, g2) * 0.85) * twinkle * (0.35 + 1.65 * spec) * smoothstep(0.06, 0.45, ndl) * (1.0 - smoothstep(18.0, 185.0, dist));
  var c = sandBase + mix(vec3<f32>(1.0, 0.93, 0.78), aura.u_sunColor, vec3<f32>(0.45)) * mica * 1.85;
  let fogT = clamp(dist / aura.u_fogFar, 0.0, 1.0);
  c = mix(c, aura.u_fogColor, vec3<f32>(fogT * fogT * 0.88));
  var alpha = 1.0;
  if (aura.u_duneVeil > 0.5) {
    let rx = roadX(vWorld.z);
    let clearRoad = smoothstep(9.5, 17.5, abs(vWorld.x - rx));
    let clearCanal = smoothstep(aura.u_canalHalf + 1.0, aura.u_canalHalf + 8.5, abs(vWorld.x - (rx - aura.u_canalShift)));
    let clearPlaza = 1.0 - (1.0 - smoothstep(-145.0, -95.0, vWorld.z)) * (1.0 - smoothstep(78.0, 128.0, abs(vWorld.x))) * step(-95.0, vWorld.z);
    let slopeMask = smoothstep(0.45, 0.82, N.y);
    let nearFade = 1.0 - smoothstep(220.0, 520.0, dist);
    alpha = clamp((0.34 + 0.22 * crest + min(0.44, mica * 0.75)) * clearRoad * clearCanal * clearPlaza * slopeMask * nearFade, 0.0, 0.92);
  }
  return vec4<f32>(c, alpha);
}`);

export const STRATA_CLIFF_VERTEX_WGSL = LIT_WORLD_VERTEX_WGSL;

export const STRATA_CLIFF_FRAGMENT_WGSL = wgslStage([POW, SURFACE_NOISE], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let L = normalize(aura.u_sunDir);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let warp = (fbm(vec2<f32>(vWorld.x * 0.05 + vWorld.z * 0.05, vWorld.y * 0.08)) - 0.5) * 2.2;
  let grain = fbm(vec2<f32>(vWorld.x * 0.35 - vWorld.z * 0.28, vWorld.y * 0.65)) - 0.5;
  let f = vWorld.y * 0.34 + warp * 0.85;
  let layer = floor(f);
  let within = f - layer;
  let m = layer - 4.0 * floor(layer / 4.0);
  let b0 = vec3<f32>(0.56, 0.29, 0.17);
  let b1 = vec3<f32>(0.74, 0.46, 0.27);
  let b2 = vec3<f32>(0.42, 0.22, 0.15);
  let b3 = vec3<f32>(0.84, 0.62, 0.39);
  var albedo = select(select(select(b3, b2, m < 2.5), b1, m < 1.5), b0, m < 0.5);
  let seam = smoothstep(0.0, 0.08, within) * (1.0 - smoothstep(0.92, 1.0, within));
  albedo = albedo * (0.68 + 0.32 * seam) * (1.0 + grain * 0.28);
  let ledge = smoothstep(0.68, 0.88, N.y);
  albedo = mix(albedo, aura.u_sandCap * (0.94 + grain * 0.2), vec3<f32>(ledge));
  let ndl = clamp(dot(N, L), 0.0, 1.0);
  let hemi = 0.34 + 0.28 * (0.5 * N.y + 0.5);
  let rim = a3dPow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0) * 0.18;
  let lit = albedo * (aura.u_skyAmbient * hemi + aura.u_sunColor * (ndl * 0.92)) + aura.u_sunColor * rim;
  let fogT = clamp(length(aura.u_cameraPosition - vWorld) / aura.u_fogFar, 0.0, 1.0);
  return vec4<f32>(mix(lit, aura.u_fogColor, vec3<f32>(fogT * fogT * 0.9)), 1.0);
}`);
