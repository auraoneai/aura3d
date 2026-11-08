/**
 * Polarity Orbs scenery (presentation only): a magnetosphere at dusk. The road floats over a sea of cloud between a
 * warm red pole (left) and a cool blue pole (right): floating basalt islands with moss tops, pines and charged crystal
 * clusters, giant horseshoe-magnet monuments, distant spires, magnet arches over the road, the road's own skirt and
 * pylons, drifting motes, and a dual-dusk sky with a sun (warm pole) and a moon (cool pole), aurora and stars.
 *
 * Everything is built once from a private presentation PRNG (never the gameplay RNG) into a few static meshes; each
 * layer is a tile repeated three times and its node is moved by `distance * parallax mod tile`, so nothing here reads
 * or writes the simulation.
 */
import { geometry } from "@aura3d/engine";
import { hexToLinear, type CustomSpec, type Rgb } from "../../../examples/shared/runner-kit/index";
import { LOOK } from "./look";

/* ------------------------------------------------------------------ GLSL */

const SRGB = /* glsl */ `
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}`;

/** Linear-RGB GLSL constant for an sRGB hex (converted here, so no per-pixel pow). */
const hexVec = (hex: string): string => {
  const [r, g, b] = hexToLinear(hex);
  return `vec3(${r.toFixed(5)}, ${g.toFixed(5)}, ${b.toFixed(5)})`;
};

const gradient = (stops: readonly { t: number; hex: string }[], name: string): string => {
  const s = [...stops].sort((a, b) => a.t - b.t);
  const out = [`vec3 ${name} = ${hexVec(s[0]!.hex)};`];
  for (let i = 1; i < s.length; i++) out.push(`${name} = mix(${name}, ${hexVec(s[i]!.hex)}, smoothstep(${s[i - 1]!.t.toFixed(4)}, ${s[i]!.t.toFixed(4)}, t));`);
  return out.join("\n  ");
};

/** Sun (warm pole, ahead-left) and moon (cool pole, ahead-right) directions shared by sky, rims and cloud glints. */
const SUN_DIR = "normalize(vec3(-0.42, 0.075, -1.0))";
const MOON_DIR = "normalize(vec3(0.52, 0.17, -1.0))";

/**
 * `skyColor(dir)` — the dual-dusk sky without stars/aurora/discs: used by the dome and as the fog colour of every
 * scenery surface so islands melt into the sky at the horizon. `uMix` 0 = warm dominant (red), 1 = cool (blue).
 */
const SKY_FN = /* glsl */ `
${SRGB}
float side(vec3 d) { return clamp(0.5 + d.x * 1.1 + (uMix - 0.5) * 0.9, 0.0, 1.0); }
vec3 skyColor(vec3 d) {
  float t = clamp(0.5 - d.y * 0.5, 0.0, 1.0);
  ${gradient(LOOK.skyWarm, "warm")}
  ${gradient(LOOK.skyCool, "cool")}
  vec3 c = mix(warm, cool, side(d));
  vec3 S = ${SUN_DIR};
  vec3 M = ${MOON_DIR};
  float sd = max(dot(d, S), 0.0);
  float md = max(dot(d, M), 0.0);
  c += ${hexVec("#ff8a4a")} * (pow(sd, 6.0) * 0.55 + pow(sd, 40.0) * 0.6) * (1.0 - 0.45 * uMix);
  c += ${hexVec("#6ab8ff")} * (pow(md, 8.0) * 0.4 + pow(md, 60.0) * 0.5) * (0.55 + 0.45 * uMix);
  float h = exp(-abs(d.y - 0.01) * 22.0);
  c += mix(${hexVec("#ffb48a")}, ${hexVec("#bfe0ff")}, side(d)) * h * 0.22;
  return c;
}`;

const SKY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SKY_FN}
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hash1(float n) { return fract(sin(n) * 43758.5453); }
float noise1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash1(i), hash1(i + 1.0), f); }
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  vec3 c = skyColor(d);
  /* stars, fading in towards the zenith */
  vec3 p = d * 210.0;
  vec3 cell = floor(p);
  float h = hash3(cell);
  float star = step(0.9965, h) * smoothstep(0.42, 0.0, length(fract(p) - 0.5)) * smoothstep(0.12, 0.5, d.y);
  c += vec3(star) * (0.6 + 0.6 * hash3(cell + 7.0));
  /* aurora curtains: red over the warm pole, cyan over the cool pole */
  float a = atan(d.x, -d.z);
  float wave = 0.24 + 0.05 * sin(a * 4.0 + uDrift * 0.15) + 0.03 * sin(a * 11.0 - uDrift * 0.1);
  float band = smoothstep(wave - 0.12, wave, d.y) * smoothstep(wave + 0.22, wave + 0.02, d.y);
  float rays = 0.55 + 0.45 * noise1(a * 38.0 + uDrift * 0.2);
  vec3 auroraCol = mix(${hexVec("#ff4a8a")}, ${hexVec("#3ae0ff")}, smoothstep(-0.5, 0.5, d.x));
  c += auroraCol * band * rays * 0.22;
  /* sun and moon discs */
  float sd = dot(d, ${SUN_DIR});
  float md = dot(d, ${MOON_DIR});
  c += ${hexVec("#ffd890")} * smoothstep(0.9993, 0.9996, sd) * 2.4 + ${hexVec("#ff9a50")} * pow(max(sd, 0.0), 900.0) * 0.8;
  float moon = smoothstep(0.99965, 0.9998, md) * (1.0 - 0.85 * smoothstep(0.99972, 0.99986, dot(d, normalize(${MOON_DIR} + vec3(0.006, 0.004, 0.0)))));
  c += ${hexVec("#d8ecff")} * moon * 1.8 + ${hexVec("#6ab8ff")} * pow(max(md, 0.0), 1200.0) * 0.6;
  /* distant cloud bank silhouette on the horizon */
  float bank = 0.035 + 0.03 * noise1(a * 9.0) + 0.018 * noise1(a * 27.0);
  float below = smoothstep(bank + 0.006, bank - 0.006, d.y) * smoothstep(-0.2, 0.0, d.y);
  vec3 bankCol = mix(${hexVec("#c8708a")}, ${hexVec("#7aa0d8")}, side(d)) * (0.75 + 0.5 * smoothstep(bank - 0.04, bank, d.y));
  c = mix(c, bankCol, below * 0.85);
  outColor = vec4(c, 1.0);
}`;

const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Per-vertex fog: rgb = the sky colour along the view ray (so islands melt into the horizon), a = fog factor. */
const FOG_FN = /* glsl */ `
vec4 fogAt(vec3 world) {
  vec3 toP = world - cameraPosition;
  float dist = length(toP);
  vec3 dir = toP / max(dist, 1e-3);
  float f = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
  f = max(f, smoothstep(uFogEnd * 0.78, uFogEnd, dist));
  float low = smoothstep(-4.0, -18.0, world.y) * smoothstep(20.0, 90.0, dist);
  f = clamp(f + low * 0.35, 0.0, 1.0);
  vec3 fogDir = normalize(vec3(dir.x, max(dir.y, -0.04) * 0.6, dir.z));
  return vec4(skyColor(fogDir), f);
}`;

/**
 * Object wrap: every scenery object stores its anchor z in uv.y; the vertex stage moves the whole object by the layer
 * scroll and wraps its anchor into [uFront, uFront + uTile), so one copy of each layer loops forever without the node
 * moving (and without CPU work per frame).
 */
const WRAP_FN = /* glsl */ `
vec3 wrapped(vec3 p, float anchor) {
  float w = mod(anchor + uScroll - uFront, uTile) + uFront;
  return p + vec3(0.0, 0.0, w - anchor);
}`;

/** Scenery vertex: per-vertex linear `tone`, glow in uv.x, object anchor in uv.y; flat normals come from derivatives. */
const SCENERY_VERTEX = /* glsl */ `
in vec3 tone;
out vec3 vWorld;
out vec3 vTone;
out float vGlow;
out vec4 vFog;
${SKY_FN}
${FOG_FN}
${WRAP_FN}
void main() {
  vTone = tone;
  vGlow = uv.x;
  vec3 p = wrapped(position, uv.y);
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  vFog = fogAt(vWorld);
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`;

const SCENERY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vTone;
in float vGlow;
in vec4 vFog;
out vec4 outColor;
void main() {
  vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(vec3(-0.35, 0.82, 0.45));
  float d = dot(N, L);
  float key = mix(0.18, 1.0, smoothstep(-0.05, 0.25, d));
  vec3 hemi = mix(${hexVec("#3a2450")}, ${hexVec("#c8b8e8")}, 0.5 * N.y + 0.5) * 0.42;
  vec3 keyCol = mix(${hexVec("#ffd2a8")}, ${hexVec("#d8e4ff")}, uMix) * 0.78;
  vec3 lit = hemi + keyCol * key;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 rimCol = mix(${hexVec("#ff6a5a")}, ${hexVec("#5ab0ff")}, smoothstep(-14.0, 14.0, vWorld.x));
  vec3 col = vTone * lit + rimCol * fres * 0.45 * (1.0 - vGlow);
  col = mix(col, vTone * (1.6 + 0.9 * fres), vGlow);
  outColor = vec4(mix(col, vFog.rgb, vFog.a), 1.0);
}`;

/** Additive glow (motes, crystal halos): tone times glow strength, fogged out with distance. */
const GLOW_VERTEX = /* glsl */ `
in vec3 tone;
out vec3 vWorld;
out vec3 vTone;
out float vGlow;
${WRAP_FN}
void main() {
  vTone = tone;
  vGlow = uv.x;
  vec3 p = wrapped(position, uv.y);
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`;

const GLOW_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vTone;
in float vGlow;
out vec4 outColor;
void main() {
  float dist = length(vWorld - cameraPosition);
  float fade = 1.0 - smoothstep(60.0, 190.0, dist);
  outColor = vec4(vTone * vGlow * fade * uGlow, 1.0);
}`;

/** Sea of cloud below the road: value-noise fbm scrolled by distance, lit from the sun/moon, fogged to the horizon. */
const CLOUD_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const CLOUD_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SKY_FN}
float h2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + vec2(17.1, 3.7); a *= 0.5; }
  return s;
}
void main() {
  vec2 q = vec2(vWorld.x, vWorld.z - uScroll) * 0.022;
  float n = fbm(q + vec2(uDrift * 0.01, 0.0));
  float n2v = n2(q * 2.7 + 5.0) * 0.6 + n2(q * 5.9 + 9.0) * 0.4;
  float cloud = smoothstep(0.36, 0.72, n * 0.8 + n2v * 0.3);
  vec3 toP = vWorld - cameraPosition;
  float dist = length(toP);
  vec3 dir = toP / dist;
  vec3 deep = mix(${hexVec("#2a1236")}, ${hexVec("#0e1a3a")}, side(dir));
  vec3 top = mix(${hexVec("#f0a08a")}, ${hexVec("#a8c8f0")}, side(dir));
  float ridge = smoothstep(0.55, 0.95, n2v);
  vec3 c = mix(deep, top * (0.72 + 0.4 * ridge), cloud);
  float sunGlint = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(-0.42, 0.0, -1.0))), 0.0), 12.0);
  float moonGlint = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(0.52, 0.0, -1.0))), 0.0), 14.0);
  c += (${hexVec("#ff9a5a")} * sunGlint * (1.0 - 0.4 * uMix) + ${hexVec("#7ac0ff")} * moonGlint * (0.6 + 0.4 * uMix)) * cloud * 0.45;
  float f = 1.0 - exp(-pow(dist / 330.0, 1.6));
  vec3 fogDir = normalize(vec3(dir.x, 0.0, dir.z));
  outColor = vec4(mix(c, skyColor(fogDir), clamp(f, 0.0, 1.0)), 1.0);
}`;

/**
 * Road deck: the toon-lit tone (warm/cool halves keep their colours and dominance blend) plus panel seams in object
 * space (so they scroll with the road), a polished fresnel reflection of the dual-dusk sky and distance fog.
 */
const DECK_VERTEX = /* glsl */ `
in vec3 tone;
out vec3 vNormal;
out vec3 vWorld;
out vec3 vTone;
out vec3 vLocal;
out vec4 vFog;
out vec3 vRefl;
${SKY_FN}
${FOG_FN}
void main() {
  vTone = tone;
  vLocal = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  vFog = fogAt(vWorld);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
  vRefl = skyColor(normalize(vec3(R.x, max(R.y, 0.02), R.z)));
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const DECK_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vTone;
in vec3 vLocal;
in vec4 vFog;
in vec3 vRefl;
out vec4 outColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float up = step(0.5, N.y);
  vec3 base = vTone * mix(0.75, 1.0, up);
  /* panel seams: across every 4 units, along at the lane edges */
  float zc = vLocal.z * 0.25 + 0.25;
  float seamZ = abs(fract(zc) - 0.5) * 2.0;
  float fwz = fwidth(zc) * 2.0 + 1e-4;
  float acrossLine = smoothstep(0.965 - fwz, 0.965 + fwz, seamZ);
  float xl = abs(abs(vWorld.x) - 1.15);
  float fwx = fwidth(vWorld.x) + 1e-4;
  float laneLine = 1.0 - smoothstep(0.02, 0.02 + fwx * 1.5, xl);
  float seam = max(acrossLine, laneLine * 0.7) * up;
  base *= 1.0 - 0.28 * seam;
  float lit = 0.82 + 0.18 * max(dot(N, normalize(vec3(-0.35, 0.82, 0.45))), 0.0);
  vec3 col = base * lit * 1.1;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  col += vRefl * (0.06 + 0.5 * fres) * up;
  outColor = vec4(mix(col, vFog.rgb, vFog.a), 1.0);
}`;

export const deckSpec = (): CustomSpec => ({
  glsl: { vertex: DECK_VERTEX, fragment: DECK_FRAGMENT },
  uniforms: { uMix: { type: "f32", value: 0 }, uFogDensity: { type: "f32", value: 1 / 300 }, uFogEnd: { type: "f32", value: 380 } },
  side: "double"
});

const SKY_UNIFORMS = { uMix: { type: "f32" as const, value: 0 } };

export const sceneSkySpec = (): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  uniforms: { ...SKY_UNIFORMS, uDrift: { type: "f32", value: 0 } },
  side: "double"
});

const wrapUniforms = (tile: number) => ({
  uScroll: { type: "f32" as const, value: 0 },
  uTile: { type: "f32" as const, value: tile },
  uFront: { type: "f32" as const, value: WRAP_BEHIND - tile }
});

export const sceneryLitSpec = (fogDensity: number, fogEnd: number, tile = 440): CustomSpec => ({
  glsl: { vertex: SCENERY_VERTEX, fragment: SCENERY_FRAGMENT },
  uniforms: { ...SKY_UNIFORMS, ...wrapUniforms(tile), uFogDensity: { type: "f32", value: fogDensity }, uFogEnd: { type: "f32", value: fogEnd } },
  side: "double"
});

export const sceneryGlowSpec = (tile = 240): CustomSpec => ({
  glsl: { vertex: GLOW_VERTEX, fragment: GLOW_FRAGMENT },
  uniforms: { uGlow: { type: "f32", value: 1 }, ...wrapUniforms(tile) },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double"
});

export const cloudSeaSpec = (): CustomSpec => ({
  glsl: { vertex: CLOUD_VERTEX, fragment: CLOUD_FRAGMENT },
  uniforms: { ...SKY_UNIFORMS, uScroll: { type: "f32", value: 0 }, uDrift: { type: "f32", value: 0 } },
  side: "double"
});

/* ------------------------------------------------------------------ mesh building */

/** Objects wrap so their anchor stays within [WRAP_BEHIND - tile, WRAP_BEHIND) (just behind the camera at z = 9). */
export const WRAP_BEHIND = 40;

/**
 * Indexed scenery mesh. Positions are shared between faces (flat shading comes from derivatives in the fragment
 * stage), uv = (glow, object anchor z). The engine walks every runtime node's vertices each frame, so the vertex
 * count is the budget that matters.
 */
interface Geo {
  positions: number[];
  uvs: number[];
  indices: number[];
  tones: number[];
  anchor: number;
}

type V3 = [number, number, number];

const newGeo = (): Geo => ({ positions: [], uvs: [], indices: [], tones: [], anchor: 0 });

/** Presentation PRNG (mulberry32); seeded per layer, never the gameplay RNG. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vert(g: Geo, p: V3, tone: Rgb, glow = 0): number {
  g.positions.push(p[0], p[1], p[2]);
  g.uvs.push(glow, g.anchor);
  g.tones.push(tone[0], tone[1], tone[2]);
  return g.positions.length / 3 - 1;
}

const tri = (g: Geo, a: number, b: number, c: number): void => { g.indices.push(a, b, c); };
const quad = (g: Geo, a: number, b: number, c: number, d: number): void => { g.indices.push(a, b, c, a, c, d); };

/** Stitch two rings of equal length (closed loops) with quads. */
function stitch(g: Geo, a: readonly number[], b: readonly number[]): void {
  const n = a.length;
  for (let i = 0; i < n; i++) quad(g, a[i]!, a[(i + 1) % n]!, b[(i + 1) % n]!, b[i]!);
}

const fan = (g: Geo, ring: readonly number[], apex: number): void => {
  for (let i = 0; i < ring.length; i++) tri(g, ring[i]!, ring[(i + 1) % ring.length]!, apex);
};

const lin = (hex: string): Rgb => hexToLinear(hex);
const shade = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const mixC = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const C = {
  moss: lin("#7a9a6a"),
  mossWarm: lin("#a08a5a"),
  earth: lin("#6a4a4a"),
  rock: lin("#4a3a58"),
  rockDeep: lin("#22182e"),
  pine: lin("#2a5a52"),
  pineDark: lin("#1e3e40"),
  metal: lin("#3a3448"),
  metalLight: lin("#8a86a0"),
  silver: lin("#e8e4f0"),
  red: lin(LOOK.red),
  blue: lin(LOOK.blue),
  redHot: lin("#ff7a5a"),
  blueHot: lin("#6ac8ff"),
  skirt: lin("#2a2034"),
  gold: lin(LOOK.gold)
};

/** Rotate a point about the origin: tilt about Z, then X, then yaw about Y; then scale and translate. */
function xform(p: V3, yaw: number, tiltX: number, tiltZ: number, o: V3): V3 {
  let [x, y, z] = p;
  let c = Math.cos(tiltZ), sn = Math.sin(tiltZ);
  [x, y] = [x * c - y * sn, x * sn + y * c];
  c = Math.cos(tiltX); sn = Math.sin(tiltX);
  [y, z] = [y * c - z * sn, y * sn + z * c];
  c = Math.cos(yaw); sn = Math.sin(yaw);
  [x, z] = [x * c + z * sn, -x * sn + z * c];
  return [x + o[0], y + o[1], z + o[2]];
}

/** Hexagonal crystal with a pointed tip, standing on `base` (13 vertices). */
function crystal(g: Geo, base: V3, r: number, h: number, yaw: number, tiltX: number, tiltZ: number, tone: Rgb): void {
  const ring = (y: number, rr: number): number[] => Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    return vert(g, xform([Math.cos(a) * rr, y, Math.sin(a) * rr], yaw, tiltX, tiltZ, base), tone, 1);
  });
  const bottom = ring(-0.2 * h, r * 0.8), top = ring(h * 0.72, r);
  stitch(g, bottom, top);
  fan(g, top, vert(g, xform([0, h, 0], yaw, tiltX, tiltZ, base), tone, 1));
}

/** Two-tier low-poly pine (14 vertices). */
function pine(g: Geo, base: V3, h: number, yaw: number): void {
  for (let tier = 0; tier < 2; tier++) {
    const y0 = base[1] + h * (0.18 + tier * 0.32), y1 = base[1] + h * (0.75 + tier * 0.25), r = h * (0.32 - tier * 0.1);
    const ring = Array.from({ length: 6 }, (_, i) => {
      const a = yaw + (i / 6) * Math.PI * 2;
      return vert(g, [base[0] + Math.cos(a) * r, y0, base[2] + Math.sin(a) * r], i % 2 ? C.pine : C.pineDark);
    });
    fan(g, ring, vert(g, [base[0], y1, base[2]], C.pine));
  }
}

/**
 * Floating island: a moss cap, an earth lip, tapering rock rings and a hanging tip. `pole` -1 warm (red crystals),
 * +1 cool (blue). `props` adds pines and a crystal cluster on top.
 */
function island(g: Geo, rnd: () => number, cx: number, cy: number, cz: number, r: number, pole: -1 | 1, props: boolean, n = 9): void {
  const yaw = rnd() * Math.PI * 2;
  const jitter = Array.from({ length: n }, () => 0.82 + rnd() * 0.32);
  const depth = r * (1.3 + rnd() * 0.8);
  const spec: readonly [number, number, number, Rgb][] = [
    [0, 1, 0, C.earth], [-0.22 * r, 1.04, 0.08, C.earth], [-0.45 * depth, 0.78, 0.2, C.rock], [-0.72 * depth, 0.46, 0.25, shade(C.rock, 0.75)], [-0.9 * depth, 0.2, 0.3, C.rockDeep]
  ];
  const pts: V3[][] = spec.map(([y, k, wob]) => Array.from({ length: n }, (_, i) => {
    const a = yaw + (i / n) * Math.PI * 2;
    const rr = r * k * ((jitter[i] as number) + (rnd() - 0.5) * wob);
    return [cx + Math.cos(a) * rr, cy + y, cz + Math.sin(a) * rr] as V3;
  }));
  const capTone = mixC(C.moss, C.mossWarm, pole < 0 ? 0.55 : 0.1);
  const cap = pts[0]!.map((p, i) => vert(g, p, shade(capTone, 0.9 + 0.2 * ((i * 7) % 3) / 2)));
  fan(g, [...cap].reverse(), vert(g, [cx, cy + r * 0.06, cz], capTone));
  const rings = pts.map((ring, k) => ring.map((p, i) => vert(g, p, shade(spec[k]![3], 0.85 + 0.3 * (((i * 5 + k) % 4) / 3)))));
  for (let k = 0; k < rings.length - 1; k++) stitch(g, rings[k]!, rings[k + 1]!);
  fan(g, rings[rings.length - 1]!, vert(g, [cx + (rnd() - 0.5) * r * 0.3, cy - depth, cz + (rnd() - 0.5) * r * 0.3], C.rockDeep));
  if (!props) return;
  const trees = 1 + Math.floor(rnd() * 3);
  for (let t = 0; t < trees; t++) {
    const a = rnd() * Math.PI * 2, rr = r * (0.3 + rnd() * 0.45);
    pine(g, [cx + Math.cos(a) * rr, cy + r * 0.03, cz + Math.sin(a) * rr], r * (0.55 + rnd() * 0.45), rnd() * 6);
  }
  const tone = pole < 0 ? C.red : C.blue;
  const count = 3 + Math.floor(rnd() * 3);
  const ca = rnd() * Math.PI * 2, cr = r * 0.25;
  for (let k = 0; k < count; k++) {
    const a = ca + (rnd() - 0.5) * 1.6;
    const big = k === 0;
    crystal(g, [cx + Math.cos(a) * cr * (big ? 0.2 : 1), cy + r * 0.04, cz + Math.sin(a) * cr * (big ? 0.2 : 1)],
      r * (big ? 0.12 : 0.07), r * (big ? 0.85 : 0.35 + rnd() * 0.3), rnd() * 6, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6,
      big ? (pole < 0 ? C.redHot : C.blueHot) : tone);
  }
}

/** Hexagonal tube swept along a path in the XY plane, placed by `place`; tone/glow per path point. */
function tube(g: Geo, path: V3[], r: number, toneAt: (t: number) => Rgb, glowAt: (t: number) => number, place: (p: V3) => V3): void {
  const sides = 6;
  let prev: number[] | null = null;
  path.forEach((p, i) => {
    const a = path[Math.max(0, i - 1)]!, b = path[Math.min(path.length - 1, i + 1)]!;
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty, ny = tx, t = i / (path.length - 1);
    const ring = Array.from({ length: sides }, (_, k) => {
      const th = (k / sides) * Math.PI * 2;
      const c = Math.cos(th) * r, s = Math.sin(th) * r;
      return vert(g, place([p[0] + nx * c, p[1] + ny * c, p[2] + s]), toneAt(t), glowAt(t));
    });
    if (prev) stitch(g, prev, ring);
    prev = ring;
  });
}

/** Horseshoe-magnet monument: red half on the left, blue half on the right, glowing silver pole tips. */
function magnet(g: Geo, o: V3, R: number, yaw: number, tilt: number): void {
  const legs = R * 1.1, tr = R * 0.3;
  const path: V3[] = [];
  for (let i = 0; i <= 3; i++) path.push([-R, -legs + (legs * i) / 3, 0]);
  for (let i = 1; i < 12; i++) { const a = Math.PI - (i / 12) * Math.PI; path.push([Math.cos(a) * R, Math.sin(a) * R, 0]); }
  for (let i = 0; i <= 3; i++) path.push([R, (legs * (3 - i)) / 3, 0]);
  const tip = (t: number): boolean => t < 0.1 || t > 0.9;
  tube(g, path, tr, (t) => (tip(t) ? C.silver : t < 0.5 ? C.red : C.blue), (t) => (tip(t) ? 0.55 : 0.1), (p) => xform(p, yaw, 0, tilt, o));
}

/** Box from 8 shared corners (bottom half-size b0 at y0, top half-size b1 at y1). */
function pillar(g: Geo, x: number, z: number, y0: number, y1: number, b0: number, b1: number, tone: Rgb, topTone: Rgb, topGlow: number): void {
  const bot = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => vert(g, [x + sx! * b0, y0, z + sz! * b0], shade(tone, 0.8)));
  const top = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => vert(g, [x + sx! * b1, y1, z + sz! * b1], tone));
  stitch(g, bot, top);
  const cap = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => vert(g, [x + sx! * b1, y1, z + sz! * b1], topTone, topGlow));
  quad(g, cap[0]!, cap[1]!, cap[2]!, cap[3]!);
}

/** Magnet arch over the road: dark metal hoop with a glowing inner strip, red on the left half and blue on the right. */
function arch(g: Geo, z: number): void {
  const R = 8.2, yc = -1.2, segs = 20;
  const outer: V3[] = [], inner: V3[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI - (i / segs) * Math.PI;
    outer.push([Math.cos(a) * R, yc + Math.sin(a) * R, 0]);
    inner.push([Math.cos(a) * (R - 0.32), yc + Math.sin(a) * (R - 0.32), 0]);
  }
  const place = (p: V3): V3 => [p[0], p[1], p[2] + z];
  tube(g, outer, 0.34, () => C.metal, () => 0, place);
  tube(g, inner, 0.09, (t) => (t < 0.5 ? C.red : C.blue), () => 1, place);
  pillar(g, -R, z, -1.6, 0.5, 0.7, 0.56, C.metalLight, C.red, 1);
  pillar(g, R, z, -1.6, 0.5, 0.7, 0.56, C.metalLight, C.blue, 1);
}

/** Flat strip quad between z0 and z1 (4 vertices). */
function strip(g: Geo, a: V3, b: V3, len: number, tone: Rgb, glow = 0): void {
  quad(g, vert(g, a, tone, glow), vert(g, b, tone, glow), vert(g, [b[0], b[1], b[2] - len], tone, glow), vert(g, [a[0], a[1], a[2] - len], tone, glow));
}

/** One 24-unit road module: underside skirt, glowing lip strips and a pylon into the cloud sea. */
function roadModule(g: Geo, z: number, len: number): void {
  const w = 4.32;
  strip(g, [-w, -0.3, z], [-w + 0.6, -1.3, z], len, C.skirt);
  strip(g, [w - 0.6, -1.3, z], [w, -0.3, z], len, C.skirt);
  strip(g, [-w + 0.6, -1.3, z], [w - 0.6, -1.3, z], len, shade(C.skirt, 0.7));
  strip(g, [-w - 0.02, -0.42, z], [-w - 0.02, -0.6, z], len, C.red, 1);
  strip(g, [w + 0.02, -0.6, z], [w + 0.02, -0.42, z], len, C.blue, 1);
  const n = 6, top = 1.5, bot = 0.6, y0 = -1.3, y1 = -34, pz = z - len / 2;
  const ringAt = (y: number, rr: number, tone: (a: number) => Rgb, glow: number): number[] => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return vert(g, [Math.cos(a) * rr, y, pz + Math.sin(a) * rr], tone(a), glow);
  });
  stitch(g, ringAt(y0, top, () => C.metal, 0), ringAt(y1, bot, () => shade(C.metal, 0.6), 0));
  const band = (a: number): Rgb => (Math.cos(a) < 0 ? C.red : C.blue);
  stitch(g, ringAt(-3.2, top + 0.1, band, 1), ringAt(-3.55, top + 0.08, band, 1));
}

/** Tiny octahedron mote for the additive glow layer (6 vertices). */
function mote(g: Geo, p: V3, s: number, tone: Rgb, strength: number): void {
  const t = vert(g, [p[0], p[1] + s, p[2]], tone, strength), b = vert(g, [p[0], p[1] - s, p[2]], tone, strength);
  const ring = [[s, 0], [0, s], [-s, 0], [0, -s]].map(([dx, dz]) => vert(g, [p[0] + dx!, p[1], p[2] + dz!], tone, strength));
  fan(g, ring, t);
  fan(g, [...ring].reverse(), b);
}

/** Tall distant spire: a tapering jagged column with a moss cap and a crystal crown. */
function spire(g: Geo, rnd: () => number, cx: number, cz: number, h: number, r: number, pole: -1 | 1): void {
  const n = 7, levels = 5;
  let prev: number[] | null = null;
  let last: number[] = [];
  for (let l = 0; l <= levels; l++) {
    const y = -60 + (h + 60) * (l / levels);
    const k = 1 - 0.55 * (l / levels);
    const ring = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + l * 0.3;
      const rr = r * k * (0.8 + rnd() * 0.4);
      return vert(g, [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr], shade(mixC(C.rockDeep, C.rock, l / levels), 0.75 + 0.35 * ((i + l) % 3) / 2));
    });
    if (prev) stitch(g, prev, ring);
    prev = ring;
    last = ring;
  }
  const capTone = mixC(C.moss, C.mossWarm, pole < 0 ? 0.6 : 0.1);
  const cap = last.map((i) => vert(g, [g.positions[i * 3]!, g.positions[i * 3 + 1]!, g.positions[i * 3 + 2]!], capTone));
  fan(g, [...cap].reverse(), vert(g, [cx, h + r * 0.15, cz], capTone));
  crystal(g, [cx, h, cz], r * 0.18, r * 1.4, rnd() * 6, 0.1, -0.1 * pole, pole < 0 ? C.redHot : C.blueHot);
}

/* ------------------------------------------------------------------ layers */

export interface SceneryLayer {
  readonly id: string;
  /** Wrap length: objects live in [WRAP_BEHIND - tile, WRAP_BEHIND). */
  readonly tile: number;
  readonly parallax: number;
  readonly glow: boolean;
}

export const LAYERS: readonly SceneryLayer[] = [
  { id: "scenery-near", tile: 440, parallax: 1, glow: false },
  { id: "scenery-mid", tile: 440, parallax: 0.55, glow: false },
  { id: "scenery-far", tile: 440, parallax: 0.12, glow: false },
  { id: "scenery-motes", tile: 240, parallax: 1, glow: true }
];

function buildLayer(layer: SceneryLayer): Geo {
  const g = newGeo();
  const tile = layer.tile, front = WRAP_BEHIND - tile;
  /** Start a new wrapped object anchored at `z`. */
  const at = (z: number): void => { g.anchor = z; };
  if (layer.id === "scenery-near") {
    const rnd = prng(0x5eed01);
    const moduleLen = 24;
    for (let z = WRAP_BEHIND; z > front + 0.1; z -= moduleLen) { at(z - moduleLen / 2); roadModule(g, z, moduleLen); }
    for (let z = WRAP_BEHIND - 20; z > front; z -= 64) { at(z); arch(g, z); }
    const count = 30;
    for (let k = 0; k < count; k++) {
      const pole = (k % 2 === 0 ? -1 : 1) as -1 | 1;
      const z = WRAP_BEHIND - 4 - (k / count) * (tile - 8) - rnd() * 6;
      const x = pole * (13 + rnd() * 14);
      at(z);
      island(g, rnd, x, -3 - rnd() * 7, z, 2.6 + rnd() * 2.8, pole, true);
      if (rnd() < 0.6) island(g, rnd, x + pole * (4 + rnd() * 5), 1 + rnd() * 5, z - 6 - rnd() * 4, 0.7 + rnd() * 0.8, pole, false, 7);
    }
  } else if (layer.id === "scenery-mid") {
    const rnd = prng(0x5eed02);
    const count = 18;
    for (let k = 0; k < count; k++) {
      const pole = (k % 2 === 0 ? 1 : -1) as -1 | 1;
      const z = WRAP_BEHIND - 10 - (k / count) * (tile - 20) - rnd() * 8;
      const x = pole * (34 + rnd() * 36);
      const y = -10 + rnd() * 16;
      const r = 6 + rnd() * 7;
      at(z);
      island(g, rnd, x, y, z, r, pole, true, 10);
      if (k % 3 === 1) magnet(g, [x, y + r * 1.29, z], r * 0.62, (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.25);
    }
  } else if (layer.id === "scenery-far") {
    const rnd = prng(0x5eed03);
    const count = 12;
    for (let k = 0; k < count; k++) {
      const pole = (k % 2 === 0 ? -1 : 1) as -1 | 1;
      const z = WRAP_BEHIND - 30 - (k / count) * (tile - 60) - rnd() * 20;
      at(z);
      spire(g, rnd, pole * (90 + rnd() * 110), z, 10 + rnd() * 45, 9 + rnd() * 10, pole);
      if (rnd() < 0.5) island(g, rnd, pole * (110 + rnd() * 90), 15 + rnd() * 30, z - 10, 10 + rnd() * 10, pole, true, 10);
    }
  } else {
    const rnd = prng(0x5eed04);
    for (let k = 0; k < 160; k++) {
      const pole = (rnd() < 0.5 ? -1 : 1) as -1 | 1;
      const z = WRAP_BEHIND - rnd() * tile;
      at(z);
      const tone = rnd() < 0.2 ? C.gold : pole < 0 ? C.redHot : C.blueHot;
      mote(g, [pole * (5.5 + rnd() * 30), -2 + rnd() * 12, z], 0.06 + rnd() * 0.08, tone, 0.9 + rnd() * 0.8);
    }
  }
  return g;
}

/** The layer as one static mesh; the vertex stage scrolls and wraps each object (see WRAP_FN). */
export function layerGeometry(layer: SceneryLayer) {
  const g = buildLayer(layer);
  const vertexCount = g.positions.length / 3;
  return {
    vertexCount,
    geometry: geometry.dynamic({
      positions: Float32Array.from(g.positions),
      uvs: Float32Array.from(g.uvs),
      indices: Uint32Array.from(g.indices),
      bounds: { min: [-1e4, -1e3, -1e5], max: [1e4, 1e3, 1e5] },
      attributes: { tone: { itemSize: 3, data: Float32Array.from(g.tones) } }
    })
  };
}

/** Layer scroll (vertex-stage wrap input) at a given road distance. */
export const layerScroll = (layer: SceneryLayer, distance: number): number => distance * layer.parallax;

/** Cloud-sea plane (XZ, 1400 x 1400, 2 triangles). */
export function cloudSeaGeometry() {
  const s = 700;
  return geometry.dynamic({
    positions: Float32Array.from([-s, 0, -s, s, 0, -s, s, 0, s, -s, 0, s]),
    normals: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uvs: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: Uint32Array.from([0, 2, 1, 0, 3, 2]),
    bounds: { min: [-s, -1, -s], max: [s, 1, s] }
  });
}

export const CLOUD_SEA_Y = -18;
