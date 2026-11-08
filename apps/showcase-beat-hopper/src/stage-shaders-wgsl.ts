/**
 * A3/W6: WGSL twins of Beat Hopper's stage programs (stage-shaders.ts), line for line, so a WebGPU frame computes the same
 * values. WebGL2 keeps drawing the untouched GLSL. Mapping notes: runner-kit/shaders-wgsl.ts (`tone` sits at 3). The
 * derivative calls in `LIT_FRAGMENT`'s optional features sit behind branches on uniforms, which WGSL accepts as uniform
 * control flow, exactly where the GLSL has them.
 */
import { WGSL_CLIP, WGSL_POW, wgslStage } from "../../../examples/shared/runner-kit/index";

/** `HAZE` (needs WGSL_POW). */
const HAZE = /* wgsl */ `
fn haze(c: vec3<f32>, w: vec3<f32>) -> vec3<f32> {
  let d = w - aura.u_cameraPosition;
  let dist = length(d);
  let f = 1.0 - exp(-a3dPow(dist * aura.u_uFogDensity, 1.6));
  let up = clamp(normalize(d).y * 2.2, 0.0, 1.0);
  let fogC = mix(aura.u_uFogColor, aura.u_uFogColor * 0.32, up);
  return mix(c, fogC, clamp(f, 0.0, 0.97));
}
`;

const HASH = /* wgsl */ `
fn hash12(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
  return fract((p3.x + p3.y) * p3.z);
}
`;

const WORLD_VARYING = /* wgsl */ `
struct WorldVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
};`;

/** `SKY_VERTEX` and `FLOOR_VERTEX`. */
export const WORLD_VERTEX_WGSL = wgslStage([WGSL_CLIP, WORLD_VARYING], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> WorldVarying {
  var out: WorldVarying;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SKY_FRAGMENT_WGSL = wgslStage([HASH], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let dir = normalize(vWorld - aura.u_cameraPosition);
  let y = dir.y;
  let az = atan2(dir.x, -dir.z);
  let zenith = vec3<f32>(0.0018, 0.0010, 0.0080);
  let high = vec3<f32>(0.0070, 0.0026, 0.0280);
  let mid = vec3<f32>(0.0420, 0.0080, 0.1000);
  let low = vec3<f32>(0.2600, 0.0250, 0.2000);
  let hor = vec3<f32>(0.7200, 0.0900, 0.2800);
  var c = zenith;
  c = mix(high, c, smoothstep(0.18, 0.75, y));
  c = mix(mid, c, smoothstep(0.06, 0.30, y));
  c = mix(low, c, smoothstep(0.012, 0.11, y));
  c = mix(hor, c, smoothstep(-0.004, 0.035, y));
  if (y < -0.004) { c = mix(hor, vec3<f32>(0.05, 0.008, 0.06), smoothstep(-0.004, -0.12, y)); }
  var neb = sin(az * 2.3 + sin(az * 5.1 + 1.3) * 0.8 + y * 6.0) * 0.5 + 0.5;
  neb = neb * smoothstep(0.08, 0.3, y) * (1.0 - smoothstep(0.45, 0.85, y));
  neb = neb * (0.55 + 0.45 * sin(az * 9.0 - y * 14.0 + 0.7));
  c = c + vec3<f32>(0.05, 0.012, 0.09) * neb + vec3<f32>(0.0, 0.03, 0.05) * neb * neb;
  let g = vec2<f32>(az * 70.0, y * 70.0);
  let id = floor(g);
  let h = hash12(id);
  if (h > 0.93 && y > 0.04) {
    let f = fract(g) - vec2<f32>(0.5) - (vec2<f32>(hash12(id + vec2<f32>(7.1)), hash12(id + vec2<f32>(3.7))) - vec2<f32>(0.5)) * 0.6;
    let s = smoothstep(0.16, 0.0, length(f));
    let tw = 0.6 + 0.4 * sin(aura.u_uClock * (1.5 + h * 4.0) + h * 60.0);
    c = c + vec3<f32>(0.75, 0.7, 1.0) * s * tw * smoothstep(0.04, 0.2, y) * (h - 0.93) * 14.0;
  }
  let sd = aura.u_uSunDir;
  let sx = atan2(dir.x, -dir.z) - atan2(sd.x, -sd.z);
  let sy = asin(clamp(y, -1.0, 1.0)) - asin(sd.y);
  let sp = vec2<f32>(sx, sy);
  let R = 0.19;
  let r = length(sp);
  let disc = 1.0 - smoothstep(R - 0.003, R, r);
  var band = 1.0;
  if (sy < 0.09) {
    let k = clamp((0.09 - sy) / (R + 0.09), 0.0, 1.0);
    let stripe = fract(sy * 30.0 + aura.u_uClock * 0.3);
    band = step(0.08 + k * 0.55, stripe);
  }
  let top = vec3<f32>(1.0, 0.56, 0.10);
  let midS = vec3<f32>(1.0, 0.25, 0.30);
  let bottom = vec3<f32>(0.95, 0.04, 0.45);
  let sv = smoothstep(-R, R, sy);
  var sun = mix(bottom, midS, smoothstep(0.0, 0.5, sv));
  sun = mix(sun, top, smoothstep(0.45, 1.0, sv)) * (0.95 + 0.2 * aura.u_uPulse);
  let corona = exp(-max(r - R, 0.0) * 9.0) * 0.42 + exp(-max(r - R, 0.0) * 2.6) * 0.16;
  c = c + vec3<f32>(1.0, 0.22, 0.55) * corona * smoothstep(-0.05, 0.02, y + 0.03);
  c = mix(c, sun, disc * band);
  c = c + vec3<f32>(1.0, 0.35, 0.6) * exp(-abs(y) * 120.0) * 0.35;
  return vec4<f32>(c, 1.0);
}`);

const LIT_VARYING = /* wgsl */ `
struct LitVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vLocal: vec3<f32>,
  @location(3) vUv: vec2<f32>,
  @location(4) vTone: vec3<f32>,
};`;

/** `LIT_VERTEX` (toneless false) or `TONELESS_LIT_VERTEX` (vTone = 1, no `tone` input). */
export function litVertexWgsl(toneless: boolean): string {
  return wgslStage([WGSL_CLIP, LIT_VARYING], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>${toneless ? "" : ", @location(3) tone: vec3<f32>"}) -> LitVarying {
  var out: LitVarying;
  out.vUv = a_uv;
  out.vTone = ${toneless ? "vec3<f32>(1.0)" : "tone"};
  out.vLocal = a_position;
  var p = a_position;
  p.z = p.z + aura.u_uScrollZ;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(p, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(p, 1.0));
  return out;
}`);
}

export const LIT_VERTEX_WGSL = litVertexWgsl(false);
export const TONELESS_LIT_VERTEX_WGSL = litVertexWgsl(true);

const LIT_INPUTS = "@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(2) vLocal: vec3<f32>, @location(3) vUv: vec2<f32>, @location(4) vTone: vec3<f32>";

export const LIT_FRAGMENT_WGSL = wgslStage([WGSL_POW, HASH, HAZE], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}) -> @location(0) vec4<f32> {
  var N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  if (dot(N, V) < 0.0) { N = -N; }
  var base = aura.u_baseColor * mix(vec3<f32>(1.0), vTone, aura.u_uToneBase);
  if (aura.u_uTiles > 0.5) {
    let tz = floor((vWorld.z - aura.u_uTileShift) * 0.5);
    base = base * mix(aura.u_uTileA, aura.u_uTileB, step(1.0, tz - 2.0 * floor(tz / 2.0)));
  }
  let L = normalize(vec3<f32>(-0.45, 0.8, 0.4));
  let d = dot(N, L) * 0.5 + 0.5;
  let fw = fwidth(d) * 0.5;
  let key = mix(0.45, 1.0, smoothstep(0.62 - fw, 0.62 + fw, d));
  let hemi = mix(vec3<f32>(0.16, 0.05, 0.22), vec3<f32>(0.32, 0.30, 0.55), 0.5 * N.y + 0.5);
  var lit = base * (hemi + vec3<f32>(0.55, 0.62, 0.95) * key * 0.55);
  let rim = a3dPow(1.0 - max(dot(N, V), 0.0), 3.0) * max(0.25, -N.z * 0.5 + 0.5);
  lit = lit + aura.u_uRim * rim * (0.6 + 0.4 * aura.u_uPulse);
  var glow = aura.u_emissive;
  let side = 1.0 - step(0.5, abs(N.y));
  if (aura.u_uWindows > 0.5) {
    let hz = select(vLocal.x, vLocal.z, abs(N.x) > 0.5);
    let g = vec2<f32>(hz * 0.85, vLocal.y * 0.62);
    let id = floor(g);
    let f = fract(g);
    let pane = step(0.2, f.x) * step(f.x, 0.75) * step(0.24, f.y) * step(f.y, 0.72);
    let h = hash12(id + floor(vTone.xy * 113.0) + vec2<f32>(N.x * 17.0, N.z * 29.0));
    let on = step(0.6, h) * (0.85 + 0.15 * sin(aura.u_uClock * 3.0 + h * 40.0));
    let warm = vec3<f32>(1.0, 0.62, 0.28);
    let winC = mix(warm, vTone * 1.4, step(0.82, h));
    glow = glow + winC * pane * on * side * 0.75;
    lit = lit * (1.0 - pane * side * 0.35);
  }
  if (aura.u_uTrim > 0.5) {
    let t = smoothstep(0.972, 0.99, vUv.y) * step(abs(N.y), 0.92);
    glow = glow + vTone * t * (1.1 + 0.6 * aura.u_uPulse);
  }
  if (aura.u_uTopGrid > 0.5) {
    let top = smoothstep(0.6, 0.9, N.y);
    let g = vLocal.xz * 0.9;
    let gw = fwidth(g);
    let gl = abs(fract(g - vec2<f32>(0.5)) - vec2<f32>(0.5)) / max(gw, vec2<f32>(1e-4));
    let line = 1.0 - min(min(gl.x, gl.y), 1.0);
    glow = glow + vTone * line * top * (0.6 + 0.5 * aura.u_uPulse);
    let under = smoothstep(-0.2, -0.9, N.y);
    glow = glow + vTone * 0.10 * under;
  }
  if (aura.u_uMeter > 0.5) {
    let seg = fract(vWorld.y * 1.45);
    let on = smoothstep(0.16, 0.22, seg) * (1.0 - smoothstep(0.9, 0.96, seg));
    let low = vec3<f32>(0.0, 0.55, 1.0);
    let midC = vec3<f32>(1.0, 0.04, 0.45);
    let hiC = vec3<f32>(1.0, 0.62, 0.08);
    let yy = vWorld.y;
    var col = mix(low, midC, smoothstep(-2.0, 5.0, yy));
    col = mix(col, hiC, smoothstep(7.0, 11.0, yy));
    let faceLit = side * on;
    glow = glow + col * faceLit * (0.30 + 0.55 * aura.u_uPulse) * smoothstep(-7.0, -3.0, yy);
    glow = glow + col * step(0.5, N.y) * (0.7 + 0.5 * aura.u_uPulse);
    lit = lit * (1.0 - faceLit * 0.6);
  }
  let c = lit + glow;
  return vec4<f32>(haze(c, vWorld), aura.u_alpha);
}`);

export const FLOOR_FRAGMENT_WGSL = wgslStage([WGSL_POW, HAZE], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let g = vec2<f32>(vWorld.x, vWorld.z - aura.u_uScroll) / 5.0;
  let fw = fwidth(g);
  let gl = abs(fract(g - vec2<f32>(0.5)) - vec2<f32>(0.5)) / max(fw * 1.2, vec2<f32>(1e-4));
  var line = 1.0 - min(min(gl.x, gl.y), 1.0);
  line = line * clamp(1.4 - max(fw.x, fw.y) * 2.2, 0.0, 1.0);
  let g2 = vec2<f32>(vWorld.x, vWorld.z - aura.u_uScroll) / 25.0;
  let fw2 = fwidth(g2);
  let gl2 = abs(fract(g2 - vec2<f32>(0.5)) - vec2<f32>(0.5)) / max(fw2 * 1.6, vec2<f32>(1e-4));
  let major = 1.0 - min(min(gl2.x, gl2.y), 1.0);
  let base = vec3<f32>(0.010, 0.003, 0.026);
  let nearTrack = exp(-abs(vWorld.x) * 0.06);
  let lineC = mix(vec3<f32>(0.85, 0.06, 0.55), vec3<f32>(0.08, 0.6, 1.0), nearTrack * 0.6);
  var c = base + lineC * line * (0.38 + 0.4 * aura.u_uPulse) + lineC * major * 0.5;
  let refl = exp(-a3dPow(vWorld.x / 26.0, 2.0)) * smoothstep(-30.0, -220.0, vWorld.z);
  c = c + vec3<f32>(1.0, 0.25, 0.45) * refl * 0.22;
  return vec4<f32>(haze(c, vWorld), 1.0);
}`);

export const RIDGE_FRAGMENT_WGSL = wgslStage([WGSL_POW, HAZE], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}) -> @location(0) vec4<f32> {
  let v = vUv.y;
  let body = mix(vec3<f32>(0.012, 0.004, 0.035), vec3<f32>(0.06, 0.012, 0.11), v);
  let ridge = smoothstep(0.93, 1.0, v);
  let g = vec2<f32>(vUv.x * 160.0, v * 7.0);
  let fw = fwidth(g);
  let gl = abs(fract(g - vec2<f32>(0.5)) - vec2<f32>(0.5)) / max(fw, vec2<f32>(1e-4));
  let wire = (1.0 - min(min(gl.x, gl.y), 1.0)) * 0.25 * v;
  let c = body + vTone * (ridge * 1.1 + wire);
  return vec4<f32>(haze(c, vWorld), 1.0);
}`);

const GLOW_VARYING = /* wgsl */ `
struct GlowVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vTone: vec3<f32>,
  @location(1) vUv: vec2<f32>,
  @location(2) vWorld: vec3<f32>,
  @location(3) vNormal: vec3<f32>,
};`;

export const GLOW_VERTEX_WGSL = wgslStage([WGSL_CLIP, GLOW_VARYING], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) tone: vec3<f32>) -> GlowVarying {
  var out: GlowVarying;
  out.vTone = tone;
  out.vUv = a_uv;
  var p = a_position;
  p.y = p.y + sin(aura.u_uClock * 0.9 + tone.g * 37.0 + a_position.x * 0.3) * aura.u_uWobble;
  p.x = p.x + cos(aura.u_uClock * 0.7 + tone.b * 23.0) * aura.u_uWobble * 0.6;
  p.z = p.z + aura.u_uScrollZ;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(p, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(p, 1.0));
  return out;
}`);

export const GLOW_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vTone: vec3<f32>, @location(1) vUv: vec2<f32>, @location(2) vWorld: vec3<f32>, @location(3) vNormal: vec3<f32>) -> @location(0) vec4<f32> {
  let V = normalize(aura.u_cameraPosition - vWorld);
  let beam = aura.u_uBeam > 0.5;
  let edge = select(1.0, a3dPow(abs(dot(normalize(vNormal), V)), 1.5), beam);
  let along = select(1.0, (1.0 - vUv.y) * (1.0 - vUv.y), beam);
  let dist = length(vWorld - aura.u_cameraPosition);
  let fade = select(smoothstep(140.0, 30.0, dist), 1.0, beam);
  let c = aura.u_baseColor * vTone * edge * along * fade * (0.8 + 0.4 * aura.u_uPulse);
  return vec4<f32>(c, 1.0);
}`);

export const HERO_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}) -> @location(0) vec4<f32> {
  var N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  if (dot(N, V) < 0.0) { N = -N; }
  let L = normalize(vec3<f32>(-0.45, 0.8, 0.4));
  let d = dot(N, L) * 0.5 + 0.5;
  let fw = fwidth(d) * 0.5;
  let key = mix(0.55, 1.0, smoothstep(0.6 - fw, 0.6 + fw, d));
  let fres = a3dPow(1.0 - max(dot(N, V), 0.0), 2.5);
  var c = aura.u_baseColor * key * 0.7 + aura.u_emissive + vec3<f32>(0.85, 0.95, 1.0) * fres * 0.55;
  c = c + vec3<f32>(1.0, 0.25, 0.6) * a3dPow(max(-N.z, 0.0), 3.0) * fres * 0.5;
  return vec4<f32>(c, aura.u_alpha);
}`);
