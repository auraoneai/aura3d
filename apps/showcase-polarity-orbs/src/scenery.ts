/**
 * Polarity Orbs scenery & custom dual-backend materials (presentation only): a sleek laboratory magnetosphere at dusk.
 * Every `material.custom` spec pairs GLSL 300 es with its 1:1 WGSL twin (`scenery-wgsl.ts`) so WebGPU (`backend: "auto"`)
 * and WebGL2 compute identical ferrofluid dipole isolines, dielectric glass/plasma-core orbs, feathered flux shockwaves,
 * sinusoidal dipole attraction arcs, and `createFlipbookAtlas("plasma")` + `createGradingLut("cyber-neon")` bursts.
 */
import { geometry, type texture } from "@aura3d/engine";
import { hexToLinear, type Rgb } from "../../../examples/shared/runner-kit/look-utils";
import type { CustomSpec } from "../../../examples/shared/runner-kit/shaders";
import { LINEAR, LOOK } from "./look";
import {
  CLOUD_FRAGMENT_WGSL,
  DECK_FRAGMENT_WGSL,
  DECK_VERTEX_WGSL,
  FLUX_ARC_FRAGMENT_WGSL,
  FLUX_RING_FRAGMENT_WGSL,
  GLOW_FRAGMENT_WGSL,
  GLOW_VERTEX_WGSL,
  PLASMA_BURST_FRAGMENT_WGSL,
  PLASMA_BURST_VERTEX_WGSL,
  PLASMA_ORB_FRAGMENT_WGSL,
  SCENERY_FRAGMENT_WGSL,
  SCENERY_VERTEX_WGSL,
  SKY_FRAGMENT_WGSL,
  UV_WORLD_VERTEX_WGSL,
  WORLD_VERTEX_WGSL,
  plasmaOrbVertexWgsl
} from "./scenery-wgsl";

type TextureRef = ReturnType<typeof texture.data>;

/* ------------------------------------------------------------------ GLSL */

const SRGB = /* glsl */ `
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}`;

/** Linear-RGB GLSL constant for an sRGB hex (converted once at build, zero per-pixel pow). */
const hexVec = (hex: string): string => {
  const [r, g, b] = hexToLinear(hex);
  return `vec3(${r.toFixed(5)}, ${g.toFixed(5)}, ${b.toFixed(5)})`;
};

const gradient = (stops: readonly { t: number; hex: string }[], name: string): string => {
  const s = [...stops].sort((a, b) => a.t - b.t);
  const out = [`vec3 ${name} = ${hexVec(s[0]!.hex)};`];
  for (let i = 1; i < s.length; i++) {
    out.push(`${name} = mix(${name}, ${hexVec(s[i]!.hex)}, smoothstep(${s[i - 1]!.t.toFixed(4)}, ${s[i]!.t.toFixed(4)}, t));`);
  }
  return out.join("\n  ");
};

const SUN_DIR = "normalize(vec3(-0.42, 0.075, -1.0))";
const MOON_DIR = "normalize(vec3(0.52, 0.17, -1.0))";

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
  c += ${hexVec("#ff7854")} * (pow(sd, 6.0) * 0.52 + pow(sd, 42.0) * 0.62) * (1.0 - 0.45 * uMix);
  c += ${hexVec("#4ec4ff")} * (pow(md, 8.0) * 0.42 + pow(md, 64.0) * 0.54) * (0.55 + 0.45 * uMix);
  float h = exp(-abs(d.y - 0.01) * 24.0);
  c += mix(${hexVec("#ff9882")}, ${hexVec("#9ee6ff")}, side(d)) * h * 0.2;
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
  vec3 p = d * 220.0;
  vec3 cell = floor(p);
  float h = hash3(cell);
  float star = step(0.9962, h) * smoothstep(0.42, 0.0, length(fract(p) - 0.5)) * smoothstep(0.08, 0.48, d.y);
  c += vec3(star) * (0.65 + 0.65 * hash3(cell + 7.0));
  float a = atan(d.x, -d.z);
  float wave = 0.25 + 0.055 * sin(a * 4.0 + uDrift * 0.16) + 0.032 * sin(a * 11.0 - uDrift * 0.11);
  float band = smoothstep(wave - 0.13, wave, d.y) * smoothstep(wave + 0.24, wave + 0.02, d.y);
  float rays = 0.55 + 0.45 * noise1(a * 38.0 + uDrift * 0.22);
  vec3 auroraCol = mix(${hexVec("#ff4d7e")}, ${hexVec("#38d8ff")}, smoothstep(-0.48, 0.48, d.x));
  c += auroraCol * band * rays * 0.3;
  float sd = dot(d, ${SUN_DIR});
  float md = dot(d, ${MOON_DIR});
  c += ${hexVec("#ffd890")} * smoothstep(0.9993, 0.9996, sd) * 2.4 + ${hexVec("#ff8858")} * pow(max(sd, 0.0), 900.0) * 0.8;
  float moon = smoothstep(0.99965, 0.9998, md) * (1.0 - 0.85 * smoothstep(0.99972, 0.99986, dot(d, normalize(${MOON_DIR} + vec3(0.006, 0.004, 0.0)))));
  c += ${hexVec("#ddf0ff")} * moon * 1.9 + ${hexVec("#54bfff")} * pow(max(md, 0.0), 1200.0) * 0.65;
  float bank = 0.032 + 0.028 * noise1(a * 9.0) + 0.016 * noise1(a * 27.0);
  float below = smoothstep(bank + 0.006, bank - 0.006, d.y) * smoothstep(-0.2, 0.0, d.y);
  vec3 bankCol = mix(${hexVec("#6d2446")}, ${hexVec("#1b3f74")}, side(d)) * (0.66 + 0.42 * smoothstep(bank - 0.04, bank, d.y));
  c = mix(c, bankCol, below * 0.78);
  outColor = vec4(c, 1.0);
}`;

const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Crisp deep-indigo distant horizon fog (`near = 155, far = max(uFogEnd, 360)`) with zero milky haze or washout. */
const FOG_FN = /* glsl */ `
vec4 fogAt(vec3 world) {
  vec3 toP = world - cameraPosition;
  float dist = length(toP);
  vec3 dir = toP / max(dist, 1e-3);
  float fogFar = max(uFogEnd, 360.0);
  float span = max(dist - 155.0, 0.0);
  float f = 1.0 - exp(-pow(span * uFogDensity, 1.35));
  f = max(f, smoothstep(155.0, fogFar, dist));
  float low = smoothstep(-10.0, -28.0, world.y) * smoothstep(155.0, 290.0, dist);
  f = clamp(f + low * 0.16, 0.0, 1.0);
  vec3 fogDir = normalize(vec3(dir.x, max(dir.y, 0.22), dir.z));
  vec3 fogTint = mix(skyColor(fogDir) * 0.34, ${hexVec("#080c20")}, 0.78);
  return vec4(fogTint, f);
}`;

const WRAP_FN = /* glsl */ `
vec3 wrapped(vec3 p, float anchor) {
  float w = mod(anchor + uScroll - uFront, uTile) + uFront;
  return p + vec3(0.0, 0.0, w - anchor);
}`;

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
  vec3 L = normalize(vec3(-0.42, 0.72, 0.55));
  vec3 H = normalize(L + V);
  float d = dot(N, L);
  float key = mix(0.32, 1.0, smoothstep(-0.14, 0.3, d));
  vec3 hemi = mix(${hexVec("#352854")}, ${hexVec("#d2defc")}, 0.5 * N.y + 0.5) * 0.56;
  vec3 keyCol = mix(${hexVec("#ffd2b4")}, ${hexVec("#d6ecff")}, uMix) * 0.88;
  vec3 lit = hemi + keyCol * key;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.8);
  float spec = pow(max(dot(N, H), 0.0), 42.0) * 0.34 * (1.0 - vGlow);
  vec3 rimCol = mix(${hexVec("#ff6474")}, ${hexVec("#4ec8ff")}, smoothstep(-14.0, 14.0, vWorld.x));
  vec3 col = vTone * lit + rimCol * fres * 0.56 * (1.0 - vGlow) + vec3(spec);
  col = mix(col, vTone * (1.75 + 0.95 * fres), vGlow);
  outColor = vec4(mix(col, vFog.rgb, vFog.a), 1.0);
}`;

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
  float fade = 1.0 - smoothstep(60.0, 195.0, dist);
  outColor = vec4(vTone * vGlow * fade * uGlow, 1.0);
}`;

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
  vec3 dir = toP / max(dist, 1e-3);
  vec3 deep = mix(${hexVec("#090a1c")}, ${hexVec("#060c20")}, side(dir));
  vec3 top = mix(${hexVec("#642644")}, ${hexVec("#1e4d7e")}, side(dir));
  float ridge = smoothstep(0.55, 0.95, n2v);
  vec3 c = mix(deep, top * (0.64 + 0.36 * ridge), cloud);
  float sunGlint = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(-0.42, 0.0, -1.0))), 0.0), 12.0);
  float moonGlint = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(0.52, 0.0, -1.0))), 0.0), 14.0);
  c += (${hexVec("#ff8858")} * sunGlint * (1.0 - 0.4 * uMix) + ${hexVec("#5ec4ff")} * moonGlint * (0.6 + 0.4 * uMix)) * cloud * 0.34;
  float f = smoothstep(155.0, 380.0, dist);
  vec3 fogDir = normalize(vec3(dir.x, 0.18, dir.z));
  vec3 fogTint = mix(skyColor(fogDir) * 0.36, ${hexVec("#080c20")}, 0.76);
  outColor = vec4(mix(c, fogTint, f), 1.0);
}`;

/**
 * Polished dark-glass + ferrofluid slate track deck: crisp panel seams, glowing lane conduits, animated magnetic
 * dipole isolines, sharp specular lobe, and Fresnel sky reflection (`roughness ~0.22` look paired with engine SSR).
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
  vec3 slateFloor = ${hexVec("#0d1020")};
  vec3 base = mix(slateFloor, vTone, 0.72) * mix(0.68, 1.0, up);
  float zc = vLocal.z * 0.25 + 0.25;
  float seamZ = abs(fract(zc) - 0.5) * 2.0;
  float fwz = fwidth(zc) * 2.0 + 1e-4;
  float acrossLine = smoothstep(0.965 - fwz, 0.965 + fwz, seamZ);
  float xl = abs(abs(vWorld.x) - 1.15);
  float fwx = fwidth(vWorld.x) + 1e-4;
  float laneLine = 1.0 - smoothstep(0.022, 0.022 + fwx * 1.5, xl);
  float seam = max(acrossLine, laneLine * 0.85) * up;
  base *= 1.0 - 0.34 * seam;

  float dipolePhase = vWorld.x * 2.15 + sin(vLocal.z * 0.42 - uDrift * 2.6) * 0.85;
  float field = dipolePhase + cos(vLocal.z * 0.28 + vWorld.x * 0.9 - uDrift * 1.9) * 0.65;
  float isoCell = abs(fract(field * 1.35) - 0.5) * 2.0;
  float isoFw = fwidth(field * 1.35) * 1.8 + 1e-4;
  float isoLine = (1.0 - smoothstep(0.06, 0.06 + isoFw, isoCell)) * up;
  float isRight = step(0.0, vWorld.x);
  float dominance = mix(1.0 - uMix, uMix, isRight);
  vec3 poleGlow = mix(${hexVec("#ff5468")}, ${hexVec("#38bdf8")}, isRight);
  vec3 conduitGlow = poleGlow * (isoLine * (0.14 + 0.34 * dominance) + laneLine * up * (0.12 + 0.24 * dominance));

  vec3 L = normalize(vec3(-0.35, 0.82, 0.45));
  vec3 H = normalize(L + V);
  float lit = 0.78 + 0.24 * max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), 84.0) * 0.55 * up;
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 4.2);
  vec3 col = base * lit + conduitGlow + vRefl * (0.09 + 0.58 * fres) * up + vec3(0.94, 0.97, 1.0) * spec;
  outColor = vec4(mix(col, vFog.rgb, vFog.a), 1.0);
}`;

/* ------------------------------------------------------------------ Dielectric Glass + Swirling Dipole Plasma-Core Orbs (GLSL) */

const plasmaOrbVertexGlsl = (withTone: boolean): string => /* glsl */ `
${withTone ? "in vec3 tone;" : ""}
out vec3 vNormal;
out vec3 vWorld;
out vec3 vLocal;
out vec3 vTone;
void main() {
  vLocal = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  vTone = ${withTone ? "tone" : "vec3(1.0)"};
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const PLASMA_ORB_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec3 vTone;
out vec4 outColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float ndotv = clamp(dot(N, V), 0.0, 1.0);

  float axisDot = N.y * cos(uFlipAngle) + N.x * sin(uFlipAngle);
  float splitMask = smoothstep(-0.04, 0.04, axisDot);
  vec3 northCol = vTone * baseColor;
  vec3 southCol = mix(northCol, poleSouthColor, uSplitPole);
  vec3 poleCol = mix(southCol, northCol, splitMask);

  float swirlA = sin(vLocal.x * 9.5 + vLocal.z * 7.5 + uTime * 3.8) * cos(vLocal.y * 8.5 - uTime * 2.9);
  float swirlB = sin((vLocal.x - vLocal.z) * 13.5 - uTime * 5.1);
  float plasma = clamp(0.5 + 0.34 * swirlA + 0.24 * swirlB, 0.0, 1.0);
  float coreDepth = pow(ndotv, 1.35);
  vec3 deepGlass = poleCol * 0.30;
  vec3 hotCore = mix(poleCol * 1.32, vec3(1.0, 0.96, 0.90), plasma * coreDepth * 0.22);
  vec3 col = mix(deepGlass, hotCore, 0.36 + 0.64 * coreDepth * (0.48 + 0.52 * plasma));

  float eqBand = (1.0 - smoothstep(0.024, 0.068, abs(axisDot))) * uSplitPole;
  col = mix(col, vec3(0.84, 0.90, 0.98), eqBand * 0.72);

  vec3 L1 = normalize(vec3(-0.35, 0.84, 0.44));
  vec3 H1 = normalize(L1 + V);
  vec3 L2 = normalize(vec3(0.52, 0.48, 0.68));
  vec3 H2 = normalize(L2 + V);
  float specSharp = pow(max(dot(N, H1), 0.0), 148.0) * 1.15;
  float specCoat = pow(max(dot(N, H1), 0.0), 28.0) * 0.18;
  float specFill = pow(max(dot(N, H2), 0.0), 68.0) * 0.28;
  float fres = 0.04 + 0.96 * pow(1.0 - ndotv, 3.6);

  float isWarm = step(poleCol.b, poleCol.r);
  vec3 iridTint = mix(${hexVec("#66f2ff")}, ${hexVec("#ffbe48")}, isWarm);
  col += mix(poleCol, iridTint, 0.52 * uIridescence) * (fres * 0.56);
  col += vec3(1.0, 0.98, 0.95) * (specSharp + specCoat) + iridTint * specFill;

  float peak = max(col.r, max(col.g, col.b));
  float k = 0.88;
  float over = max(peak - k, 0.0);
  float targetPeak = min(peak, k) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
  vec3 rolled = col * (targetPeak / max(peak, 1e-4));
  outColor = vec4(rolled, 1.0);
}`;

/* ------------------------------------------------------------------ Feathered Flux Rings & Curved Dipole Arcs (GLSL) */

const UV_WORLD_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const FLUX_RING_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float r = clamp(vUv.y, 0.0, 1.0);
  float feather = smoothstep(0.0, 0.24, r) * (1.0 - smoothstep(0.68, 1.0, r));
  float waves = 0.52 + 0.48 * cos((r * uRingCount - uTime * 3.4) * 6.2831853);
  float ticks = smoothstep(0.76, 0.97, cos((vUv.x * 8.0 + uSpin) * 6.2831853));
  float crest = smoothstep(0.42, 0.78, r) * (1.0 - smoothstep(0.78, 0.98, r));
  float fres = pow(1.0 - abs(dot(N, V)), 1.8);
  float energy = clamp(feather * (0.45 + 0.55 * waves) + crest * 0.55 + feather * ticks * 0.35, 0.0, 1.4);
  vec3 col = mix(baseColor, edgeColor, clamp(r * 0.75 + crest * 0.5, 0.0, 1.0)) * (1.25 + fres * 0.85);
  float alpha = clamp(uAlpha * energy, 0.0, 0.96);
  outColor = vec4(col, alpha);
}`;

const FLUX_ARC_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  float across = abs(vUv.y * 2.0 - 1.0);
  float ribbon = 1.0 - smoothstep(0.05, 0.98, across);
  float ends = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265);
  float pulse = 0.52 + 0.48 * sin(vUv.x * 22.0 - uTime * 18.0);
  float hot = smoothstep(0.55, 0.98, pulse) * (1.0 - smoothstep(0.0, 0.55, across));
  vec3 col = mix(coreColor, edgeColor, clamp(hot + 0.28 * pulse, 0.0, 1.0)) * (1.35 + hot * 0.9);
  float alpha = clamp(uAlpha * ribbon * ends * (0.48 + 0.52 * pulse), 0.0, 0.96);
  outColor = vec4(col, alpha);
}`;

/* ------------------------------------------------------------------ Plasma Flipbook Burst + Cyber-Neon LUT (GLSL) */

const PLASMA_BURST_VERTEX = /* glsl */ `
in vec3 tone;
out vec2 vUv;
out vec3 vTone;
void main() {
  vUv = uv;
  vTone = tone;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const PLASMA_BURST_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vTone;
out vec4 outColor;
void main() {
  vec4 texel = texture(plasmaMap, vUv);
  vec3 raw = clamp(texel.rgb * vTone * 1.2, 0.0, 1.0);
  float bSlice = floor(raw.b * 15.0);
  vec2 lutUv = vec2((bSlice * 16.0 + raw.r * 15.0 + 0.5) / 256.0, (raw.g * 15.0 + 0.5) / 16.0);
  vec3 graded = texture(lutMap, lutUv).rgb;
  vec3 col = mix(raw, graded, 0.65) * 1.65;
  outColor = vec4(col * texel.a, texel.a);
}`;

/* ------------------------------------------------------------------ Exported Specs */

export const deckSpec = (): CustomSpec => ({
  glsl: { vertex: DECK_VERTEX, fragment: DECK_FRAGMENT },
  wgsl: { vertex: DECK_VERTEX_WGSL, fragment: DECK_FRAGMENT_WGSL },
  uniforms: {
    uMix: { type: "f32", value: 0 },
    uDrift: { type: "f32", value: 0 },
    uFogDensity: { type: "f32", value: 1 / 420 },
    uFogEnd: { type: "f32", value: 380 }
  },
  side: "double"
});

export interface PlasmaOrbOptions {
  readonly baseColor?: Rgb;
  readonly poleSouthColor?: Rgb;
  readonly splitPole?: number;
  readonly flipAngle?: number;
  readonly iridescence?: number;
  readonly withTone?: boolean;
}

export const plasmaOrbSpec = (options: PlasmaOrbOptions = {}): CustomSpec => {
  const withTone = options.withTone ?? false;
  const baseColor = options.baseColor ?? (withTone ? [1, 1, 1] : LINEAR.red);
  const poleSouthColor = options.poleSouthColor ?? LINEAR.blue;
  return {
    glsl: { vertex: plasmaOrbVertexGlsl(withTone), fragment: PLASMA_ORB_FRAGMENT },
    wgsl: { vertex: plasmaOrbVertexWgsl(withTone), fragment: PLASMA_ORB_FRAGMENT_WGSL },
    uniforms: {
      baseColor: { type: "color3", value: [...baseColor] },
      poleSouthColor: { type: "color3", value: [...poleSouthColor] },
      uSplitPole: { type: "f32", value: options.splitPole ?? 0 },
      uFlipAngle: { type: "f32", value: options.flipAngle ?? 0 },
      uIridescence: { type: "f32", value: options.iridescence ?? 1 }
    }
  };
};

export const fluxRingSpec = (baseColor: Rgb = LINEAR.red, edgeColor: Rgb = [1, 0.85, 0.45], alpha = 0.82, ringCount = 3.5): CustomSpec => ({
  glsl: { vertex: UV_WORLD_VERTEX, fragment: FLUX_RING_FRAGMENT },
  wgsl: { vertex: UV_WORLD_VERTEX_WGSL, fragment: FLUX_RING_FRAGMENT_WGSL },
  uniforms: {
    baseColor: { type: "color3", value: [...baseColor] },
    edgeColor: { type: "color3", value: [...edgeColor] },
    uAlpha: { type: "f32", value: alpha },
    uRingCount: { type: "f32", value: ringCount },
    uSpin: { type: "f32", value: 0 }
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double"
});

export const fluxArcSpec = (coreColor: Rgb = LINEAR.purple, edgeColor: Rgb = [0.72, 0.96, 1], alpha = LOOK.magnet.alpha): CustomSpec => ({
  glsl: { vertex: UV_WORLD_VERTEX, fragment: FLUX_ARC_FRAGMENT },
  wgsl: { vertex: UV_WORLD_VERTEX_WGSL, fragment: FLUX_ARC_FRAGMENT_WGSL },
  uniforms: {
    coreColor: { type: "color3", value: [...coreColor] },
    edgeColor: { type: "color3", value: [...edgeColor] },
    uAlpha: { type: "f32", value: alpha }
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double"
});

export const plasmaBurstSpec = (plasmaTexture: TextureRef, lutTexture: TextureRef): CustomSpec => ({
  glsl: { vertex: PLASMA_BURST_VERTEX, fragment: PLASMA_BURST_FRAGMENT },
  wgsl: { vertex: PLASMA_BURST_VERTEX_WGSL, fragment: PLASMA_BURST_FRAGMENT_WGSL },
  uniforms: {
    plasmaMap: { type: "texture2d", value: plasmaTexture },
    lutMap: { type: "texture2d", value: lutTexture }
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double"
});

const SKY_UNIFORMS = { uMix: { type: "f32" as const, value: 0 } };

export const sceneSkySpec = (): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  wgsl: { vertex: WORLD_VERTEX_WGSL, fragment: SKY_FRAGMENT_WGSL },
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
  wgsl: { vertex: SCENERY_VERTEX_WGSL, fragment: SCENERY_FRAGMENT_WGSL },
  uniforms: { ...SKY_UNIFORMS, ...wrapUniforms(tile), uFogDensity: { type: "f32", value: fogDensity }, uFogEnd: { type: "f32", value: fogEnd } },
  side: "double"
});

export const sceneryGlowSpec = (tile = 240): CustomSpec => ({
  glsl: { vertex: GLOW_VERTEX, fragment: GLOW_FRAGMENT },
  wgsl: { vertex: GLOW_VERTEX_WGSL, fragment: GLOW_FRAGMENT_WGSL },
  uniforms: { uGlow: { type: "f32", value: 1 }, ...wrapUniforms(tile) },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double"
});

export const cloudSeaSpec = (): CustomSpec => ({
  glsl: { vertex: CLOUD_VERTEX, fragment: CLOUD_FRAGMENT },
  wgsl: { vertex: WORLD_VERTEX_WGSL, fragment: CLOUD_FRAGMENT_WGSL },
  uniforms: { ...SKY_UNIFORMS, uScroll: { type: "f32", value: 0 }, uDrift: { type: "f32", value: 0 } },
  side: "double"
});

/* ------------------------------------------------------------------ mesh building */

export const WRAP_BEHIND = 40;

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
  moss: lin("#3d685e"),
  mossWarm: lin("#70584a"),
  earth: lin("#3d2d3e"),
  rock: lin("#26203a"),
  rockDeep: lin("#120f22"),
  pine: lin("#1f484c"),
  pineDark: lin("#132e35"),
  metal: lin("#6a7688"),
  metalLight: lin("#b8c8de"),
  copper: lin("#d67c44"),
  ceramicWhite: lin("#eaf6ff"),
  ceramicCyan: lin("#b8ecff"),
  silver: lin("#eef4ff"),
  red: lin(LOOK.red),
  blue: lin(LOOK.blue),
  redHot: lin("#ff7684"),
  blueHot: lin("#6ad8ff"),
  skirt: lin("#38425e"),
  gold: lin(LOOK.gold)
};

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

function crystal(g: Geo, base: V3, r: number, h: number, yaw: number, tiltX: number, tiltZ: number, tone: Rgb): void {
  const ring = (y: number, rr: number): number[] => Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return vert(g, xform([Math.cos(a) * rr, y, Math.sin(a) * rr], yaw, tiltX, tiltZ, base), tone, 1);
  });
  const bottom = ring(-0.2 * h, r * 0.8), top = ring(h * 0.72, r);
  stitch(g, bottom, top);
  fan(g, top, vert(g, xform([0, h, 0], yaw, tiltX, tiltZ, base), tone, 1));
}

function pine(g: Geo, base: V3, h: number, yaw: number): void {
  for (let tier = 0; tier < 2; tier++) {
    const y0 = base[1] + h * (0.18 + tier * 0.32), y1 = base[1] + h * (0.75 + tier * 0.25), r = h * (0.32 - tier * 0.1);
    const ring = Array.from({ length: 8 }, (_, i) => {
      const a = yaw + (i / 8) * Math.PI * 2;
      return vert(g, [base[0] + Math.cos(a) * r, y0, base[2] + Math.sin(a) * r], i % 2 ? C.pine : C.pineDark);
    });
    fan(g, ring, vert(g, [base[0], y1, base[2]], C.pine));
  }
}

function island(g: Geo, rnd: () => number, cx: number, cy: number, cz: number, r: number, pole: -1 | 1, props: boolean, n = 16): void {
  const yaw = rnd() * Math.PI * 2;
  const jitter = Array.from({ length: n }, () => 0.86 + rnd() * 0.24);
  const depth = r * (1.3 + rnd() * 0.8);
  const spec: readonly [number, number, number, Rgb][] = [
    [0, 1, 0, C.earth], [-0.22 * r, 1.04, 0.06, C.earth], [-0.45 * depth, 0.78, 0.14, C.rock], [-0.72 * depth, 0.46, 0.18, shade(C.rock, 0.75)], [-0.9 * depth, 0.2, 0.22, C.rockDeep]
  ];
  const pts: V3[][] = spec.map(([y, k, wob]) => Array.from({ length: n }, (_, i) => {
    const a = yaw + (i / n) * Math.PI * 2;
    const rr = r * k * ((jitter[i] as number) + (rnd() - 0.5) * wob);
    return [cx + Math.cos(a) * rr, cy + y, cz + Math.sin(a) * rr] as V3;
  }));
  const capTone = mixC(C.moss, C.mossWarm, pole < 0 ? 0.55 : 0.1);
  const cap = pts[0]!.map((p, i) => vert(g, p, shade(capTone, 0.92 + 0.16 * ((i * 7) % 3) / 2)));
  fan(g, [...cap].reverse(), vert(g, [cx, cy + r * 0.06, cz], capTone));
  const rings = pts.map((ring, k) => ring.map((p, i) => vert(g, p, shade(spec[k]![3], 0.86 + 0.24 * (((i * 5 + k) % 4) / 3)))));
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

function tube(g: Geo, path: V3[], r: number, toneAt: (t: number) => Rgb, glowAt: (t: number) => number, place: (p: V3) => V3): void {
  const sides = 8;
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

function magnet(g: Geo, o: V3, R: number, yaw: number, tilt: number): void {
  const legs = R * 1.12, tr = R * 0.3;
  const path: V3[] = [];
  for (let i = 0; i <= 3; i++) path.push([-R, -legs + (legs * i) / 3, 0]);
  for (let i = 1; i < 16; i++) { const a = Math.PI - (i / 16) * Math.PI; path.push([Math.cos(a) * R, Math.sin(a) * R, 0]); }
  for (let i = 0; i <= 3; i++) path.push([R, (legs * (3 - i)) / 3, 0]);
  const tip = (t: number): boolean => t < 0.12 || t > 0.88;
  const coil = (t: number): boolean => (t >= 0.12 && t < 0.22) || (t > 0.78 && t <= 0.88);
  tube(
    g,
    path,
    tr,
    (t) => (tip(t) ? C.silver : coil(t) ? C.copper : t < 0.5 ? C.red : C.blue),
    (t) => (tip(t) ? 0.55 : 0.08),
    (p) => xform(p, yaw, 0, tilt, o)
  );
}

function pillar(g: Geo, x: number, z: number, y0: number, y1: number, b0: number, b1: number, tone: Rgb, topTone: Rgb, topGlow: number): void {
  const bot = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => vert(g, [x + sx! * b0, y0, z + sz! * b0], shade(tone, 0.8)));
  const top = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => vert(g, [x + sx! * b1, y1, z + sz! * b1], tone));
  stitch(g, bot, top);
  const cap = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => vert(g, [x + sx! * b1, y1, z + sz! * b1], topTone, topGlow));
  quad(g, cap[0]!, cap[1]!, cap[2]!, cap[3]!);
}

function arch(g: Geo, z: number): void {
  const R = 8.2, yc = -1.2, segs = 28;
  const outer: V3[] = [], inner: V3[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI - (i / segs) * Math.PI;
    outer.push([Math.cos(a) * R, yc + Math.sin(a) * R, 0]);
    inner.push([Math.cos(a) * (R - 0.32), yc + Math.sin(a) * (R - 0.32), 0]);
  }
  const place = (p: V3): V3 => [p[0], p[1], p[2] + z];
  const archTone = (t: number): Rgb =>
    Math.abs(t - 0.16) < 0.07 || Math.abs(t - 0.84) < 0.07 ? C.copper : C.metal;
  tube(g, outer, 0.34, archTone, () => 0, place);
  tube(g, inner, 0.1, (t) => (t < 0.5 ? C.red : C.blue), () => 1, place);
  // Stepped light brushed steel pedestal + glazed ceramic insulator + warm copper secondary winding + glowing crown
  pillar(g, -R, z, -1.6, -0.58, 0.78, 0.68, C.metal, C.metalLight, 0);
  pillar(g, -R, z, -0.58, -0.06, 0.58, 0.54, C.ceramicWhite, C.ceramicWhite, 0);
  pillar(g, -R, z, -0.06, 0.52, 0.52, 0.48, C.copper, C.red, 1);
  pillar(g, R, z, -1.6, -0.58, 0.78, 0.68, C.metal, C.metalLight, 0);
  pillar(g, R, z, -0.58, -0.06, 0.58, 0.54, C.ceramicCyan, C.ceramicCyan, 0);
  pillar(g, R, z, -0.06, 0.52, 0.52, 0.48, C.copper, C.blue, 1);
}

function strip(g: Geo, a: V3, b: V3, len: number, tone: Rgb, glow = 0): void {
  quad(g, vert(g, a, tone, glow), vert(g, b, tone, glow), vert(g, [b[0], b[1], b[2] - len], tone, glow), vert(g, [a[0], a[1], a[2] - len], tone, glow));
}

function roadModule(g: Geo, z: number, len: number): void {
  const w = 4.32;
  strip(g, [-w, -0.3, z], [-w + 0.6, -1.3, z], len, C.metal);
  strip(g, [w - 0.6, -1.3, z], [w, -0.3, z], len, C.metal);
  strip(g, [-w + 0.6, -1.3, z], [w - 0.6, -1.3, z], len, C.skirt);
  strip(g, [-w - 0.02, -0.42, z], [-w - 0.02, -0.6, z], len, C.red, 1);
  strip(g, [w + 0.02, -0.6, z], [w + 0.02, -0.42, z], len, C.blue, 1);
  const n = 10, top = 1.5, bot = 0.68, y0 = -1.3, y1 = -34, pz = z - len / 2;
  const ringAt = (y: number, rr: number, tone: (a: number) => Rgb, glow: number): number[] => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return vert(g, [Math.cos(a) * rr, y, pz + Math.sin(a) * rr], tone(a), glow);
  });
  stitch(g, ringAt(y0, top, () => C.metalLight, 0), ringAt(-2.1, top * 0.96, () => C.metal, 0));
  const ceramicTone = (a: number): Rgb => (Math.cos(a) < 0 ? C.ceramicWhite : C.ceramicCyan);
  stitch(g, ringAt(-2.1, top * 1.04, ceramicTone, 0), ringAt(-2.85, top * 1.02, ceramicTone, 0));
  stitch(g, ringAt(-2.85, top * 1.08, () => C.copper, 0), ringAt(-4.1, top * 1.04, () => C.copper, 0));
  const band = (a: number): Rgb => (Math.cos(a) < 0 ? C.red : C.blue);
  stitch(g, ringAt(-4.1, top * 1.12, band, 1), ringAt(-4.5, top * 1.08, band, 1));
  stitch(g, ringAt(-4.5, top * 0.96, () => C.metal, 0), ringAt(y1, bot, () => shade(C.metal, 0.72), 0));
}

function mote(g: Geo, p: V3, s: number, tone: Rgb, strength: number): void {
  const t = vert(g, [p[0], p[1] + s, p[2]], tone, strength), b = vert(g, [p[0], p[1] - s, p[2]], tone, strength);
  const ring = [[s, 0], [0, s], [-s, 0], [0, -s]].map(([dx, dz]) => vert(g, [p[0] + dx!, p[1], p[2] + dz!], tone, strength));
  fan(g, ring, t);
  fan(g, [...ring].reverse(), b);
}

function spire(g: Geo, rnd: () => number, cx: number, cz: number, h: number, r: number, pole: -1 | 1): void {
  const n = 12, levels = 6;
  let prev: number[] | null = null;
  let last: number[] = [];
  for (let l = 0; l <= levels; l++) {
    const y = -60 + (h + 60) * (l / levels);
    const k = 1 - 0.55 * (l / levels);
    const ring = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + l * 0.25;
      const rr = r * k * (0.85 + rnd() * 0.3);
      return vert(g, [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr], shade(mixC(C.rockDeep, C.rock, l / levels), 0.78 + 0.3 * ((i + l) % 3) / 2));
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
      island(g, rnd, x, -3 - rnd() * 7, z, 2.6 + rnd() * 2.8, pole, true, 16);
      if (rnd() < 0.6) island(g, rnd, x + pole * (4 + rnd() * 5), 1 + rnd() * 5, z - 6 - rnd() * 4, 0.7 + rnd() * 0.8, pole, false, 12);
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
      island(g, rnd, x, y, z, r, pole, true, 14);
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
      if (rnd() < 0.5) island(g, rnd, pole * (110 + rnd() * 90), 15 + rnd() * 30, z - 10, 10 + rnd() * 10, pole, true, 12);
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

export const layerScroll = (layer: SceneryLayer, distance: number): number => distance * layer.parallax;

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

export const CLOUD_SEA_Y = -24;
