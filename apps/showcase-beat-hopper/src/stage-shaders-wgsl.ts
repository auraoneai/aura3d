/**
 * WGSL twins of Beat Hopper's stage & rhythm-track programs (`stage-shaders.ts`), line-for-line paired with GLSL 3.00 es
 * so WebGPU (`backend: "auto"`) and WebGL2 render identical synesthetic concert frames.
 * Mapping notes: `tone` attribute sits at `@location(3)`. All derivative (`fwidth`) and `textureSample` calls stay in
 * uniform control flow.
 */
import { WGSL_CLIP, WGSL_POW, wgslStage } from "../../../examples/shared/runner-kit/index";

/** `HAZE` (needs WGSL_POW): crisp sightline inside 118 m, subtle deep midnight-indigo falloff across 118..360 m (capped at 0.52). */
const HAZE = /* wgsl */ `
fn haze(c: vec3<f32>, w: vec3<f32>) -> vec3<f32> {
  let d = w - aura.u_cameraPosition;
  let dist = length(d);
  let span = max(dist - 118.0, 0.0);
  let f = 1.0 - exp(-a3dPow(span * aura.u_uFogDensity, 1.45));
  let up = clamp(normalize(d).y * 2.2, 0.0, 1.0);
  let fogC = mix(aura.u_uFogColor, aura.u_uFogColor * 0.28, up);
  return mix(c, fogC, clamp(f, 0.0, 0.52));
}
`;

const HASH = /* wgsl */ `
fn hash12(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
  return fract((p3.x + p3.y) * p3.z);
}
`;

const SRGB_TO_LIN = /* wgsl */ `
fn srgbToLin(c: vec3<f32>) -> vec3<f32> {
  let lo = c / 12.92;
  let hi = pow(max((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(0.0)), vec3<f32>(2.4));
  return select(lo, hi, c > vec3<f32>(0.04045));
}
`;

/** HDR-preserving 16x16x16 strip LUT grade (`createGradingLut("cyber-neon")`). */
const CYBER_LUT_WGSL = /* wgsl */ `
fn gradeCyber(c: vec3<f32>, amount: f32) -> vec3<f32> {
  let peak = max(1.0, max(c.r, max(c.g, c.b)));
  let normLin = clamp(c / peak, vec3<f32>(0.0), vec3<f32>(1.0));
  let s = pow(normLin, vec3<f32>(1.0 / 2.2));
  let bSlice = s.b * 15.0;
  let b0 = floor(bSlice);
  let b1 = min(15.0, b0 + 1.0);
  let bf = bSlice - b0;
  let rx = s.r * 15.0 + 0.5;
  let gy = (s.g * 15.0 + 0.5) / 16.0;
  let uv0 = vec2<f32>((b0 * 16.0 + rx) / 256.0, gy);
  let uv1 = vec2<f32>((b1 * 16.0 + rx) / 256.0, gy);
  let g0 = textureSample(u_gradeLutTexture, u_gradeLutSampler, uv0).rgb;
  let g1 = textureSample(u_gradeLutTexture, u_gradeLutSampler, uv1).rgb;
  let graded = pow(max(mix(g0, g1, bf), vec3<f32>(0.0)), vec3<f32>(2.2)) * peak;
  return mix(c, graded, amount);
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

export const SKY_FRAGMENT_WGSL = wgslStage([HASH, CYBER_LUT_WGSL], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let dir = normalize(vWorld - aura.u_cameraPosition);
  let y = dir.y;
  let az = atan2(dir.x, -dir.z);
  let zenith = vec3<f32>(0.0018, 0.0016, 0.0110);
  let high = vec3<f32>(0.0065, 0.0045, 0.0360);
  let mid = vec3<f32>(0.0220, 0.0110, 0.0880);
  let low = vec3<f32>(0.0680, 0.0190, 0.1450);
  let hor = vec3<f32>(0.1800, 0.0480, 0.2100);
  var c = zenith;
  c = mix(high, c, smoothstep(0.18, 0.75, y));
  c = mix(mid, c, smoothstep(0.06, 0.30, y));
  c = mix(low, c, smoothstep(0.012, 0.10, y));
  c = mix(hor, c, smoothstep(-0.004, 0.030, y));
  if (y < -0.004) { c = mix(hor, vec3<f32>(0.014, 0.006, 0.032), smoothstep(-0.004, -0.10, y)); }
  var neb = sin(az * 2.3 + sin(az * 5.1 + 1.3) * 0.8 + y * 6.0) * 0.5 + 0.5;
  neb = neb * smoothstep(0.08, 0.3, y) * (1.0 - smoothstep(0.45, 0.85, y));
  neb = neb * (0.55 + 0.45 * sin(az * 9.0 - y * 14.0 + 0.7));
  c = c + vec3<f32>(0.034, 0.012, 0.115) * neb + vec3<f32>(0.0, 0.062, 0.095) * neb * neb;
  let g = vec2<f32>(az * 70.0, y * 70.0);
  let id = floor(g);
  let h = hash12(id);
  if (h > 0.93 && y > 0.04) {
    let f = fract(g) - vec2<f32>(0.5) - (vec2<f32>(hash12(id + vec2<f32>(7.1)), hash12(id + vec2<f32>(3.7))) - vec2<f32>(0.5)) * 0.6;
    let s = smoothstep(0.16, 0.0, length(f));
    let tw = 0.6 + 0.4 * sin(aura.u_uClock * (1.5 + h * 4.0) + h * 60.0);
    c = c + vec3<f32>(0.82, 0.90, 1.15) * s * tw * smoothstep(0.04, 0.2, y) * (h - 0.93) * 15.0;
  }
  let sd = aura.u_uSunDir;
  let sx = atan2(dir.x, -dir.z) - atan2(sd.x, -sd.z);
  let sy = asin(clamp(y, -1.0, 1.0)) - asin(sd.y);
  let sp = vec2<f32>(sx, sy);
  let R = 0.165;
  let r = length(sp);
  let disc = 1.0 - smoothstep(R - 0.003, R, r);
  var band = 1.0;
  if (sy < 0.075) {
    let k = clamp((0.075 - sy) / (R + 0.075), 0.0, 1.0);
    let stripe = fract(sy * 32.0 + aura.u_uClock * 0.3);
    band = step(0.08 + k * 0.55, stripe);
  }
  let top = vec3<f32>(1.42, 0.92, 0.22);
  let midS = vec3<f32>(1.36, 0.44, 0.18);
  let bottom = vec3<f32>(1.24, 0.12, 0.46);
  let sv = smoothstep(-R, R, sy);
  var sun = mix(bottom, midS, smoothstep(0.0, 0.5, sv));
  sun = mix(sun, top, smoothstep(0.45, 1.0, sv)) * (1.0 + 0.16 * aura.u_uPulse);
  let corona = exp(-max(r - R, 0.0) * 16.0) * 0.34 + exp(-max(r - R, 0.0) * 5.2) * 0.08;
  c = c + vec3<f32>(0.95, 0.38, 0.28) * corona * smoothstep(-0.04, 0.03, y + 0.02);
  c = mix(c, sun, disc * band);
  c = c + vec3<f32>(0.24, 0.62, 0.88) * exp(-abs(y) * 165.0) * 0.26;
  c = gradeCyber(c, 0.22);
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
  let hemi = mix(vec3<f32>(0.08, 0.09, 0.18), vec3<f32>(0.32, 0.38, 0.62), 0.5 * N.y + 0.5);
  var lit = base * (hemi + vec3<f32>(0.58, 0.68, 0.98) * key * 0.58);
  let rim = a3dPow(1.0 - max(dot(N, V), 0.0), 3.0) * max(0.25, -N.z * 0.5 + 0.5);
  lit = lit + aura.u_uRim * rim * (0.62 + 0.38 * aura.u_uPulse);
  var glow = aura.u_emissive + vTone * aura.u_uToneEmissive * (0.94 + 0.44 * aura.u_uPulse);
  let side = 1.0 - step(0.5, abs(N.y));
  if (aura.u_uWindows > 0.5) {
    let hz = select(vLocal.x, vLocal.z, abs(N.x) > 0.5);
    let g = vec2<f32>(hz * 0.85, vLocal.y * 0.62);
    let id = floor(g);
    let f = fract(g);
    let pane = step(0.2, f.x) * step(f.x, 0.75) * step(0.24, f.y) * step(f.y, 0.72);
    let h = hash12(id + floor(vTone.xy * 113.0) + vec2<f32>(N.x * 17.0, N.z * 29.0));
    let on = step(0.56, h) * (0.85 + 0.15 * sin(aura.u_uClock * 3.0 + h * 40.0));
    let warmGold = vec3<f32>(1.22, 0.82, 0.30);
    let coolCyan = vec3<f32>(0.06, 0.92, 1.18);
    let winBase = mix(warmGold, coolCyan, step(0.72, h));
    let winC = mix(winBase, vTone * 1.35, step(0.88, h));
    glow = glow + winC * pane * on * side * 0.85;
    lit = lit * (1.0 - pane * side * 0.35);
  }
  if (aura.u_uTrim > 0.5) {
    let t = smoothstep(0.970, 0.99, vUv.y) * step(abs(N.y), 0.92);
    glow = glow + vTone * t * (1.25 + 0.7 * aura.u_uPulse);
  }
  if (aura.u_uTopGrid > 0.5) {
    let top = smoothstep(0.6, 0.9, N.y);
    let g = vLocal.xz * 0.9;
    let gw = fwidth(g);
    let gl = abs(fract(g - vec2<f32>(0.5)) - vec2<f32>(0.5)) / max(gw, vec2<f32>(1e-4));
    let line = 1.0 - min(min(gl.x, gl.y), 1.0);
    glow = glow + vTone * line * top * (0.68 + 0.55 * aura.u_uPulse);
    let under = smoothstep(-0.2, -0.9, N.y);
    glow = glow + vTone * 0.12 * under;
  }
  if (aura.u_uMeter > 0.5) {
    let seg = fract(vWorld.y * 1.45);
    let on = smoothstep(0.15, 0.22, seg) * (1.0 - smoothstep(0.89, 0.96, seg));
    let low = vec3<f32>(0.02, 0.68, 1.15);
    let midC = vec3<f32>(1.15, 0.05, 0.52);
    let hiC = vec3<f32>(1.25, 0.72, 0.10);
    let yy = vWorld.y;
    var col = mix(low, midC, smoothstep(-2.0, 5.0, yy));
    col = mix(col, hiC, smoothstep(7.0, 11.0, yy));
    let faceLit = side * on;
    glow = glow + col * faceLit * (0.36 + 0.62 * aura.u_uPulse) * smoothstep(-7.0, -3.0, yy);
    glow = glow + col * step(0.5, N.y) * (0.8 + 0.6 * aura.u_uPulse);
    lit = lit * (1.0 - faceLit * 0.6);
  }
  let c = lit + glow;
  return vec4<f32>(haze(c, vWorld), aura.u_alpha);
}`);

/** Wet dark-glass Acrylic runway with embedded 132 BPM lane spectrum bars & z=0 beat-judgement threshold bar. */
export const DECK_FRAGMENT_WGSL = wgslStage([WGSL_POW, HAZE, CYBER_LUT_WGSL], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}) -> @location(0) vec4<f32> {
  let _l = vLocal;
  let _u = vUv;
  let _t = vTone;
  var N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  if (dot(N, V) < 0.0) { N = -N; }
  let scrollZ = vWorld.z - aura.u_uTileShift;
  let tz = floor(scrollZ * 0.5);
  let parity = step(1.0, tz - 2.0 * floor(tz / 2.0));
  let tileBase = mix(aura.u_uTileA, aura.u_uTileB, parity);
  let topMask = smoothstep(0.5, 0.9, N.y);

  /* bevel seam between 2 m Acrylic glass tiles */
  let seamG = scrollZ * 0.5;
  let seamFw = max(fwidth(seamG), 1e-4);
  let seamDist = abs(fract(seamG) - 0.5) / seamFw;
  let seam = (1.0 - clamp(seamDist * 0.65, 0.0, 1.0)) * topMask;

  /* embedded 3-lane 132 BPM multi-hue equalizer bars beneath the dark obsidian glass */
  let laneCoord = vWorld.x / 2.0;
  let laneIdx = clamp(round(laneCoord), -1.0, 1.0);
  let laneLocalX = abs(vWorld.x - laneIdx * 2.0);
  let inLaneWell = smoothstep(0.84, 0.72, laneLocalX) * step(abs(vWorld.x), 3.05) * topMask;
  let eqSeg = fract(scrollZ * 1.25);
  let eqCell = smoothstep(0.14, 0.22, eqSeg) * (1.0 - smoothstep(0.82, 0.90, eqSeg));
  let eqWave = 0.5 + 0.5 * sin(scrollZ * 0.22 + aura.u_uBeatPhase * 3.14159265 + laneIdx * 1.65);
  let eqAmp = clamp(0.28 + 0.52 * eqWave + 0.38 * aura.u_uPulse, 0.0, 1.25);
  let eqWidth = smoothstep(0.72 * eqAmp, 0.56 * eqAmp, laneLocalX);
  let edgeT = clamp(laneLocalX / 0.75, 0.0, 1.0);
  let eqLeft = mix(vec3<f32>(0.02, 0.88, 1.18), vec3<f32>(0.38, 0.22, 1.08), edgeT);
  let eqMid = mix(vec3<f32>(0.04, 0.92, 1.22), vec3<f32>(1.22, 0.74, 0.14), edgeT);
  let eqRight = mix(vec3<f32>(1.18, 0.68, 0.14), vec3<f32>(1.12, 0.10, 0.44), edgeT);
  var eqColor = mix(eqMid, eqLeft, clamp(-laneIdx, 0.0, 1.0));
  eqColor = mix(eqColor, eqRight, clamp(laneIdx, 0.0, 1.0));
  let subGlassEq = eqColor * inLaneWell * eqCell * eqWidth * (0.22 + 0.34 * aura.u_uPulse);

  /* z = 0 quarter-note beat-judgement threshold bar + sub-beat guide ticks */
  let hitLine = exp(-a3dPow(vWorld.z / 0.20, 2.0)) * topMask;
  let hitHalo = exp(-a3dPow(vWorld.z / 0.85, 2.0)) * topMask;
  let hitCol = mix(vec3<f32>(0.06, 0.92, 1.26), vec3<f32>(1.36, 0.84, 0.20), 0.35 + 0.65 * aura.u_uPulse);
  let railReflect = exp(-abs(abs(vWorld.x) - 3.15) * 3.4) * topMask;
  let railCol = mix(vec3<f32>(0.04, 0.78, 1.05), vec3<f32>(1.05, 0.65, 0.14), step(0.0, vWorld.x));

  /* glossy obsidian Acrylic Fresnel + cool twilight horizon sheen */
  let fres = a3dPow(1.0 - max(dot(N, V), 0.0), 4.0);
  let centerSheen = exp(-a3dPow(vWorld.x / 2.6, 2.0)) * smoothstep(6.0, -90.0, vWorld.z) * topMask;
  var c = tileBase * (0.76 + 0.24 * N.y);
  c = c + vec3<f32>(0.05, 0.32, 0.56) * seam * (0.34 + 0.40 * aura.u_uPulse);
  c = c + subGlassEq;
  c = c + railCol * railReflect * (0.18 + 0.22 * aura.u_uPulse);
  c = c + vec3<f32>(0.14, 0.34, 0.62) * centerSheen * 0.16;
  c = c + vec3<f32>(0.20, 0.54, 0.95) * fres * 0.30;
  c = c + hitCol * (hitLine * (0.85 + 0.75 * aura.u_uPulse) + hitHalo * (0.14 + 0.22 * aura.u_uPulse));
  c = c + aura.u_emissive;
  c = gradeCyber(c, 0.18);
  return vec4<f32>(haze(c, vWorld), 1.0);
}`);

/** Interior-mapped parallax laser-abyss chasm (`gaps` batch): renders a 4.2 m recessed neon laser pit inside each gap tile. */
export const GAP_FRAGMENT_WGSL = wgslStage([WGSL_POW, HAZE], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}) -> @location(0) vec4<f32> {
  let _n = vNormal;
  let _l = vLocal;
  let _t = vTone;
  let uv = clamp(vUv, vec2<f32>(0.001), vec2<f32>(0.999));
  let borderX = min(uv.x, 1.0 - uv.x);
  let borderZ = min(uv.y, 1.0 - uv.y);
  let border = min(borderX * 2.0, borderZ * 1.5);
  let rimFrame = 1.0 - smoothstep(0.055, 0.11, border);

  /* ray from camera through the gap opening into a 2.0 x 4.2 x 1.5 m interior box */
  let ray = normalize(vWorld - aura.u_cameraPosition);
  let halfSize = vec2<f32>(0.92, 0.68);
  let localXZ = (uv - vec2<f32>(0.5)) * 2.0 * halfSize;
  let dirXZ = vec2<f32>(ray.x, -ray.z);
  let safeDir = select(dirXZ, vec2<f32>(1e-4), abs(dirXZ) < vec2<f32>(1e-4));
  let tWall2 = (sign(safeDir) * halfSize - localXZ) / safeDir;
  let tWall = min(max(tWall2.x, 0.0), max(tWall2.y, 0.0));
  let depthY = 4.2;
  let tFloor = depthY / max(-ray.y, 0.08);
  let hitFloor = step(tFloor, tWall);
  let tHit = min(tFloor, tWall);
  let hitY = clamp(-ray.y * tHit, 0.0, depthY);
  let hitXZ = localXZ + dirXZ * tHit;

  /* horizontal laser containment ribs on the recessed walls */
  let laserCoord = hitY * 2.4 - aura.u_uClock * 1.6;
  let laserBand = exp(-a3dPow((fract(laserCoord) - 0.5) / 0.12, 2.0));
  let wallCol = mix(vec3<f32>(0.04, 0.88, 1.22), vec3<f32>(0.45, 0.20, 1.12), clamp(hitY / depthY, 0.0, 1.0));
  let depthAtten = exp(-hitY * 0.42);
  let wallGlow = (vec3<f32>(0.008, 0.010, 0.032) + wallCol * laserBand * (0.62 + 0.48 * aura.u_uPulse)) * depthAtten;

  /* recessed abyssal laser grid 4.2 m below the track */
  let fg = hitXZ * 3.0;
  let fgl = abs(fract(fg - vec2<f32>(0.5)) - vec2<f32>(0.5));
  let fline = 1.0 - smoothstep(0.03, 0.11, min(fgl.x, fgl.y));
  let floorGlow = vec3<f32>(0.004, 0.006, 0.018) + vec3<f32>(0.04, 0.72, 1.05) * fline * (0.45 + 0.4 * aura.u_uPulse);

  var interior = mix(wallGlow, floorGlow, hitFloor);
  /* shadow lip just inside the opening so depth reads unmistakably */
  let lipShadow = smoothstep(0.08, 0.24, border);
  interior = interior * (0.45 + 0.55 * lipShadow);
  let hazardRim = mix(vec3<f32>(0.04, 0.88, 1.20), vec3<f32>(1.28, 0.78, 0.18), 0.35 + 0.65 * aura.u_uPulse) * (0.78 + 0.45 * aura.u_uPulse);
  let c = mix(interior, hazardRim, rimFrame);
  return vec4<f32>(haze(c, vWorld), 1.0);
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
  let base = vec3<f32>(0.006, 0.005, 0.020);
  let nearTrack = exp(-abs(vWorld.x) * 0.055);
  let lineC = mix(vec3<f32>(0.28, 0.14, 0.78), vec3<f32>(0.02, 0.78, 1.12), nearTrack * 0.80);
  let majorC = vec3<f32>(0.04, 0.84, 1.16);
  var c = base + lineC * line * (0.36 + 0.36 * aura.u_uPulse) + majorC * major * 0.52;
  let refl = exp(-a3dPow(vWorld.x / 20.0, 2.0)) * smoothstep(-36.0, -240.0, vWorld.z);
  c = c + vec3<f32>(0.92, 0.56, 0.18) * refl * (0.14 + 0.08 * aura.u_uPulse);
  return vec4<f32>(haze(c, vWorld), 1.0);
}`);

export const RIDGE_FRAGMENT_WGSL = wgslStage([WGSL_POW, HAZE], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}) -> @location(0) vec4<f32> {
  let v = vUv.y;
  let body = mix(vec3<f32>(0.008, 0.006, 0.026), vec3<f32>(0.024, 0.018, 0.068), v);
  let ridge = smoothstep(0.93, 1.0, v);
  let g = vec2<f32>(vUv.x * 160.0, v * 7.0);
  let fw = fwidth(g);
  let gl = abs(fract(g - vec2<f32>(0.5)) - vec2<f32>(0.5)) / max(fw, vec2<f32>(1e-4));
  let wire = (1.0 - min(min(gl.x, gl.y), 1.0)) * 0.24 * v;
  let c = body + vTone * (ridge * 1.15 + wire);
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

/** Volumetric concert laser cones (`uBeam > 0.5`) with smooth Fresnel edge + haze shimmer, plus additive stage glow. */
export const GLOW_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vTone: vec3<f32>, @location(1) vUv: vec2<f32>, @location(2) vWorld: vec3<f32>, @location(3) vNormal: vec3<f32>) -> @location(0) vec4<f32> {
  let V = normalize(aura.u_cameraPosition - vWorld);
  let beam = aura.u_uBeam > 0.5;
  let ndv = abs(dot(normalize(vNormal), V));
  let dust = 0.84 + 0.16 * sin(vUv.y * 18.0 - aura.u_uClock * 2.2 + vWorld.x * 0.22);
  let beamEdge = a3dPow(ndv, 2.15) * smoothstep(0.0, 0.05, vUv.y);
  let beamAlong = a3dPow(max(1.0 - vUv.y, 0.0), 1.85) * dust;
  let edge = select(1.0, beamEdge, beam);
  let along = select(1.0, beamAlong, beam);
  let dist = length(vWorld - aura.u_cameraPosition);
  let fade = select(smoothstep(145.0, 28.0, dist), 1.0, beam);
  let c = aura.u_baseColor * vTone * edge * along * fade * (0.82 + 0.46 * aura.u_uPulse);
  return vec4<f32>(c, 1.0);
}`);

/** Feathered dual-crest harmonic shockwave ring (`rings` batch). */
export const RING_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vTone: vec3<f32>, @location(1) vUv: vec2<f32>, @location(2) vWorld: vec3<f32>, @location(3) vNormal: vec3<f32>) -> @location(0) vec4<f32> {
  let _w = vWorld;
  let _n = vNormal;
  let r = vUv.y;
  let outerWave = exp(-a3dPow((r - 0.72) / 0.14, 2.0));
  let innerWave = exp(-a3dPow((r - 0.30) / 0.12, 2.0)) * 0.68;
  let shimmer = 0.88 + 0.12 * cos(vUv.x * 37.69911 + aura.u_uClock * 9.0);
  let profile = (outerWave + innerWave) * smoothstep(0.0, 0.08, r) * (1.0 - smoothstep(0.90, 1.0, r));
  let c = aura.u_baseColor * vTone * profile * shimmer;
  return vec4<f32>(c, 1.0);
}`);

/** 8x4 sprite-sheet flipbook VFX (`createFlipbookAtlas("ripple" | "sparks")`): per-instance frame & RGB tint via `vTone`. */
export const FLIPBOOK_FRAGMENT_WGSL = wgslStage([SRGB_TO_LIN], /* wgsl */ `
@fragment fn fs_main(@location(0) vTone: vec3<f32>, @location(1) vUv: vec2<f32>, @location(2) vWorld: vec3<f32>, @location(3) vNormal: vec3<f32>) -> @location(0) vec4<f32> {
  let _w = vWorld;
  let _n = vNormal;
  let peak = max(vTone.r, max(vTone.g, vTone.b));
  let ageNorm = clamp(1.0 - peak, 0.0, 0.999);
  let fi = clamp(floor(ageNorm * 31.0), 0.0, 31.0);
  let col = fi - 8.0 * floor(fi / 8.0);
  let row = floor(fi / 8.0);
  let cellUv = (vec2<f32>(col, row) + clamp(vUv, vec2<f32>(0.02), vec2<f32>(0.98))) / vec2<f32>(8.0, 4.0);
  let tex = textureSample(u_sheetTexture, u_sheetSampler, cellUv);
  let tint = vTone / max(peak, 1e-4);
  let env = smoothstep(0.0, 0.07, peak);
  let rgb = srgbToLin(tex.rgb) * tint * tex.a * env * aura.u_uGain;
  return vec4<f32>(rgb, 1.0);
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
  var c = aura.u_baseColor * key * 0.72 + aura.u_emissive + vec3<f32>(0.88, 0.96, 1.05) * fres * 0.58;
  c = c + vec3<f32>(1.05, 0.26, 0.62) * a3dPow(max(-N.z, 0.0), 3.0) * fres * 0.52;
  return vec4<f32>(c, aura.u_alpha);
}`);
