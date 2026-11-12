/**
 * Beat Hopper stage & rhythm-runway programs (presentation only, game-local; paired 1:1 with `stage-shaders-wgsl.ts`).
 * Concert-stage volumetric night look:
 *   - `stageSkySpec`: volumetric night sky, banded sunset sun, stars, nebula ribbons + cyber-neon 3D strip LUT grade
 *   - `deckSpec`: wet dark-glass Acrylic runway with embedded 3-lane 132 BPM LED equalizer bars & z=0 judgement bar
 *   - `gapSpec`: interior-mapped parallax 4.2 m laser-abyss chasm inside each gap opening
 *   - `ringSpec`: feathered dual-crest harmonic shockwave rings
 *   - `flipbookBurstSpec`: 8x4 procedural sprite-sheet flipbook bursts (`createFlipbookAtlas("ripple" | "sparks")`)
 *   - `glowSpec`: smooth multi-segment volumetric concert laser cones & drifting stage motes
 *   - `stageLitSpec`, `floorSpec`, `ridgeSpec`, `heroSpec`: lit skyline towers, mirrored neon grid floor, ridges, hero
 */
import type { CustomSpec, Rgb } from "../../../examples/shared/runner-kit/index";
import { createGradingLut, type FlipbookAtlasSpec } from "../../showcase-port-shared/vfx-pack";
import {
  DECK_FRAGMENT_WGSL, FLIPBOOK_FRAGMENT_WGSL, FLOOR_FRAGMENT_WGSL, GAP_FRAGMENT_WGSL, GLOW_FRAGMENT_WGSL, GLOW_VERTEX_WGSL,
  HERO_FRAGMENT_WGSL, LIT_FRAGMENT_WGSL, LIT_VERTEX_WGSL, RIDGE_FRAGMENT_WGSL, RING_FRAGMENT_WGSL,
  SKY_FRAGMENT_WGSL, TONELESS_LIT_VERTEX_WGSL, WORLD_VERTEX_WGSL
} from "./stage-shaders-wgsl";

let cachedCyberLut: ReturnType<typeof createGradingLut> | null = null;
export function cyberNeonLut() {
  cachedCyberLut ??= createGradingLut("cyber-neon");
  return cachedCyberLut;
}

/** Shared haze: crisp clear sightline inside 74 m (`near >= 70`), deep synthwave dark-indigo falloff across 74..280 m. */
const HAZE = /* glsl */ `
vec3 haze(vec3 c, vec3 w) {
  vec3 d = w - cameraPosition;
  float dist = length(d);
  float span = max(dist - 74.0, 0.0);
  float f = 1.0 - exp(-pow(span * uFogDensity, 1.45));
  float up = clamp(normalize(d).y * 2.2, 0.0, 1.0);
  vec3 fogC = mix(uFogColor, uFogColor * 0.36, up);
  return mix(c, fogC, clamp(f, 0.0, 0.82));
}`;

const HASH = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`;

const SRGB_TO_LIN = /* glsl */ `
vec3 srgbToLin(vec3 c) {
  return mix(c / 12.92, pow(max((c + 0.055) / 1.055, vec3(0.0)), vec3(2.4)), step(vec3(0.04045), c));
}`;

/** HDR-preserving 16x16x16 horizontal strip LUT (`createGradingLut("cyber-neon")`). */
const CYBER_LUT_GLSL = /* glsl */ `
vec3 gradeCyber(vec3 c, float amount) {
  float peak = max(1.0, max(c.r, max(c.g, c.b)));
  vec3 normLin = clamp(c / peak, vec3(0.0), vec3(1.0));
  vec3 s = pow(normLin, vec3(1.0 / 2.2));
  float bSlice = s.b * 15.0;
  float b0 = floor(bSlice);
  float b1 = min(15.0, b0 + 1.0);
  float bf = bSlice - b0;
  float rx = s.r * 15.0 + 0.5;
  float gy = (s.g * 15.0 + 0.5) / 16.0;
  vec2 uv0 = vec2((b0 * 16.0 + rx) / 256.0, gy);
  vec2 uv1 = vec2((b1 * 16.0 + rx) / 256.0, gy);
  vec3 g0 = texture(gradeLut, uv0).rgb;
  vec3 g1 = texture(gradeLut, uv1).rgb;
  vec3 graded = pow(max(mix(g0, g1, bf), vec3(0.0)), vec3(2.2)) * peak;
  return mix(c, graded, amount);
}`;

const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Sun centre direction (slightly above the horizon, dead ahead down the track). */
export const SUN_DIR: Rgb = (() => {
  const v = [0, 0.16, -1];
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l];
})();

const SKY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${HASH}
${CYBER_LUT_GLSL}
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float y = dir.y;
  float az = atan(dir.x, -dir.z);
  vec3 zenith = vec3(0.0020, 0.0012, 0.0095);
  vec3 high = vec3(0.0085, 0.0032, 0.0340);
  vec3 mid = vec3(0.0480, 0.0095, 0.1150);
  vec3 low = vec3(0.2900, 0.0280, 0.2300);
  vec3 hor = vec3(0.8600, 0.1050, 0.3400);
  vec3 c = zenith;
  c = mix(high, c, smoothstep(0.18, 0.75, y));
  c = mix(mid, c, smoothstep(0.06, 0.30, y));
  c = mix(low, c, smoothstep(0.012, 0.11, y));
  c = mix(hor, c, smoothstep(-0.004, 0.035, y));
  if (y < -0.004) c = mix(hor, vec3(0.055, 0.009, 0.07), smoothstep(-0.004, -0.12, y));
  /* nebula ribbons */
  float neb = sin(az * 2.3 + sin(az * 5.1 + 1.3) * 0.8 + y * 6.0) * 0.5 + 0.5;
  neb *= smoothstep(0.08, 0.3, y) * (1.0 - smoothstep(0.45, 0.85, y));
  neb *= 0.55 + 0.45 * sin(az * 9.0 - y * 14.0 + 0.7);
  c += vec3(0.06, 0.014, 0.11) * neb + vec3(0.0, 0.038, 0.065) * neb * neb;
  /* stars: one candidate per cell, twinkling on the presentation clock */
  vec2 g = vec2(az * 70.0, y * 70.0);
  vec2 id = floor(g);
  float h = hash12(id);
  if (h > 0.93 && y > 0.04) {
    vec2 f = fract(g) - 0.5 - (vec2(hash12(id + 7.1), hash12(id + 3.7)) - 0.5) * 0.6;
    float s = smoothstep(0.16, 0.0, length(f));
    float tw = 0.6 + 0.4 * sin(uClock * (1.5 + h * 4.0) + h * 60.0);
    c += vec3(0.82, 0.78, 1.1) * s * tw * smoothstep(0.04, 0.2, y) * (h - 0.93) * 15.0;
  }
  /* synthwave sun: banded lower half, HDR gold-to-magenta for AgX + bloom */
  vec3 sd = uSunDir;
  float sx = atan(dir.x, -dir.z) - atan(sd.x, -sd.z);
  float sy = asin(clamp(y, -1.0, 1.0)) - asin(sd.y);
  vec2 sp = vec2(sx, sy);
  float R = 0.19;
  float r = length(sp);
  float disc = 1.0 - smoothstep(R - 0.003, R, r);
  float band = 1.0;
  if (sy < 0.09) {
    float k = clamp((0.09 - sy) / (R + 0.09), 0.0, 1.0);
    float stripe = fract(sy * 30.0 + uClock * 0.3);
    band = step(0.08 + k * 0.55, stripe);
  }
  vec3 top = vec3(1.35, 0.72, 0.14);
  vec3 midS = vec3(1.30, 0.30, 0.38);
  vec3 bottom = vec3(1.20, 0.06, 0.58);
  float sv = smoothstep(-R, R, sy);
  vec3 sun = mix(bottom, midS, smoothstep(0.0, 0.5, sv));
  sun = mix(sun, top, smoothstep(0.45, 1.0, sv)) * (1.0 + 0.24 * uPulse);
  float corona = exp(-max(r - R, 0.0) * 9.0) * 0.52 + exp(-max(r - R, 0.0) * 2.6) * 0.20;
  c += vec3(1.15, 0.26, 0.65) * corona * smoothstep(-0.05, 0.02, y + 0.03);
  c = mix(c, sun, disc * band);
  /* horizon light line */
  c += vec3(1.15, 0.38, 0.68) * exp(-abs(y) * 120.0) * 0.42;
  c = gradeCyber(c, 0.38);
  outColor = vec4(c, 1.0);
}`;

/** Lit vertex with per-vertex tone and the batch-local position (stable under the scrolling node). */
const LIT_VERTEX = /* glsl */ `
in vec3 tone;
out vec3 vNormal;
out vec3 vWorld;
out vec3 vLocal;
out vec2 vUv;
out vec3 vTone;
void main() {
  vUv = uv;
  vTone = tone;
  vLocal = position;
  vec3 p = position;
  p.z += uScrollZ;
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`;

/**
 * Night toon/stage lighting: moon key + violet hemisphere, hot-magenta rim from the sun ahead, plus optional lit
 * windows (towers), neon roof trims, glowing grid on up-facing tops (islands) and LED meter segments (equalizer).
 */
const LIT_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
in vec3 vTone;
out vec4 outColor;
${HASH}
${HAZE}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 base = baseColor * mix(vec3(1.0), vTone, uToneBase);
  if (uTiles > 0.5) base *= mix(uTileA, uTileB, step(1.0, mod(floor((vWorld.z - uTileShift) * 0.5), 2.0)));
  vec3 L = normalize(vec3(-0.45, 0.8, 0.4));
  float d = dot(N, L) * 0.5 + 0.5;
  float fw = fwidth(d) * 0.5;
  float key = mix(0.45, 1.0, smoothstep(0.62 - fw, 0.62 + fw, d));
  vec3 hemi = mix(vec3(0.16, 0.05, 0.22), vec3(0.34, 0.32, 0.58), 0.5 * N.y + 0.5);
  vec3 lit = base * (hemi + vec3(0.58, 0.66, 0.98) * key * 0.58);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * max(0.25, -N.z * 0.5 + 0.5);
  lit += uRim * rim * (0.65 + 0.45 * uPulse);
  vec3 glow = emissive;
  float side = 1.0 - step(0.5, abs(N.y));
  if (uWindows > 0.5) {
    float hz = abs(N.x) > 0.5 ? vLocal.z : vLocal.x;
    vec2 g = vec2(hz * 0.85, vLocal.y * 0.62);
    vec2 id = floor(g);
    vec2 f = fract(g);
    float pane = step(0.2, f.x) * step(f.x, 0.75) * step(0.24, f.y) * step(f.y, 0.72);
    float h = hash12(id + floor(vTone.xy * 113.0) + vec2(N.x * 17.0, N.z * 29.0));
    float on = step(0.58, h) * (0.85 + 0.15 * sin(uClock * 3.0 + h * 40.0));
    vec3 warm = vec3(1.15, 0.68, 0.30);
    vec3 winC = mix(warm, vTone * 1.55, step(0.80, h));
    glow += winC * pane * on * side * 0.82;
    lit *= 1.0 - pane * side * 0.35;
  }
  if (uTrim > 0.5) {
    float t = smoothstep(0.970, 0.99, vUv.y) * step(abs(N.y), 0.92);
    glow += vTone * t * (1.25 + 0.7 * uPulse);
  }
  if (uTopGrid > 0.5) {
    float top = smoothstep(0.6, 0.9, N.y);
    vec2 g = vLocal.xz * 0.9;
    vec2 gw = fwidth(g);
    vec2 gl = abs(fract(g - 0.5) - 0.5) / max(gw, vec2(1e-4));
    float line = 1.0 - min(min(gl.x, gl.y), 1.0);
    glow += vTone * line * top * (0.68 + 0.55 * uPulse);
    float under = smoothstep(-0.2, -0.9, N.y);
    glow += vTone * 0.12 * under;
  }
  if (uMeter > 0.5) {
    float seg = fract(vWorld.y * 1.45);
    float on = smoothstep(0.15, 0.22, seg) * (1.0 - smoothstep(0.89, 0.96, seg));
    vec3 low = vec3(0.02, 0.68, 1.15);
    vec3 midC = vec3(1.15, 0.05, 0.52);
    vec3 hiC = vec3(1.25, 0.72, 0.10);
    float yy = vWorld.y;
    vec3 col = mix(low, midC, smoothstep(-2.0, 5.0, yy));
    col = mix(col, hiC, smoothstep(7.0, 11.0, yy));
    float faceLit = side * on;
    glow += col * faceLit * (0.36 + 0.62 * uPulse) * smoothstep(-7.0, -3.0, yy);
    glow += col * step(0.5, N.y) * (0.8 + 0.6 * uPulse);
    lit *= 1.0 - faceLit * 0.6;
  }
  vec3 c = lit + glow;
  outColor = vec4(haze(c, vWorld), alpha);
}`;

/** Wet dark-glass Acrylic runway with embedded 3-lane 132 BPM LED equalizer spectrum & z=0 judgement bar. */
const DECK_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
in vec3 vTone;
out vec4 outColor;
${HAZE}
${CYBER_LUT_GLSL}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float scrollZ = vWorld.z - uTileShift;
  float tz = floor(scrollZ * 0.5);
  float parity = step(1.0, mod(tz, 2.0));
  vec3 tileBase = mix(uTileA, uTileB, parity);
  float topMask = smoothstep(0.5, 0.9, N.y);

  /* bevel seam between 2 m Acrylic glass tiles */
  float seamG = scrollZ * 0.5;
  float seamFw = max(fwidth(seamG), 1e-4);
  float seamDist = abs(fract(seamG) - 0.5) / seamFw;
  float seam = (1.0 - clamp(seamDist * 0.65, 0.0, 1.0)) * topMask;

  /* embedded 3-lane 132 BPM equalizer bars beneath the dark Acrylic glass */
  float laneCoord = vWorld.x / 2.0;
  float laneIdx = clamp(round(laneCoord), -1.0, 1.0);
  float laneLocalX = abs(vWorld.x - laneIdx * 2.0);
  float inLaneWell = smoothstep(0.84, 0.72, laneLocalX) * step(abs(vWorld.x), 3.05) * topMask;
  float eqSeg = fract(scrollZ * 1.25);
  float eqCell = smoothstep(0.14, 0.22, eqSeg) * (1.0 - smoothstep(0.82, 0.90, eqSeg));
  float eqWave = 0.5 + 0.5 * sin(scrollZ * 0.22 + uBeatPhase * 3.14159265 + laneIdx * 1.65);
  float eqAmp = clamp(0.28 + 0.52 * eqWave + 0.38 * uPulse, 0.0, 1.25);
  float eqWidth = smoothstep(0.72 * eqAmp, 0.56 * eqAmp, laneLocalX);
  vec3 eqColor = mix(vec3(0.04, 0.72, 1.10), vec3(1.10, 0.08, 0.58), clamp(laneLocalX / 0.75, 0.0, 1.0));
  vec3 subGlassEq = eqColor * inLaneWell * eqCell * eqWidth * (0.20 + 0.34 * uPulse);

  /* z = 0 quarter-note beat-judgement threshold bar */
  float hitLine = exp(-pow(vWorld.z / 0.20, 2.0)) * topMask;
  float hitHalo = exp(-pow(vWorld.z / 0.85, 2.0)) * topMask;
  vec3 hitCol = mix(vec3(0.12, 0.88, 1.25), vec3(1.35, 0.82, 0.22), 0.35 + 0.65 * uPulse);
  float railReflect = exp(-abs(abs(vWorld.x) - 3.15) * 3.4) * topMask;

  /* glossy Acrylic Fresnel + sunset horizon sheen */
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  float centerSheen = exp(-pow(vWorld.x / 2.6, 2.0)) * smoothstep(6.0, -90.0, vWorld.z) * topMask;
  vec3 c = tileBase * (0.72 + 0.28 * N.y);
  c += vec3(0.08, 0.22, 0.42) * seam * (0.35 + 0.45 * uPulse);
  c += subGlassEq;
  c += vec3(0.95, 0.14, 0.55) * railReflect * (0.24 + 0.28 * uPulse);
  c += vec3(0.75, 0.18, 0.48) * centerSheen * 0.22;
  c += vec3(0.24, 0.52, 0.95) * fres * 0.34;
  c += hitCol * (hitLine * (0.85 + 0.75 * uPulse) + hitHalo * (0.14 + 0.22 * uPulse));
  c += emissive + vLocal * 0.0 + vec3(vUv, 0.0) * 0.0 + vTone * 0.0;
  c = gradeCyber(c, 0.30);
  outColor = vec4(haze(c, vWorld), 1.0);
}`;

/** Interior-mapped parallax laser-abyss chasm (`gaps` batch). */
const GAP_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
in vec3 vTone;
out vec4 outColor;
${HAZE}
void main() {
  vec2 uv = clamp(vUv, vec2(0.001), vec2(0.999));
  float borderX = min(uv.x, 1.0 - uv.x);
  float borderZ = min(uv.y, 1.0 - uv.y);
  float border = min(borderX * 2.0, borderZ * 1.5);
  float rimFrame = 1.0 - smoothstep(0.055, 0.11, border);

  vec3 ray = normalize(vWorld - cameraPosition);
  vec2 halfSize = vec2(0.92, 0.68);
  vec2 localXZ = (uv - vec2(0.5)) * 2.0 * halfSize;
  vec2 dirXZ = vec2(ray.x, -ray.z);
  vec2 safeDir = mix(dirXZ, vec2(1e-4), lessThan(abs(dirXZ), vec2(1e-4)));
  vec2 tWall2 = (sign(safeDir) * halfSize - localXZ) / safeDir;
  float tWall = min(max(tWall2.x, 0.0), max(tWall2.y, 0.0));
  float depthY = 4.2;
  float tFloor = depthY / max(-ray.y, 0.08);
  float hitFloor = step(tFloor, tWall);
  float tHit = min(tFloor, tWall);
  float hitY = clamp(-ray.y * tHit, 0.0, depthY);
  vec2 hitXZ = localXZ + dirXZ * tHit;

  float laserCoord = hitY * 2.4 - uClock * 1.6;
  float laserBand = exp(-pow((fract(laserCoord) - 0.5) / 0.12, 2.0));
  vec3 wallCol = mix(vec3(0.95, 0.06, 0.42), vec3(0.10, 0.72, 1.15), clamp(hitY / depthY, 0.0, 1.0));
  float depthAtten = exp(-hitY * 0.42);
  vec3 wallGlow = (vec3(0.02, 0.006, 0.045) + wallCol * laserBand * (0.62 + 0.48 * uPulse)) * depthAtten;

  vec2 fg = hitXZ * 3.0;
  vec2 fgl = abs(fract(fg - vec2(0.5)) - vec2(0.5));
  float fline = 1.0 - smoothstep(0.03, 0.11, min(fgl.x, fgl.y));
  vec3 floorGlow = vec3(0.008, 0.002, 0.02) + vec3(0.55, 0.08, 0.85) * fline * (0.45 + 0.4 * uPulse);

  vec3 interior = mix(wallGlow, floorGlow, hitFloor);
  float lipShadow = smoothstep(0.08, 0.24, border);
  interior *= 0.45 + 0.55 * lipShadow;
  vec3 hazardRim = mix(vec3(0.95, 0.10, 0.45), vec3(1.25, 0.38, 0.85), uPulse) * (0.75 + 0.55 * uPulse);
  vec3 c = mix(interior, hazardRim, rimFrame) + (vNormal + vLocal + vTone) * 0.0;
  outColor = vec4(haze(c, vWorld), 1.0);
}`;

const FLOOR_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Neon grid floor far below the track: scrolls with the run distance, sun reflection streak, beat brightening. */
const FLOOR_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${HAZE}
void main() {
  vec2 g = vec2(vWorld.x, vWorld.z - uScroll) / 5.0;
  vec2 fw = fwidth(g);
  vec2 gl = abs(fract(g - 0.5) - 0.5) / max(fw * 1.2, vec2(1e-4));
  float line = 1.0 - min(min(gl.x, gl.y), 1.0);
  line *= clamp(1.4 - max(fw.x, fw.y) * 2.2, 0.0, 1.0);
  vec2 g2 = vec2(vWorld.x, vWorld.z - uScroll) / 25.0;
  vec2 fw2 = fwidth(g2);
  vec2 gl2 = abs(fract(g2 - 0.5) - 0.5) / max(fw2 * 1.6, vec2(1e-4));
  float major = 1.0 - min(min(gl2.x, gl2.y), 1.0);
  vec3 base = vec3(0.010, 0.003, 0.028);
  float nearTrack = exp(-abs(vWorld.x) * 0.06);
  vec3 lineC = mix(vec3(0.92, 0.07, 0.58), vec3(0.08, 0.68, 1.08), nearTrack * 0.65);
  vec3 c = base + lineC * line * (0.42 + 0.45 * uPulse) + lineC * major * 0.55;
  float refl = exp(-pow(vWorld.x / 24.0, 2.0)) * smoothstep(-24.0, -220.0, vWorld.z);
  c += vec3(1.15, 0.28, 0.52) * refl * (0.24 + 0.10 * uPulse);
  outColor = vec4(haze(c, vWorld), 1.0);
}`;

/** Far mountain ridges: dark violet bodies with a glowing ridge line and faint wireframe facets. */
const RIDGE_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
in vec3 vTone;
out vec4 outColor;
${HAZE}
void main() {
  float v = vUv.y;
  vec3 body = mix(vec3(0.012, 0.004, 0.035), vec3(0.065, 0.014, 0.12), v);
  float ridge = smoothstep(0.93, 1.0, v);
  vec2 g = vec2(vUv.x * 160.0, v * 7.0);
  vec2 fw = fwidth(g);
  vec2 gl = abs(fract(g - 0.5) - 0.5) / max(fw, vec2(1e-4));
  float wire = (1.0 - min(min(gl.x, gl.y), 1.0)) * 0.26 * v;
  vec3 c = body + vTone * (ridge * 1.2 + wire);
  outColor = vec4(haze(c, vWorld), 1.0);
}`;

/** Additive glow: volumetric searchlight beams (smooth Fresnel + axial haze falloff) and drifting motes. */
const GLOW_VERTEX = /* glsl */ `
in vec3 tone;
out vec3 vTone;
out vec2 vUv;
out vec3 vWorld;
out vec3 vNormal;
void main() {
  vTone = tone;
  vUv = uv;
  vec3 p = position;
  p.y += sin(uClock * 0.9 + tone.g * 37.0 + position.x * 0.3) * uWobble;
  p.x += cos(uClock * 0.7 + tone.b * 23.0) * uWobble * 0.6;
  p.z += uScrollZ;
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`;

const GLOW_FRAGMENT = /* glsl */ `
in vec3 vTone;
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
out vec4 outColor;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(normalize(vNormal), V));
  float dust = 0.84 + 0.16 * sin(vUv.y * 18.0 - uClock * 2.2 + vWorld.x * 0.22);
  float beamEdge = pow(ndv, 2.15) * smoothstep(0.0, 0.05, vUv.y);
  float beamAlong = pow(max(1.0 - vUv.y, 0.0), 1.85) * dust;
  float edge = uBeam > 0.5 ? beamEdge : 1.0;
  float along = uBeam > 0.5 ? beamAlong : 1.0;
  float dist = length(vWorld - cameraPosition);
  float fade = uBeam > 0.5 ? 1.0 : smoothstep(145.0, 28.0, dist);
  vec3 c = baseColor * vTone * edge * along * fade * (0.82 + 0.46 * uPulse);
  outColor = vec4(c, 1.0);
}`;

const RING_FRAGMENT = /* glsl */ `
in vec3 vTone;
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
out vec4 outColor;
void main() {
  float r = vUv.y;
  float outerWave = exp(-pow((r - 0.72) / 0.14, 2.0));
  float innerWave = exp(-pow((r - 0.30) / 0.12, 2.0)) * 0.68;
  float shimmer = 0.88 + 0.12 * cos(vUv.x * 37.69911 + uClock * 9.0);
  float profile = (outerWave + innerWave) * smoothstep(0.0, 0.08, r) * (1.0 - smoothstep(0.90, 1.0, r));
  vec3 c = baseColor * vTone * profile * shimmer + (vWorld + vNormal) * 0.0;
  outColor = vec4(c, 1.0);
}`;

const FLIPBOOK_FRAGMENT = /* glsl */ `
in vec3 vTone;
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
out vec4 outColor;
${SRGB_TO_LIN}
void main() {
  float peak = max(vTone.r, max(vTone.g, vTone.b));
  float ageNorm = clamp(1.0 - peak, 0.0, 0.999);
  float fi = clamp(floor(ageNorm * 31.0), 0.0, 31.0);
  float col = mod(fi, 8.0);
  float row = floor(fi / 8.0);
  vec2 cellUv = (vec2(col, row) + clamp(vUv, vec2(0.02), vec2(0.98))) / vec2(8.0, 4.0);
  vec4 tex = texture(sheet, cellUv);
  vec3 tint = vTone / max(peak, 1e-4);
  float env = smoothstep(0.0, 0.07, peak);
  vec3 rgb = srgbToLin(tex.rgb) * tint * tex.a * env * uGain + (vWorld + vNormal) * 0.0;
  outColor = vec4(rgb, 1.0);
}`;

/** The hopper shader (kept in allProgramSpecs for GLSL/WGSL parity & accent trim). */
const HERO_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
in vec3 vTone;
out vec4 outColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(vec3(-0.45, 0.8, 0.4));
  float d = dot(N, L) * 0.5 + 0.5;
  float fw = fwidth(d) * 0.5;
  float key = mix(0.55, 1.0, smoothstep(0.6 - fw, 0.6 + fw, d));
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
  vec3 c = baseColor * key * 0.72 + emissive + vec3(0.88, 0.96, 1.05) * fres * 0.58;
  c += vec3(1.05, 0.26, 0.62) * pow(max(-N.z, 0.0), 3.0) * fres * 0.52;
  outColor = vec4(c, alpha);
}`;

const color3 = (value: Rgb) => ({ type: "color3" as const, value: [...value] });
const f32 = (value: number) => ({ type: "f32" as const, value });

export interface Haze { readonly color: Rgb; readonly density: number }

const hazeUniforms = (h: Haze) => ({ uFogColor: color3(h.color), uFogDensity: f32(h.density) });

export const stageSkySpec = (): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  wgsl: { vertex: WORLD_VERTEX_WGSL, fragment: SKY_FRAGMENT_WGSL },
  uniforms: {
    uClock: f32(0),
    uPulse: f32(0),
    uSunDir: color3(SUN_DIR),
    gradeLut: { type: "texture2d", value: cyberNeonLut().texture }
  },
  side: "double",
  depthWrite: false,
  castShadow: false
});

export interface LitOptions {
  readonly base: Rgb;
  readonly haze: Haze;
  readonly rim?: Rgb;
  readonly emissive?: Rgb;
  /** 1: multiply the base by the per-vertex tone; 0: tone is an accent colour only. */
  readonly toneBase?: number;
  readonly windows?: boolean;
  readonly trim?: boolean;
  readonly topGrid?: boolean;
  readonly meter?: boolean;
  /** Alternating 2 m road tiles (colours A, B) driven by `uTileShift`. */
  readonly tiles?: readonly [Rgb, Rgb];
  /** Plain meshes without the per-vertex `tone` attribute (tone reads as white). */
  readonly toneless?: boolean;
}

const TONELESS_LIT_VERTEX = LIT_VERTEX.replace("in vec3 tone;", "").replace("vTone = tone;", "vTone = vec3(1.0);");

export const stageLitSpec = (o: LitOptions): CustomSpec => ({
  glsl: { vertex: o.toneless ? TONELESS_LIT_VERTEX : LIT_VERTEX, fragment: LIT_FRAGMENT },
  wgsl: { vertex: o.toneless ? TONELESS_LIT_VERTEX_WGSL : LIT_VERTEX_WGSL, fragment: LIT_FRAGMENT_WGSL },
  uniforms: {
    baseColor: color3(o.base),
    emissive: color3(o.emissive ?? [0, 0, 0]),
    alpha: f32(1),
    uRim: color3(o.rim ?? [0.55, 0.08, 0.35]),
    uToneBase: f32(o.toneBase ?? 0),
    uWindows: f32(o.windows ? 1 : 0),
    uTrim: f32(o.trim ? 1 : 0),
    uTopGrid: f32(o.topGrid ? 1 : 0),
    uMeter: f32(o.meter ? 1 : 0),
    uClock: f32(0),
    uPulse: f32(0),
    uScrollZ: f32(0),
    uTiles: f32(o.tiles ? 1 : 0),
    uTileA: color3(o.tiles?.[0] ?? [1, 1, 1]),
    uTileB: color3(o.tiles?.[1] ?? [1, 1, 1]),
    uTileShift: f32(0),
    ...hazeUniforms(o.haze)
  },
  side: "double",
  castShadow: false
});

export const deckRunwaySpec = (o: { readonly haze: Haze; readonly tiles: readonly [Rgb, Rgb] }): CustomSpec => ({
  glsl: { vertex: TONELESS_LIT_VERTEX, fragment: DECK_FRAGMENT },
  wgsl: { vertex: TONELESS_LIT_VERTEX_WGSL, fragment: DECK_FRAGMENT_WGSL },
  uniforms: {
    emissive: color3([0, 0, 0]),
    uTileA: color3(o.tiles[0]),
    uTileB: color3(o.tiles[1]),
    uTileShift: f32(0),
    uBeatPhase: f32(0),
    uPulse: f32(0),
    uScrollZ: f32(0),
    gradeLut: { type: "texture2d", value: cyberNeonLut().texture },
    ...hazeUniforms(o.haze)
  },
  side: "double",
  castShadow: false
});

export const gapChasmSpec = (haze: Haze): CustomSpec => ({
  glsl: { vertex: TONELESS_LIT_VERTEX, fragment: GAP_FRAGMENT },
  wgsl: { vertex: TONELESS_LIT_VERTEX_WGSL, fragment: GAP_FRAGMENT_WGSL },
  uniforms: {
    uClock: f32(0),
    uPulse: f32(0),
    uScrollZ: f32(0),
    ...hazeUniforms(haze)
  },
  side: "double",
  castShadow: false
});

export const floorSpec = (haze: Haze): CustomSpec => ({
  glsl: { vertex: FLOOR_VERTEX, fragment: FLOOR_FRAGMENT },
  wgsl: { vertex: WORLD_VERTEX_WGSL, fragment: FLOOR_FRAGMENT_WGSL },
  uniforms: { uScroll: f32(0), uPulse: f32(0), ...hazeUniforms(haze) },
  side: "double",
  castShadow: false
});

export const ridgeSpec = (haze: Haze): CustomSpec => ({
  glsl: { vertex: LIT_VERTEX, fragment: RIDGE_FRAGMENT },
  wgsl: { vertex: LIT_VERTEX_WGSL, fragment: RIDGE_FRAGMENT_WGSL },
  uniforms: { ...hazeUniforms(haze), uScrollZ: f32(0) },
  side: "double",
  castShadow: false
});

export const glowSpec = (o: { readonly beam: boolean; readonly wobble: number; readonly gain: Rgb }): CustomSpec => ({
  glsl: { vertex: GLOW_VERTEX, fragment: GLOW_FRAGMENT },
  wgsl: { vertex: GLOW_VERTEX_WGSL, fragment: GLOW_FRAGMENT_WGSL },
  uniforms: { baseColor: color3(o.gain), uBeam: f32(o.beam ? 1 : 0), uWobble: f32(o.wobble), uClock: f32(0), uPulse: f32(0), uScrollZ: f32(0) },
  blending: "additive",
  transparent: true,
  castShadow: false,
  depthWrite: false,
  side: "double"
});

export const ringShockwaveSpec = (gain: Rgb = [1.4, 1.4, 1.4]): CustomSpec => ({
  glsl: { vertex: GLOW_VERTEX, fragment: RING_FRAGMENT },
  wgsl: { vertex: GLOW_VERTEX_WGSL, fragment: RING_FRAGMENT_WGSL },
  uniforms: { baseColor: color3(gain), uWobble: f32(0), uClock: f32(0), uScrollZ: f32(0) },
  blending: "additive",
  transparent: true,
  castShadow: false,
  depthWrite: false,
  side: "double"
});

export const flipbookBurstSpec = (atlas: FlipbookAtlasSpec, gain = 1.6): CustomSpec => ({
  glsl: { vertex: GLOW_VERTEX, fragment: FLIPBOOK_FRAGMENT },
  wgsl: { vertex: GLOW_VERTEX_WGSL, fragment: FLIPBOOK_FRAGMENT_WGSL },
  uniforms: {
    sheet: { type: "texture2d", value: atlas.texture },
    uGain: f32(gain),
    uWobble: f32(0),
    uClock: f32(0),
    uScrollZ: f32(0)
  },
  blending: "additive",
  transparent: true,
  castShadow: false,
  depthWrite: false,
  side: "double"
});

export const heroSpec = (base: Rgb): CustomSpec => ({
  glsl: { vertex: TONELESS_LIT_VERTEX, fragment: HERO_FRAGMENT },
  wgsl: { vertex: TONELESS_LIT_VERTEX_WGSL, fragment: HERO_FRAGMENT_WGSL },
  uniforms: { baseColor: color3(base), emissive: color3([0, 0, 0]), alpha: f32(1), uScrollZ: f32(0) },
  side: "double"
});
