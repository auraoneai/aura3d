/**
 * A3/W6: WGSL twins of Number Surge's game-local `material.custom` programs (scenery.ts and the label program in
 * world.ts), line for line, so a WebGPU frame computes the same values. WebGL2 keeps drawing the untouched GLSL.
 * Mapping notes: runner-kit/shaders-wgsl.ts (`tone` is the batches' only custom attribute, so it sits at 3).
 */
import { WGSL_CLIP, WGSL_POW, wgslStage } from "../../../examples/shared/runner-kit/index";

/** `FOG_GLSL`. */
const FOG = /* wgsl */ `
fn nsFogMix(col: vec3<f32>, world: vec3<f32>, density: f32) -> vec3<f32> {
  let d = length(world - aura.u_cameraPosition);
  let rangeFade = clamp((d - 72.0) / 198.0, 0.0, 1.0);
  let f = rangeFade * (1.0 - exp(-max(d - 68.0, 0.0) * density));
  let low = clamp((8.0 - world.y) / 30.0, 0.0, 1.0);
  let fogCol = mix(aura.u_nsFog, aura.u_nsHorizon, clamp(f * 0.55 * (0.25 + 0.75 * low), 0.0, 1.0));
  return mix(col, fogCol, clamp(f * (0.68 + 0.22 * low), 0.0, 1.0));
}
`;

const H21 = /* wgsl */ `
fn h21(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453); }
`;

const LIT_VARYING = (tone: boolean): string => /* wgsl */ `
struct LitVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vLocal: vec3<f32>,
  @location(3) vUv: vec2<f32>,
${tone ? "  @location(4) vTone: vec3<f32>," : ""}
};`;

/** `LIT_VERTEX(tone)`. */
export function litVertexWgsl(tone: boolean): string {
  return wgslStage([WGSL_CLIP, LIT_VARYING(tone)], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>${tone ? ", @location(3) tone: vec3<f32>" : ""}) -> LitVarying {
  var out: LitVarying;
${tone ? "  out.vTone = tone;" : ""}
  out.vUv = a_uv;
  out.vLocal = a_position;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);
}

const LIT_INPUTS = "@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(2) vLocal: vec3<f32>, @location(3) vUv: vec2<f32>";

/** World-position vertex (`SKY_VERTEX`, `STRIP_VERTEX`). */
export const WORLD_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct WorldVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> WorldVarying {
  var out: WorldVarying;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SKY_FRAGMENT_WGSL = wgslStage([H21], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let dir = normalize(vWorld);
  let y = dir.y;
  let zenith = vec3<f32>(0.005, 0.003, 0.022);
  let upper = vec3<f32>(0.014, 0.006, 0.068);
  let mid = vec3<f32>(0.036, 0.010, 0.118);
  let low = vec3<f32>(0.095, 0.016, 0.165);
  let hot = vec3<f32>(0.24, 0.032, 0.22);
  var col = mix(low, hot, smoothstep(0.09, 0.0, y));
  col = mix(col, mid, smoothstep(0.04, 0.16, y));
  col = mix(col, upper, smoothstep(0.16, 0.38, y));
  col = mix(col, zenith, smoothstep(0.38, 0.85, y));
  if (y < 0.0) { col = mix(hot * 0.42, vec3<f32>(0.006, 0.003, 0.024), smoothstep(0.0, -0.14, y)); }
  let sp = vec2<f32>(atan2(dir.x, -dir.z) * 90.0, asin(clamp(y, -1.0, 1.0)) * 90.0);
  let cell = floor(sp);
  let star = step(0.985, h21(cell));
  let f = fract(sp) - vec2<f32>(0.5) - (vec2<f32>(h21(cell + vec2<f32>(3.1)), h21(cell + vec2<f32>(7.7))) - vec2<f32>(0.5)) * 0.6;
  let tw = 0.6 + 0.4 * sin(aura.u_time * (1.0 + 2.0 * h21(cell + vec2<f32>(1.3))) + h21(cell) * 40.0);
  col = col + star * tw * smoothstep(0.12, 0.0, length(f)) * smoothstep(0.10, 0.36, y) * vec3<f32>(0.9, 0.85, 1.0) * 1.4;
  let sunDir = normalize(vec3<f32>(0.0, 0.105, -1.0));
  let ang = acos(clamp(dot(dir, sunDir), -1.0, 1.0));
  let radius = 0.21;
  let sv = (y - sunDir.y) / radius;
  var bands = 1.0;
  if (sv < 0.25) {
    let k = (0.25 - sv) / 1.25;
    let period = 0.16;
    let g = fract((sv - 0.25) / period);
    bands = step(0.18 + 0.55 * k, g);
  }
  let disc = smoothstep(radius, radius - 0.004, ang) * bands;
  let sunCol = mix(vec3<f32>(0.92, 0.06, 0.46), vec3<f32>(1.0, 0.34, 0.08), smoothstep(-0.85, 0.8, sv));
  col = mix(col, sunCol, disc);
  col = col + vec3<f32>(0.65, 0.10, 0.45) * (0.14 * exp(-ang * 6.5) + 0.12 * exp(-ang * 18.0)) * (1.0 - disc);
  return vec4<f32>(col, 1.0);
}`);

export const GRID_FRAGMENT_WGSL = wgslStage([FOG], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}) -> @location(0) vec4<f32> {
  let p = vec2<f32>(vWorld.x, vWorld.z - aura.u_nsScroll);
  let g = p / 6.0;
  let w = fwidth(g) * 1.2;
  let a = abs(fract(g - vec2<f32>(0.5)) - vec2<f32>(0.5)) / max(w, vec2<f32>(1e-4));
  let line = 1.0 - min(min(a.x, a.y), 1.0);
  let d = length(vWorld - aura.u_cameraPosition);
  let near = 1.0 - smoothstep(40.0, 210.0, d);
  var col = aura.u_nsBase;
  let streak = exp(-abs(vWorld.x) / 26.0) * smoothstep(30.0, 230.0, d);
  col = col + vec3<f32>(1.0, 0.32, 0.5) * 0.28 * streak;
  col = col + aura.u_nsLine * line * (0.35 + 1.3 * near);
  col = nsFogMix(col, vWorld, aura.u_nsDensity);
  return vec4<f32>(col, 1.0);
}`);

export const MOUNTAIN_FRAGMENT_WGSL = wgslStage([FOG], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}) -> @location(0) vec4<f32> {
  let wy = fwidth(vUv.y);
  let ridge = smoothstep(1.0 - 3.0 * wy, 1.0 - 0.6 * wy, vUv.y);
  let contour = 1.0 - min(abs(fract(vWorld.y / 5.0) - 0.5) / max(fwidth(vWorld.y / 5.0) * 1.1, 1e-4), 1.0);
  var col = mix(aura.u_nsBase * 0.55, aura.u_nsBase * 1.25, vUv.y);
  col = col + aura.u_nsRidge * contour * 0.14 * vUv.y;
  col = nsFogMix(col, vWorld, aura.u_nsDensity);
  col = mix(col, aura.u_nsRidge * 1.6, ridge);
  return vec4<f32>(col, 1.0);
}`);

export const TOWER_FRAGMENT_WGSL = wgslStage([H21, FOG], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}, @location(4) vTone: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let side = 1.0 - step(0.6, abs(N.y));
  var col = aura.u_nsBase * (0.75 + 0.35 * max(N.y, 0.0));
  col = col + vec3<f32>(0.5, 0.12, 0.35) * 0.35 * max(-N.z, 0.0);
  col = col + vec3<f32>(0.05, 0.25, 0.4) * 0.12 * max(-N.y, 0.0);
  let along = select(vLocal.x, vLocal.z, abs(N.x) > 0.5);
  let gc = vec2<f32>(along / 0.95, vLocal.y / 1.25);
  let cell = floor(gc);
  let f = fract(gc);
  let win = step(0.25, f.x) * step(f.x, 0.75) * step(0.32, f.y) * step(f.y, 0.68);
  let seed = vTone.r * 13.0 + vTone.b * 7.0;
  let on = step(0.62, h21(cell + vec2<f32>(seed)));
  let lamp = mix(vTone, vec3<f32>(1.0, 0.78, 0.35), step(0.7, h21(cell * 1.7 + vec2<f32>(seed))));
  let blur = clamp(max(fwidth(gc.x), fwidth(gc.y)) * 1.5 - 0.3, 0.0, 1.0);
  let lit = mix(win * on, 0.25 * 0.38, blur) * side * aura.u_nsWindows;
  col = mix(col, lamp * 1.15, lit);
  let wy = fwidth(vUv.y);
  let wx = fwidth(vUv.x);
  let roof = smoothstep(1.0 - 3.0 * wy, 1.0 - 0.8 * wy, vUv.y) * side;
  let corner = max(smoothstep(2.2 * wx, 0.5 * wx, vUv.x), smoothstep(1.0 - 2.2 * wx, 1.0 - 0.5 * wx, vUv.x)) * side * aura.u_nsCorners;
  col = nsFogMix(col, vWorld, aura.u_nsDensity);
  col = mix(col, vTone * 2.0, max(roof, corner * 0.8) * (1.0 - 0.5 * clamp(length(vWorld - aura.u_cameraPosition) / 260.0, 0.0, 1.0)));
  return vec4<f32>(col, 1.0);
}`);

export const DECK_FRAGMENT_WGSL = wgslStage([WGSL_POW, FOG], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let L = normalize(aura.u_nsSunDir);
  let H = normalize(L + V);
  let g = vec2<f32>(vLocal.x / 1.85, vLocal.z / 2.0);
  let w = fwidth(g) * 1.1;
  let a = abs(fract(g - vec2<f32>(0.5)) - vec2<f32>(0.5)) / max(w, vec2<f32>(1e-4));
  let line = 1.0 - min(min(a.x, a.y), 1.0);
  let fres = a3dPow(1.0 - clamp(V.y, 0.0, 1.0), 3.6);
  let spec = a3dPow(max(dot(N, H), 0.0), 64.0) * 0.42;
  let laneRail = exp(-abs(abs(vWorld.x) - 1.55) * 5.5);
  var col = aura.u_nsBase * (0.78 + 0.34 * max(dot(N, L), 0.0));
  col = col + aura.u_nsLine * line * 0.22;
  col = col + aura.u_nsLine * laneRail * 0.14;
  col = col + vec3<f32>(0.95, 0.88, 1.0) * spec;
  col = col + vec3<f32>(0.42, 0.62, 1.0) * 0.36 * fres;
  col = nsFogMix(col, vWorld, aura.u_nsDensity);
  return vec4<f32>(col, 1.0);
}`);

export const STRIP_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let d = length(vWorld - aura.u_cameraPosition);
  let fade = exp(-d * aura.u_nsDensity);
  return vec4<f32>(mix(aura.u_nsHorizon * 0.6, aura.u_baseColor, fade), aura.u_alpha * mix(0.35, 1.0, fade));
}`);

export const ROCK_FRAGMENT_WGSL = wgslStage([WGSL_POW, FOG], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let top = smoothstep(0.75, 0.9, N.y);
  var rock = aura.u_nsRock * (0.55 + 0.45 * clamp(0.5 + 0.5 * dot(N, normalize(vec3<f32>(-0.4, 0.5, -0.8))), 0.0, 1.0));
  rock = rock + vec3<f32>(1.0, 0.3, 0.6) * 0.22 * a3dPow(max(-N.z, 0.0), 2.0);
  let depth = clamp(-vLocal.y / (1.5 * aura.u_nsR), 0.0, 1.0);
  rock = mix(rock, rock * 0.6 + vec3<f32>(0.35, 0.08, 0.3) * 0.5, depth);
  rock = rock + aura.u_nsGlow * (0.12 + 0.9 * smoothstep(0.55, 1.0, depth)) * max(-N.y, 0.15);
  let g = vLocal.xz / 0.9;
  let w = fwidth(g) * 1.2;
  let a = abs(fract(g - vec2<f32>(0.5)) - vec2<f32>(0.5)) / max(w, vec2<f32>(1e-4));
  let line = 1.0 - min(min(a.x, a.y), 1.0);
  let tile = aura.u_nsTop + aura.u_nsGlow * line * 0.55;
  var col = mix(rock, tile, top);
  col = col + aura.u_nsGlow * 1.4 * smoothstep(0.55, 0.75, N.y) * (1.0 - top);
  col = nsFogMix(col, vWorld, aura.u_nsDensity);
  return vec4<f32>(col, 1.0);
}`);

export const GLYPH_FRAGMENT_WGSL = wgslStage([FOG], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let face = clamp(dot(N, V), 0.0, 1.0);
  let pulse = 0.9 + 0.1 * sin(aura.u_time * 2.0 + aura.u_nsPhase);
  var col = aura.u_baseColor * (0.55 + 1.35 * face) * pulse;
  col = nsFogMix(col, vWorld, aura.u_nsDensity * 0.6);
  return vec4<f32>(col, 1.0);
}`);

/** The halo's and the label's uv-only vertex stage. */
export const UV_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct UvVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> UvVarying {
  var out: UvVarying;
  out.vUv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const HALO_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let d = length(vUv - vec2<f32>(0.5)) * 2.0;
  let a = exp(-d * d * 3.5) * (1.0 - smoothstep(0.85, 1.0, d));
  return vec4<f32>(aura.u_baseColor, a * aura.u_alpha);
}`);

export const EDGE_GLOW_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct EdgeGlowVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
  @location(1) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> EdgeGlowVarying {
  var out: EdgeGlowVarying;
  out.vUv = a_uv;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const EDGE_GLOW_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let d = abs(vUv.x - 0.5) * 2.0;
  let fade = exp(-length(vWorld - aura.u_cameraPosition) * 0.008);
  return vec4<f32>(aura.u_baseColor, aura.u_alpha * exp(-d * d * 5.0) * (1.0 - d) * fade);
}`);

/** The data motes' inline program: per-vertex tone, unlit. */
export const MOTE_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct MoteVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vTone: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(3) tone: vec3<f32>) -> MoteVarying {
  var out: MoteVarying;
  out.vTone = tone;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const MOTE_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vTone: vec3<f32>) -> @location(0) vec4<f32> { return vec4<f32>(vTone, 1.0); }`);

/** `LABEL_FRAGMENT` (world.ts): canvas text decoded from sRGB. */
export const LABEL_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
fn a3dPow3(x: vec3<f32>, y: vec3<f32>) -> vec3<f32> { return pow(max(abs(x), vec3<f32>(1e-30)), y); }
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let t = textureSample(u_mapTexture, u_mapSampler, vUv);
  let lin = mix(t.rgb / 12.92, a3dPow3((t.rgb + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4)), step(vec3<f32>(0.04045), t.rgb));
  return vec4<f32>(aura.u_baseColor * lin, aura.u_alpha * t.a);
}`);

/** Translucent refractive/holographic gate panel (`FROSTED_GATE_FRAGMENT`). */
export const FROSTED_GATE_FRAGMENT_WGSL = wgslStage([WGSL_POW, FOG], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}, @location(4) vTone: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let ndotv = clamp(abs(dot(N, V)), 0.0, 1.0);
  let fres = 0.0426 + 0.9574 * a3dPow(1.0 - ndotv, 3.8);
  let pUv = vUv + V.xy * 0.04;
  let gc = pUv * vec2<f32>(10.0, 12.0);
  let gw = fwidth(gc) * 1.15;
  let ga = abs(fract(gc - vec2<f32>(0.5)) - vec2<f32>(0.5)) / max(gw, vec2<f32>(1e-4));
  let grid = 1.0 - min(min(ga.x, ga.y), 1.0);
  let scan = 0.5 + 0.5 * sin(vWorld.y * 16.0 - aura.u_time * 3.4);
  let scanBand = smoothstep(0.45, 0.96, scan);
  let edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  let border = 1.0 - smoothstep(0.016, 0.058, edgeDist);
  let core = vTone * (0.30 + 0.20 * vUv.y) + vec3<f32>(0.008, 0.004, 0.028);
  let rimCol = mix(vTone, vec3<f32>(1.0), 0.22);
  var col = core + rimCol * (fres * 1.55 + border * 1.25 + scanBand * 0.14 + grid * 0.16);
  col = nsFogMix(col, vWorld, aura.u_nsDensity * 0.8);
  let alpha = clamp(0.54 + fres * 0.38 + border * 0.44 + grid * 0.08 + scanBand * 0.05, 0.48, 0.96);
  return vec4<f32>(col, alpha);
}`);

/** Glossy metallic gate stanchion (`STANCHION_FRAGMENT`). */
export const STANCHION_FRAGMENT_WGSL = wgslStage([WGSL_POW, FOG], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}, @location(4) vTone: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let L = normalize(aura.u_nsSunDir);
  let H = normalize(L + V);
  let ndotl = max(dot(N, L), 0.0);
  let spec = a3dPow(max(dot(N, H), 0.0), 48.0);
  let fres = a3dPow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0);
  let edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  let bevel = 1.0 - smoothstep(0.02, 0.09, edgeDist);
  let chrome = vec3<f32>(0.11, 0.09, 0.26) * (0.42 + 0.68 * ndotl);
  var col = chrome + vec3<f32>(0.78, 0.86, 1.0) * (spec * 0.72) + vTone * (bevel * 1.25 + fres * 0.65);
  col = nsFogMix(col, vWorld, aura.u_nsDensity);
  return vec4<f32>(col, 1.0);
}`);

/** Segmented crystal-masonry boss wall (`CRYSTAL_WALL_FRAGMENT`). */
export const CRYSTAL_WALL_FRAGMENT_WGSL = wgslStage([WGSL_POW, FOG], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}, @location(4) vTone: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let L = normalize(aura.u_nsSunDir);
  let H = normalize(L + V);
  let ndotl = max(dot(N, L), 0.0);
  let spec = a3dPow(max(dot(N, H), 0.0), 42.0);
  let fres = a3dPow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.2);
  let edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  let mortar = 1.0 - smoothstep(0.02, 0.085, edgeDist);
  let veinCoord = vLocal.x * 1.45 + sin(vLocal.y * 2.8) * 0.35;
  let vw = fwidth(veinCoord) * 1.4 + 1e-4;
  let vein = 1.0 - smoothstep(0.0, vw * 2.2, abs(fract(veinCoord) - 0.5));
  let smashable = smoothstep(0.96, 1.04, aura.u_nsBreakRatio);
  let warnPulse = 0.72 + 0.28 * sin(aura.u_time * 5.2);
  let goldPulse = 0.86 + 0.18 * sin(aura.u_time * 6.8 + vLocal.y * 2.0);
  let dangerGlow = vec3<f32>(1.35, 0.14, 0.32) * warnPulse;
  let smashGlow = vec3<f32>(1.45, 1.05, 0.26) * goldPulse;
  let fissureCol = mix(dangerGlow, smashGlow, smashable);
  let crystalBase = mix(vTone * 0.78, vec3<f32>(0.16, 0.36, 0.44), smashable * 0.45);
  let fissureMask = clamp(mortar * 0.85 + vein * (0.35 + 0.45 * smashable), 0.0, 1.0);
  var col = crystalBase * (0.38 + 0.72 * ndotl) + vec3<f32>(1.0, 0.95, 0.9) * (spec * 0.65) + fissureCol * (fissureMask * 0.92 + fres * 0.35);
  col = nsFogMix(col, vWorld, aura.u_nsDensity);
  return vec4<f32>(col, 1.0);
}`);

/** Hexagonal Fresnel energy barrier (`HEX_SHIELD_FRAGMENT`). */
export const HEX_SHIELD_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
@fragment fn fs_main(${LIT_INPUTS}) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let fres = a3dPow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.5);
  let hp = vec2<f32>(atan2(vLocal.x, vLocal.z) * 5.0, vLocal.y * 9.0);
  let hw = fwidth(hp) * 1.2 + vec2<f32>(1e-4);
  let ha = abs(fract(hp - vec2<f32>(0.5)) - vec2<f32>(0.5)) / hw;
  let hexLine = 1.0 - min(min(ha.x, ha.y), 1.0);
  let wave = 0.5 + 0.5 * sin(vLocal.y * 10.0 - aura.u_time * 4.5);
  let col = mix(aura.u_baseColor, vec3<f32>(0.85, 1.0, 0.96), fres * 0.55 + hexLine * 0.35) * (1.05 + fres * 1.25 + wave * 0.25);
  let alpha = clamp(0.14 + fres * 0.56 + hexLine * 0.22 + wave * 0.06, 0.10, 0.84);
  return vec4<f32>(col, alpha);
}`);

/** Procedural sparks sprite-sheet flipbook (`SPARKS_FLIPBOOK_FRAGMENT`). */
export const SPARKS_FLIPBOOK_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
fn a3dPow3s(x: vec3<f32>, y: vec3<f32>) -> vec3<f32> { return pow(max(abs(x), vec3<f32>(1e-30)), y); }
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let f = floor(max(aura.u_nsFrame, 0.0));
  let colIdx = f - aura.u_nsCols * floor(f / aura.u_nsCols);
  let rowIdx = floor(f / aura.u_nsCols);
  let cellUv = (vec2<f32>(colIdx, rowIdx) + clamp(vUv, vec2<f32>(0.02), vec2<f32>(0.98))) / vec2<f32>(aura.u_nsCols, aura.u_nsRows);
  let s = textureSample(u_mapTexture, u_mapSampler, cellUv);
  let lin = mix(s.rgb / 12.92, a3dPow3s((s.rgb + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4)), step(vec3<f32>(0.04045), s.rgb));
  return vec4<f32>(lin * aura.u_nsTint * (aura.u_alpha * s.a), aura.u_alpha * s.a);
}`);
