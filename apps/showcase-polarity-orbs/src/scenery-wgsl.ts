/**
 * A3/W6: WGSL twins of Polarity Orbs' game-local `material.custom` programs (scenery.ts), line for line, so a WebGPU
 * frame computes the same values. WebGL2 keeps drawing the untouched GLSL. Mapping notes: runner-kit/shaders-wgsl.ts.
 * The flat scenery normal comes from `cross(dpdx, dpdy)` and is then turned to face the camera, as in the GLSL, so the
 * opposite window-y direction of WebGPU's derivatives cannot flip it.
 */
import { WGSL_CLIP, WGSL_POW, hexToLinear, wgslStage } from "../../../examples/shared/runner-kit/index";
import { LOOK } from "./look";

/** `hexVec`: linear-RGB constant for an sRGB hex, the same digits as the GLSL. */
const hexVec = (hex: string): string => {
  const [r, g, b] = hexToLinear(hex);
  return `vec3<f32>(${r.toFixed(5)}, ${g.toFixed(5)}, ${b.toFixed(5)})`;
};

/** `gradient(stops, name)`. */
const gradient = (stops: readonly { t: number; hex: string }[], name: string): string => {
  const s = [...stops].sort((a, b) => a.t - b.t);
  const out = [`var ${name} = ${hexVec(s[0]!.hex)};`];
  for (let i = 1; i < s.length; i++) out.push(`${name} = mix(${name}, ${hexVec(s[i]!.hex)}, smoothstep(${s[i - 1]!.t.toFixed(4)}, ${s[i]!.t.toFixed(4)}, t));`);
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
  c = c + ${hexVec("#ff8a4a")} * (a3dPow(sd, 6.0) * 0.55 + a3dPow(sd, 40.0) * 0.6) * (1.0 - 0.45 * aura.u_uMix);
  c = c + ${hexVec("#6ab8ff")} * (a3dPow(md, 8.0) * 0.4 + a3dPow(md, 60.0) * 0.5) * (0.55 + 0.45 * aura.u_uMix);
  let h = exp(-abs(d.y - 0.01) * 22.0);
  c = c + mix(${hexVec("#ffb48a")}, ${hexVec("#bfe0ff")}, side(d)) * h * 0.22;
  return c;
}
`;

/** `FOG_FN` (needs SKY_FN). */
const FOG_FN = /* wgsl */ `
fn fogAt(world: vec3<f32>) -> vec4<f32> {
  let toP = world - aura.u_cameraPosition;
  let dist = length(toP);
  let dir = toP / max(dist, 1e-3);
  var f = 1.0 - exp(-a3dPow(dist * aura.u_uFogDensity, 1.35));
  f = max(f, smoothstep(aura.u_uFogEnd * 0.78, aura.u_uFogEnd, dist));
  let low = smoothstep(-4.0, -18.0, world.y) * smoothstep(20.0, 90.0, dist);
  f = clamp(f + low * 0.35, 0.0, 1.0);
  let fogDir = normalize(vec3<f32>(dir.x, max(dir.y, -0.04) * 0.6, dir.z));
  return vec4<f32>(skyColor(fogDir), f);
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
  let p = d * 210.0;
  let cell = floor(p);
  let h = hash3(cell);
  let star = step(0.9965, h) * smoothstep(0.42, 0.0, length(fract(p) - vec3<f32>(0.5))) * smoothstep(0.12, 0.5, d.y);
  c = c + vec3<f32>(star) * (0.6 + 0.6 * hash3(cell + vec3<f32>(7.0)));
  let a = atan2(d.x, -d.z);
  let wave = 0.24 + 0.05 * sin(a * 4.0 + aura.u_uDrift * 0.15) + 0.03 * sin(a * 11.0 - aura.u_uDrift * 0.1);
  let band = smoothstep(wave - 0.12, wave, d.y) * smoothstep(wave + 0.22, wave + 0.02, d.y);
  let rays = 0.55 + 0.45 * noise1(a * 38.0 + aura.u_uDrift * 0.2);
  let auroraCol = mix(${hexVec("#ff4a8a")}, ${hexVec("#3ae0ff")}, smoothstep(-0.5, 0.5, d.x));
  c = c + auroraCol * band * rays * 0.22;
  let sd = dot(d, ${SUN_DIR});
  let md = dot(d, ${MOON_DIR});
  c = c + ${hexVec("#ffd890")} * smoothstep(0.9993, 0.9996, sd) * 2.4 + ${hexVec("#ff9a50")} * a3dPow(max(sd, 0.0), 900.0) * 0.8;
  let moon = smoothstep(0.99965, 0.9998, md) * (1.0 - 0.85 * smoothstep(0.99972, 0.99986, dot(d, normalize(${MOON_DIR} + vec3<f32>(0.006, 0.004, 0.0)))));
  c = c + ${hexVec("#d8ecff")} * moon * 1.8 + ${hexVec("#6ab8ff")} * a3dPow(max(md, 0.0), 1200.0) * 0.6;
  let bank = 0.035 + 0.03 * noise1(a * 9.0) + 0.018 * noise1(a * 27.0);
  let below = smoothstep(bank + 0.006, bank - 0.006, d.y) * smoothstep(-0.2, 0.0, d.y);
  let bankCol = mix(${hexVec("#c8708a")}, ${hexVec("#7aa0d8")}, side(d)) * (0.75 + 0.5 * smoothstep(bank - 0.04, bank, d.y));
  c = mix(c, bankCol, below * 0.85);
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
  let L = normalize(vec3<f32>(-0.35, 0.82, 0.45));
  let d = dot(N, L);
  let key = mix(0.18, 1.0, smoothstep(-0.05, 0.25, d));
  let hemi = mix(${hexVec("#3a2450")}, ${hexVec("#c8b8e8")}, 0.5 * N.y + 0.5) * 0.42;
  let keyCol = mix(${hexVec("#ffd2a8")}, ${hexVec("#d8e4ff")}, aura.u_uMix) * 0.78;
  let lit = hemi + keyCol * key;
  let fres = a3dPow(1.0 - max(dot(N, V), 0.0), 3.0);
  let rimCol = mix(${hexVec("#ff6a5a")}, ${hexVec("#5ab0ff")}, smoothstep(-14.0, 14.0, vWorld.x));
  var col = vTone * lit + rimCol * fres * 0.45 * (1.0 - vGlow);
  col = mix(col, vTone * (1.6 + 0.9 * fres), vGlow);
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
  let fade = 1.0 - smoothstep(60.0, 190.0, dist);
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
  let dir = toP / dist;
  let deep = mix(${hexVec("#2a1236")}, ${hexVec("#0e1a3a")}, side(dir));
  let top = mix(${hexVec("#f0a08a")}, ${hexVec("#a8c8f0")}, side(dir));
  let ridge = smoothstep(0.55, 0.95, n2v);
  var c = mix(deep, top * (0.72 + 0.4 * ridge), cloud);
  let sunGlint = a3dPow(max(dot(normalize(vec3<f32>(dir.x, 0.0, dir.z)), normalize(vec3<f32>(-0.42, 0.0, -1.0))), 0.0), 12.0);
  let moonGlint = a3dPow(max(dot(normalize(vec3<f32>(dir.x, 0.0, dir.z)), normalize(vec3<f32>(0.52, 0.0, -1.0))), 0.0), 14.0);
  c = c + (${hexVec("#ff9a5a")} * sunGlint * (1.0 - 0.4 * aura.u_uMix) + ${hexVec("#7ac0ff")} * moonGlint * (0.6 + 0.4 * aura.u_uMix)) * cloud * 0.45;
  let f = 1.0 - exp(-a3dPow(dist / 330.0, 1.6));
  let fogDir = normalize(vec3<f32>(dir.x, 0.0, dir.z));
  return vec4<f32>(mix(c, skyColor(fogDir), clamp(f, 0.0, 1.0)), 1.0);
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
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(2) vTone: vec3<f32>, @location(3) vLocal: vec3<f32>, @location(4) vFog: vec4<f32>, @location(5) vRefl: vec3<f32>) -> @location(0) vec4<f32> {
  var N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  if (dot(N, V) < 0.0) { N = -N; }
  let up = step(0.5, N.y);
  var base = vTone * mix(0.75, 1.0, up);
  let zc = vLocal.z * 0.25 + 0.25;
  let seamZ = abs(fract(zc) - 0.5) * 2.0;
  let fwz = fwidth(zc) * 2.0 + 1e-4;
  let acrossLine = smoothstep(0.965 - fwz, 0.965 + fwz, seamZ);
  let xl = abs(abs(vWorld.x) - 1.15);
  let fwx = fwidth(vWorld.x) + 1e-4;
  let laneLine = 1.0 - smoothstep(0.02, 0.02 + fwx * 1.5, xl);
  let seam = max(acrossLine, laneLine * 0.7) * up;
  base = base * (1.0 - 0.28 * seam);
  let lit = 0.82 + 0.18 * max(dot(N, normalize(vec3<f32>(-0.35, 0.82, 0.45))), 0.0);
  var col = base * lit * 1.1;
  let fres = a3dPow(1.0 - max(dot(N, V), 0.0), 4.0);
  col = col + vRefl * (0.06 + 0.5 * fres) * up;
  return vec4<f32>(mix(col, vFog.rgb, vFog.a), 1.0);
}`);
