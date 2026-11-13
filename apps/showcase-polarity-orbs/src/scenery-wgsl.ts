/**
 * WGSL twins of Polarity Orbs' game-local `material.custom` programs (`scenery.ts`), paired 1:1 with GLSL 300 es so
 * `backend: "auto"` renders identically on WebGPU and WebGL2.
 */
import { hexToLinear } from "../../../examples/shared/runner-kit/look-utils";
import { WGSL_CLIP, WGSL_POW, wgslStage } from "../../../examples/shared/runner-kit/shaders-wgsl";
import { LOOK } from "./look";

/** `hexVec`: linear-RGB constant for an sRGB hex, matching the GLSL constants. */
const hexVec = (hex: string): string => {
  const [r, g, b] = hexToLinear(hex);
  return `vec3<f32>(${r.toFixed(5)}, ${g.toFixed(5)}, ${b.toFixed(5)})`;
};

/** `gradient(stops, name)`. */
const gradient = (stops: readonly { t: number; hex: string }[], name: string): string => {
  const s = [...stops].sort((a, b) => a.t - b.t);
  const out = [`var ${name} = ${hexVec(s[0]!.hex)};`];
  for (let i = 1; i < s.length; i++) {
    out.push(`${name} = mix(${name}, ${hexVec(s[i]!.hex)}, smoothstep(${s[i - 1]!.t.toFixed(4)}, ${s[i]!.t.toFixed(4)}, t));`);
  }
  return out.join("\n  ");
};

const SUN_DIR = "normalize(vec3<f32>(-0.42, 0.075, -1.0))";
const MOON_DIR = "normalize(vec3<f32>(0.52, 0.17, -1.0))";

/** `SKY_FN` (needs WGSL_POW). */
const SKY_FN = /* wgsl */ `
fn side(d: vec3<f32>) -> f32 { return clamp(0.5 + d.x * 1.1 + (aura.u_uMix - 0.5) * 0.9, 0.0, 1.0); }
fn skyColor(d: vec3<f32>) -> vec3<f32> {
  let t = clamp(0.5 - d.y * 0.5, 0.0, 1.0);
  ${gradient(LOOK.skyWarm, "warm")}
  ${gradient(LOOK.skyCool, "cool")}
  var c = mix(warm, cool, side(d));
  let S = ${SUN_DIR};
  let M = ${MOON_DIR};
  let sd = max(dot(d, S), 0.0);
  let md = max(dot(d, M), 0.0);
  c = c + ${hexVec("#ff7854")} * (a3dPow(sd, 6.0) * 0.52 + a3dPow(sd, 42.0) * 0.62) * (1.0 - 0.45 * aura.u_uMix);
  c = c + ${hexVec("#4ec4ff")} * (a3dPow(md, 8.0) * 0.42 + a3dPow(md, 64.0) * 0.54) * (0.55 + 0.45 * aura.u_uMix);
  let h = exp(-abs(d.y - 0.01) * 24.0);
  c = c + mix(${hexVec("#ff9882")}, ${hexVec("#9ee6ff")}, side(d)) * h * 0.2;
  return c;
}
`;

/** `FOG_FN` (needs SKY_FN): crisp deep-indigo distant horizon fog (`near = 155, far = max(uFogEnd, 360)`) with zero milky haze. */
const FOG_FN = /* wgsl */ `
fn fogAt(world: vec3<f32>) -> vec4<f32> {
  let toP = world - aura.u_cameraPosition;
  let dist = length(toP);
  let dir = toP / max(dist, 1e-3);
  let fogFar = max(aura.u_uFogEnd, 360.0);
  let span = max(dist - 155.0, 0.0);
  var f = 1.0 - exp(-a3dPow(span * aura.u_uFogDensity, 1.35));
  f = max(f, smoothstep(155.0, fogFar, dist));
  let low = smoothstep(-10.0, -28.0, world.y) * smoothstep(155.0, 290.0, dist);
  f = clamp(f + low * 0.16, 0.0, 1.0);
  let fogDir = normalize(vec3<f32>(dir.x, max(dir.y, 0.22), dir.z));
  let fogTint = mix(skyColor(fogDir) * 0.34, ${hexVec("#080c20")}, 0.78);
  return vec4<f32>(fogTint, f);
}
`;

/** `WRAP_FN`. */
const WRAP_FN = /* wgsl */ `
fn wrapped(p: vec3<f32>, anchor: f32) -> vec3<f32> {
  let x = anchor + aura.u_uScroll - aura.u_uFront;
  let w = x - aura.u_uTile * floor(x / aura.u_uTile) + aura.u_uFront;
  return p + vec3<f32>(0.0, 0.0, w - anchor);
}
`;

const WORLD_VARYING = /* wgsl */ `
struct WorldVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
};`;

/** `SKY_VERTEX` and `CLOUD_VERTEX`. */
export const WORLD_VERTEX_WGSL = wgslStage([WGSL_CLIP, WORLD_VARYING], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> WorldVarying {
  var out: WorldVarying;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SKY_FRAGMENT_WGSL = wgslStage([WGSL_POW, SKY_FN], /* wgsl */ `
fn hash3(p0: vec3<f32>) -> f32 { var p = fract(p0 * 0.3183099 + vec3<f32>(0.1)); p = p * 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
fn hash1(n: f32) -> f32 { return fract(sin(n) * 43758.5453); }
fn noise1(x: f32) -> f32 { let i = floor(x); var f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash1(i), hash1(i + 1.0), f); }
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let d = normalize(vWorld - aura.u_cameraPosition);
  var c = skyColor(d);
  let p = d * 220.0;
  let cell = floor(p);
  let h = hash3(cell);
  let star = step(0.9962, h) * smoothstep(0.42, 0.0, length(fract(p) - vec3<f32>(0.5))) * smoothstep(0.08, 0.48, d.y);
  c = c + vec3<f32>(star) * (0.65 + 0.65 * hash3(cell + vec3<f32>(7.0)));
  let a = atan2(d.x, -d.z);
  let wave = 0.25 + 0.055 * sin(a * 4.0 + aura.u_uDrift * 0.16) + 0.032 * sin(a * 11.0 - aura.u_uDrift * 0.11);
  let band = smoothstep(wave - 0.13, wave, d.y) * smoothstep(wave + 0.24, wave + 0.02, d.y);
  let rays = 0.55 + 0.45 * noise1(a * 38.0 + aura.u_uDrift * 0.22);
  let auroraCol = mix(${hexVec("#ff4d7e")}, ${hexVec("#38d8ff")}, smoothstep(-0.48, 0.48, d.x));
  c = c + auroraCol * band * rays * 0.3;
  let sd = dot(d, ${SUN_DIR});
  let md = dot(d, ${MOON_DIR});
  c = c + ${hexVec("#ffd890")} * smoothstep(0.9993, 0.9996, sd) * 2.4 + ${hexVec("#ff8858")} * a3dPow(max(sd, 0.0), 900.0) * 0.8;
  let moon = smoothstep(0.99965, 0.9998, md) * (1.0 - 0.85 * smoothstep(0.99972, 0.99986, dot(d, normalize(${MOON_DIR} + vec3<f32>(0.006, 0.004, 0.0)))));
  c = c + ${hexVec("#ddf0ff")} * moon * 1.9 + ${hexVec("#54bfff")} * a3dPow(max(md, 0.0), 1200.0) * 0.65;
  let bank = 0.032 + 0.028 * noise1(a * 9.0) + 0.016 * noise1(a * 27.0);
  let below = smoothstep(bank + 0.006, bank - 0.006, d.y) * smoothstep(-0.2, 0.0, d.y);
  let bankCol = mix(${hexVec("#6d2446")}, ${hexVec("#1b3f74")}, side(d)) * (0.66 + 0.42 * smoothstep(bank - 0.04, bank, d.y));
  c = mix(c, bankCol, below * 0.78);
  return vec4<f32>(c, 1.0);
}`);

const SCENERY_VARYING = /* wgsl */ `
struct SceneryVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
  @location(1) vTone: vec3<f32>,
  @location(2) vGlow: f32,
  @location(3) vFog: vec4<f32>,
};`;

export const SCENERY_VERTEX_WGSL = wgslStage([WGSL_CLIP, WGSL_POW, SKY_FN, FOG_FN, WRAP_FN, SCENERY_VARYING], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) tone: vec3<f32>) -> SceneryVarying {
  var out: SceneryVarying;
  out.vTone = tone;
  out.vGlow = a_uv.x;
  let p = wrapped(a_position, a_uv.y);
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(p, 1.0)).xyz;
  out.vFog = fogAt(out.vWorld);
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(p, 1.0));
  return out;
}`);

export const SCENERY_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>, @location(1) vTone: vec3<f32>, @location(2) vGlow: f32, @location(3) vFog: vec4<f32>) -> @location(0) vec4<f32> {
  var N = normalize(cross(dpdx(vWorld), dpdy(vWorld)));
  let V = normalize(aura.u_cameraPosition - vWorld);
  if (dot(N, V) < 0.0) { N = -N; }
  let L = normalize(vec3<f32>(-0.42, 0.72, 0.55));
  let H = normalize(L + V);
  let d = dot(N, L);
  let key = mix(0.32, 1.0, smoothstep(-0.14, 0.3, d));
  let hemi = mix(${hexVec("#352854")}, ${hexVec("#d2defc")}, 0.5 * N.y + 0.5) * 0.56;
  let keyCol = mix(${hexVec("#ffd2b4")}, ${hexVec("#d6ecff")}, aura.u_uMix) * 0.88;
  let lit = hemi + keyCol * key;
  let fres = a3dPow(1.0 - max(dot(N, V), 0.0), 2.8);
  let spec = a3dPow(max(dot(N, H), 0.0), 42.0) * 0.34 * (1.0 - vGlow);
  let rimCol = mix(${hexVec("#ff6474")}, ${hexVec("#4ec8ff")}, smoothstep(-14.0, 14.0, vWorld.x));
  var col = vTone * lit + rimCol * fres * 0.56 * (1.0 - vGlow) + vec3<f32>(spec);
  col = mix(col, vTone * (1.75 + 0.95 * fres), vGlow);
  return vec4<f32>(mix(col, vFog.rgb, vFog.a), 1.0);
}`);

const GLOW_VARYING = /* wgsl */ `
struct GlowVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
  @location(1) vTone: vec3<f32>,
  @location(2) vGlow: f32,
};`;

export const GLOW_VERTEX_WGSL = wgslStage([WGSL_CLIP, WRAP_FN, GLOW_VARYING], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) tone: vec3<f32>) -> GlowVarying {
  var out: GlowVarying;
  out.vTone = tone;
  out.vGlow = a_uv.x;
  let p = wrapped(a_position, a_uv.y);
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(p, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(p, 1.0));
  return out;
}`);

export const GLOW_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>, @location(1) vTone: vec3<f32>, @location(2) vGlow: f32) -> @location(0) vec4<f32> {
  let dist = length(vWorld - aura.u_cameraPosition);
  let fade = 1.0 - smoothstep(60.0, 195.0, dist);
  return vec4<f32>(vTone * vGlow * fade * aura.u_uGlow, 1.0);
}`);

export const CLOUD_FRAGMENT_WGSL = wgslStage([WGSL_POW, SKY_FN], /* wgsl */ `
fn h2(p0: vec2<f32>) -> f32 { var p = fract(p0 * vec2<f32>(123.34, 456.21)); p = p + dot(p, p + vec2<f32>(45.32)); return fract(p.x * p.y); }
fn n2(p: vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2<f32>(1.0, 0.0)), f.x), mix(h2(i + vec2<f32>(0.0, 1.0)), h2(i + vec2<f32>(1.0, 1.0)), f.x), f.y);
}
fn fbm(p0: vec2<f32>) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var p = p0;
  for (var i = 0; i < 4; i = i + 1) { s = s + a * n2(p); p = p * 2.03 + vec2<f32>(17.1, 3.7); a = a * 0.5; }
  return s;
}
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let q = vec2<f32>(vWorld.x, vWorld.z - aura.u_uScroll) * 0.022;
  let n = fbm(q + vec2<f32>(aura.u_uDrift * 0.01, 0.0));
  let n2v = n2(q * 2.7 + vec2<f32>(5.0)) * 0.6 + n2(q * 5.9 + vec2<f32>(9.0)) * 0.4;
  let cloud = smoothstep(0.36, 0.72, n * 0.8 + n2v * 0.3);
  let toP = vWorld - aura.u_cameraPosition;
  let dist = length(toP);
  let dir = toP / max(dist, 1e-3);
  let deep = mix(${hexVec("#090a1c")}, ${hexVec("#060c20")}, side(dir));
  let top = mix(${hexVec("#642644")}, ${hexVec("#1e4d7e")}, side(dir));
  let ridge = smoothstep(0.55, 0.95, n2v);
  var c = mix(deep, top * (0.64 + 0.36 * ridge), cloud);
  let sunGlint = a3dPow(max(dot(normalize(vec3<f32>(dir.x, 0.0, dir.z)), normalize(vec3<f32>(-0.42, 0.0, -1.0))), 0.0), 12.0);
  let moonGlint = a3dPow(max(dot(normalize(vec3<f32>(dir.x, 0.0, dir.z)), normalize(vec3<f32>(0.52, 0.0, -1.0))), 0.0), 14.0);
  c = c + (${hexVec("#ff8858")} * sunGlint * (1.0 - 0.4 * aura.u_uMix) + ${hexVec("#5ec4ff")} * moonGlint * (0.6 + 0.4 * aura.u_uMix)) * cloud * 0.34;
  let f = smoothstep(155.0, 380.0, dist);
  let fogDir = normalize(vec3<f32>(dir.x, 0.18, dir.z));
  let fogTint = mix(skyColor(fogDir) * 0.36, ${hexVec("#080c20")}, 0.76);
  return vec4<f32>(mix(c, fogTint, f), 1.0);
}`);

const DECK_VARYING = /* wgsl */ `
struct DeckVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vTone: vec3<f32>,
  @location(3) vLocal: vec3<f32>,
  @location(4) vFog: vec4<f32>,
  @location(5) vRefl: vec3<f32>,
};`;

export const DECK_VERTEX_WGSL = wgslStage([WGSL_CLIP, WGSL_POW, SKY_FN, FOG_FN, DECK_VARYING], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(3) tone: vec3<f32>) -> DeckVarying {
  var out: DeckVarying;
  out.vTone = tone;
  out.vLocal = a_position;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.vFog = fogAt(out.vWorld);
  let V = normalize(aura.u_cameraPosition - out.vWorld);
  let R = reflect(-V, vec3<f32>(0.0, 1.0, 0.0));
  out.vRefl = skyColor(normalize(vec3<f32>(R.x, max(R.y, 0.02), R.z)));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const DECK_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vTone: vec3<f32>,
  @location(3) vLocal: vec3<f32>,
  @location(4) vFog: vec4<f32>,
  @location(5) vRefl: vec3<f32>
) -> @location(0) vec4<f32> {
  var N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  if (dot(N, V) < 0.0) { N = -N; }
  let up = step(0.5, N.y);
  let slateFloor = ${hexVec("#0d1020")};
  var base = mix(slateFloor, vTone, 0.72) * mix(0.68, 1.0, up);
  let zc = vLocal.z * 0.25 + 0.25;
  let seamZ = abs(fract(zc) - 0.5) * 2.0;
  let fwz = fwidth(zc) * 2.0 + 1e-4;
  let acrossLine = smoothstep(0.965 - fwz, 0.965 + fwz, seamZ);
  let xl = abs(abs(vWorld.x) - 1.15);
  let fwx = fwidth(vWorld.x) + 1e-4;
  let laneLine = 1.0 - smoothstep(0.022, 0.022 + fwx * 1.5, xl);
  let seam = max(acrossLine, laneLine * 0.85) * up;
  base = base * (1.0 - 0.34 * seam);

  /* Animated magnetic dipole isolines across the polished dark-glass / ferrofluid slate board */
  let dipolePhase = vWorld.x * 2.15 + sin(vLocal.z * 0.42 - aura.u_uDrift * 2.6) * 0.85;
  let field = dipolePhase + cos(vLocal.z * 0.28 + vWorld.x * 0.9 - aura.u_uDrift * 1.9) * 0.65;
  let isoCell = abs(fract(field * 1.35) - 0.5) * 2.0;
  let isoFw = fwidth(field * 1.35) * 1.8 + 1e-4;
  let isoLine = (1.0 - smoothstep(0.06, 0.06 + isoFw, isoCell)) * up;
  let isRight = step(0.0, vWorld.x);
  let dominance = mix(1.0 - aura.u_uMix, aura.u_uMix, isRight);
  let poleGlow = mix(${hexVec("#ff5468")}, ${hexVec("#38bdf8")}, isRight);
  let conduitGlow = poleGlow * (isoLine * (0.14 + 0.34 * dominance) + laneLine * up * (0.12 + 0.24 * dominance));

  let L = normalize(vec3<f32>(-0.35, 0.82, 0.45));
  let H = normalize(L + V);
  let lit = 0.78 + 0.24 * max(dot(N, L), 0.0);
  let spec = a3dPow(max(dot(N, H), 0.0), 84.0) * 0.55 * up;
  let fres = 0.04 + 0.96 * a3dPow(1.0 - max(dot(N, V), 0.0), 4.2);
  var col = base * lit + conduitGlow + vRefl * (0.09 + 0.58 * fres) * up + vec3<f32>(0.94, 0.97, 1.0) * spec;
  return vec4<f32>(mix(col, vFog.rgb, vFog.a), 1.0);
}`);

/* ------------------------------------------------------------------ Plasma-Core Dielectric Glass Orbs (WGSL) */

const ORB_VARYING = /* wgsl */ `
struct OrbVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vLocal: vec3<f32>,
  @location(3) vTone: vec3<f32>,
};`;

export const plasmaOrbVertexWgsl = (withTone: boolean): string =>
  wgslStage([WGSL_CLIP, ORB_VARYING], /* wgsl */ `
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>${withTone ? ",\n  @location(3) tone: vec3<f32>" : ""}
) -> OrbVarying {
  var out: OrbVarying;
  out.vLocal = a_position;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.vTone = ${withTone ? "tone" : "vec3<f32>(1.0, 1.0, 1.0)"};
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const PLASMA_ORB_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vLocal: vec3<f32>,
  @location(3) vTone: vec3<f32>
) -> @location(0) vec4<f32> {
  var N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  if (dot(N, V) < 0.0) { N = -N; }
  let ndotv = clamp(dot(N, V), 0.0, 1.0);

  /* Crisp split-hemisphere gyroscope axis: never mixes red+blue into muddy lavender */
  let axisDot = N.y * cos(aura.u_uFlipAngle) + N.x * sin(aura.u_uFlipAngle);
  let splitMask = smoothstep(-0.04, 0.04, axisDot);
  let northCol = vTone * aura.u_baseColor;
  let southCol = mix(northCol, aura.u_poleSouthColor, aura.u_uSplitPole);
  let poleCol = mix(southCol, northCol, splitMask);

  /* Swirling internal dipole plasma filaments inside glazed ceramic + clearcoat shell */
  let t = aura.u_time;
  let swirlA = sin(vLocal.x * 9.5 + vLocal.z * 7.5 + t * 3.8) * cos(vLocal.y * 8.5 - t * 2.9);
  let swirlB = sin((vLocal.x - vLocal.z) * 13.5 - t * 5.1);
  let plasma = clamp(0.5 + 0.34 * swirlA + 0.24 * swirlB, 0.0, 1.0);
  let coreDepth = a3dPow(ndotv, 1.35);
  let deepGlass = poleCol * 0.30;
  let hotCore = mix(poleCol * 1.32, vec3<f32>(1.0, 0.96, 0.90), plasma * coreDepth * 0.22);
  var col = mix(deepGlass, hotCore, 0.36 + 0.64 * coreDepth * (0.48 + 0.52 * plasma));

  /* Precision brushed-titanium equatorial groove highlight on split-pole hero orb */
  let eqBand = (1.0 - smoothstep(0.024, 0.068, abs(axisDot))) * aura.u_uSplitPole;
  col = mix(col, vec3<f32>(0.84, 0.90, 0.98), eqBand * 0.72);

  /* Dual studio softbox + key clearcoat specular & thin-film cyan/amber iridescence */
  let L1 = normalize(vec3<f32>(-0.35, 0.84, 0.44));
  let H1 = normalize(L1 + V);
  let L2 = normalize(vec3<f32>(0.52, 0.48, 0.68));
  let H2 = normalize(L2 + V);
  let specSharp = a3dPow(max(dot(N, H1), 0.0), 148.0) * 1.15;
  let specCoat = a3dPow(max(dot(N, H1), 0.0), 28.0) * 0.18;
  let specFill = a3dPow(max(dot(N, H2), 0.0), 68.0) * 0.28;
  let fres = 0.04 + 0.96 * a3dPow(1.0 - ndotv, 3.6);

  let isWarm = step(poleCol.b, poleCol.r);
  let iridTint = mix(${hexVec("#66f2ff")}, ${hexVec("#ffbe48")}, isWarm);
  col = col + mix(poleCol, iridTint, 0.52 * aura.u_uIridescence) * (fres * 0.56);
  col = col + vec3<f32>(1.0, 0.98, 0.95) * (specSharp + specCoat) + iridTint * specFill;

  /* Chroma-preserving max-channel shoulder so crimson & cyan never bleach to white */
  let peak = max(col.r, max(col.g, col.b));
  let k = 0.88;
  let over = max(peak - k, 0.0);
  let targetPeak = min(peak, k) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
  let rolled = col * (targetPeak / max(peak, 1e-4));
  return vec4<f32>(rolled, 1.0);
}`);

/* ------------------------------------------------------------------ Feathered Flux Rings & Curved Dipole Arcs (WGSL) */

const UV_WORLD_VARYING = /* wgsl */ `
struct UvWorldVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
};`;

export const UV_WORLD_VERTEX_WGSL = wgslStage([WGSL_CLIP, UV_WORLD_VARYING], /* wgsl */ `
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> UvWorldVarying {
  var out: UvWorldVarying;
  out.vUv = a_uv;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const FLUX_RING_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let r = clamp(vUv.y, 0.0, 1.0);
  let feather = smoothstep(0.0, 0.24, r) * (1.0 - smoothstep(0.68, 1.0, r));
  let waves = 0.52 + 0.48 * cos((r * aura.u_uRingCount - aura.u_time * 3.4) * 6.2831853);
  let ticks = smoothstep(0.76, 0.97, cos((vUv.x * 8.0 + aura.u_uSpin) * 6.2831853));
  let crest = smoothstep(0.42, 0.78, r) * (1.0 - smoothstep(0.78, 0.98, r));
  let fres = a3dPow(1.0 - abs(dot(N, V)), 1.8);
  let energy = clamp(feather * (0.45 + 0.55 * waves) + crest * 0.55 + feather * ticks * 0.35, 0.0, 1.4);
  let col = mix(aura.u_baseColor, aura.u_edgeColor, clamp(r * 0.75 + crest * 0.5, 0.0, 1.0)) * (1.25 + fres * 0.85);
  let alpha = clamp(aura.u_uAlpha * energy, 0.0, 0.96);
  return vec4<f32>(col, alpha);
}`);

export const FLUX_ARC_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let _n = vNormal;
  let _w = vWorld;
  let across = abs(vUv.y * 2.0 - 1.0);
  let ribbon = 1.0 - smoothstep(0.05, 0.98, across);
  let ends = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265);
  let pulse = 0.52 + 0.48 * sin(vUv.x * 22.0 - aura.u_time * 18.0);
  let hot = smoothstep(0.55, 0.98, pulse) * (1.0 - smoothstep(0.0, 0.55, across));
  let col = mix(aura.u_coreColor, aura.u_edgeColor, clamp(hot + 0.28 * pulse, 0.0, 1.0)) * (1.35 + hot * 0.9);
  let alpha = clamp(aura.u_uAlpha * ribbon * ends * (0.48 + 0.52 * pulse), 0.0, 0.96);
  return vec4<f32>(col, alpha);
}`);

/* ------------------------------------------------------------------ Plasma Flipbook Burst + Cyber-Neon LUT (WGSL) */

const BURST_VARYING = /* wgsl */ `
struct BurstVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
  @location(1) vTone: vec3<f32>,
};`;

export const PLASMA_BURST_VERTEX_WGSL = wgslStage([WGSL_CLIP, BURST_VARYING], /* wgsl */ `
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(2) a_uv: vec2<f32>,
  @location(3) tone: vec3<f32>
) -> BurstVarying {
  var out: BurstVarying;
  out.vUv = a_uv;
  out.vTone = tone;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const PLASMA_BURST_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vUv: vec2<f32>,
  @location(1) vTone: vec3<f32>
) -> @location(0) vec4<f32> {
  let texel = textureSample(u_plasmaMapTexture, u_plasmaMapSampler, vUv);
  let raw = clamp(texel.rgb * vTone * 1.2, vec3<f32>(0.0), vec3<f32>(1.0));
  let bSlice = floor(raw.b * 15.0);
  let lutUv = vec2<f32>((bSlice * 16.0 + raw.r * 15.0 + 0.5) / 256.0, (raw.g * 15.0 + 0.5) / 16.0);
  let graded = textureSample(u_lutMapTexture, u_lutMapSampler, lutUv).rgb;
  let col = mix(raw, graded, 0.65) * 1.65;
  return vec4<f32>(col * texel.a, texel.a);
}`);
