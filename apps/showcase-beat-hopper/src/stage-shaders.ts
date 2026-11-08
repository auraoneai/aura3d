/**
 * Beat Hopper stage programs (presentation only, game-local; the shared runner-kit shaders stay untouched).
 * Synthwave night stage: a striped sunset sun on a hot-magenta horizon, a star field and nebula, a scrolling neon
 * grid floor far below the elevated track, glowing ridge lines, lit-window towers, LED equalizer meters, neon palms,
 * floating islands, sweeping searchlights and drifting motes. Every lit program shares one distance haze that fades
 * towards the horizon colour, so the layers read as depth. Colours are linear; tone mapping stays off (main.ts) and
 * values above ~0.8 feed the bloom pass. Scrolling layers move by the `uScrollZ` uniform in the vertex stage rather than
 * a node transform: a transform change makes the runtime re-read every vertex for bounds each frame.
 */
import type { CustomSpec } from "../../../examples/shared/runner-kit/index";
import type { Rgb } from "../../../examples/shared/runner-kit/index";
import {
  FLOOR_FRAGMENT_WGSL, GLOW_FRAGMENT_WGSL, GLOW_VERTEX_WGSL, HERO_FRAGMENT_WGSL, LIT_FRAGMENT_WGSL, LIT_VERTEX_WGSL, RIDGE_FRAGMENT_WGSL,
  SKY_FRAGMENT_WGSL, TONELESS_LIT_VERTEX_WGSL, WORLD_VERTEX_WGSL
} from "./stage-shaders-wgsl";

/** Shared haze: exponential-ish by distance, colour slides from the horizon glow to a dim violet looking up. */
const HAZE = /* glsl */ `
vec3 haze(vec3 c, vec3 w) {
  vec3 d = w - cameraPosition;
  float dist = length(d);
  float f = 1.0 - exp(-pow(dist * uFogDensity, 1.6));
  float up = clamp(normalize(d).y * 2.2, 0.0, 1.0);
  vec3 fogC = mix(uFogColor, uFogColor * 0.32, up);
  return mix(c, fogC, clamp(f, 0.0, 0.97));
}`;

const HASH = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
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
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float y = dir.y;
  float az = atan(dir.x, -dir.z);
  vec3 zenith = vec3(0.0018, 0.0010, 0.0080);
  vec3 high = vec3(0.0070, 0.0026, 0.0280);
  vec3 mid = vec3(0.0420, 0.0080, 0.1000);
  vec3 low = vec3(0.2600, 0.0250, 0.2000);
  vec3 hor = vec3(0.7200, 0.0900, 0.2800);
  vec3 c = zenith;
  c = mix(high, c, smoothstep(0.18, 0.75, y));
  c = mix(mid, c, smoothstep(0.06, 0.30, y));
  c = mix(low, c, smoothstep(0.012, 0.11, y));
  c = mix(hor, c, smoothstep(-0.004, 0.035, y));
  if (y < -0.004) c = mix(hor, vec3(0.05, 0.008, 0.06), smoothstep(-0.004, -0.12, y));
  /* nebula ribbons */
  float neb = sin(az * 2.3 + sin(az * 5.1 + 1.3) * 0.8 + y * 6.0) * 0.5 + 0.5;
  neb *= smoothstep(0.08, 0.3, y) * (1.0 - smoothstep(0.45, 0.85, y));
  neb *= 0.55 + 0.45 * sin(az * 9.0 - y * 14.0 + 0.7);
  c += vec3(0.05, 0.012, 0.09) * neb + vec3(0.0, 0.03, 0.05) * neb * neb;
  /* stars: one candidate per cell, twinkling on the presentation clock */
  vec2 g = vec2(az * 70.0, y * 70.0);
  vec2 id = floor(g);
  float h = hash12(id);
  if (h > 0.93 && y > 0.04) {
    vec2 f = fract(g) - 0.5 - (vec2(hash12(id + 7.1), hash12(id + 3.7)) - 0.5) * 0.6;
    float s = smoothstep(0.16, 0.0, length(f));
    float tw = 0.6 + 0.4 * sin(uClock * (1.5 + h * 4.0) + h * 60.0);
    c += vec3(0.75, 0.7, 1.0) * s * tw * smoothstep(0.04, 0.2, y) * (h - 0.93) * 14.0;
  }
  /* synthwave sun: banded lower half, gold-to-magenta, a soft corona */
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
  vec3 top = vec3(1.0, 0.56, 0.10);
  vec3 midS = vec3(1.0, 0.25, 0.30);
  vec3 bottom = vec3(0.95, 0.04, 0.45);
  float sv = smoothstep(-R, R, sy);
  vec3 sun = mix(bottom, midS, smoothstep(0.0, 0.5, sv));
  sun = mix(sun, top, smoothstep(0.45, 1.0, sv)) * (0.95 + 0.2 * uPulse);
  float corona = exp(-max(r - R, 0.0) * 9.0) * 0.42 + exp(-max(r - R, 0.0) * 2.6) * 0.16;
  c += vec3(1.0, 0.22, 0.55) * corona * smoothstep(-0.05, 0.02, y + 0.03);
  c = mix(c, sun, disc * band);
  /* horizon light line */
  c += vec3(1.0, 0.35, 0.6) * exp(-abs(y) * 120.0) * 0.35;
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
 * Night toon lighting: dim moon key + violet hemisphere, a hot-magenta rim from the sun ahead, plus optional lit
 * windows (towers), neon roof trims, a glowing grid on up-facing tops (islands) and LED meter segments (equalizer).
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
  vec3 hemi = mix(vec3(0.16, 0.05, 0.22), vec3(0.32, 0.30, 0.55), 0.5 * N.y + 0.5);
  vec3 lit = base * (hemi + vec3(0.55, 0.62, 0.95) * key * 0.55);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * max(0.25, -N.z * 0.5 + 0.5);
  lit += uRim * rim * (0.6 + 0.4 * uPulse);
  vec3 glow = emissive;
  float side = 1.0 - step(0.5, abs(N.y));
  if (uWindows > 0.5) {
    float hz = abs(N.x) > 0.5 ? vLocal.z : vLocal.x;
    vec2 g = vec2(hz * 0.85, vLocal.y * 0.62);
    vec2 id = floor(g);
    vec2 f = fract(g);
    float pane = step(0.2, f.x) * step(f.x, 0.75) * step(0.24, f.y) * step(f.y, 0.72);
    float h = hash12(id + floor(vTone.xy * 113.0) + vec2(N.x * 17.0, N.z * 29.0));
    float on = step(0.6, h) * (0.85 + 0.15 * sin(uClock * 3.0 + h * 40.0));
    vec3 warm = vec3(1.0, 0.62, 0.28);
    vec3 winC = mix(warm, vTone * 1.4, step(0.82, h));
    glow += winC * pane * on * side * 0.75;
    lit *= 1.0 - pane * side * 0.35;
  }
  if (uTrim > 0.5) {
    float t = smoothstep(0.972, 0.99, vUv.y) * step(abs(N.y), 0.92);
    glow += vTone * t * (1.1 + 0.6 * uPulse);
  }
  if (uTopGrid > 0.5) {
    float top = smoothstep(0.6, 0.9, N.y);
    vec2 g = vLocal.xz * 0.9;
    vec2 gw = fwidth(g);
    vec2 gl = abs(fract(g - 0.5) - 0.5) / max(gw, vec2(1e-4));
    float line = 1.0 - min(min(gl.x, gl.y), 1.0);
    glow += vTone * line * top * (0.6 + 0.5 * uPulse);
    float under = smoothstep(-0.2, -0.9, N.y);
    glow += vTone * 0.10 * under;
  }
  if (uMeter > 0.5) {
    float seg = fract(vWorld.y * 1.45);
    float on = smoothstep(0.16, 0.22, seg) * (1.0 - smoothstep(0.9, 0.96, seg));
    vec3 low = vec3(0.0, 0.55, 1.0);
    vec3 midC = vec3(1.0, 0.04, 0.45);
    vec3 hiC = vec3(1.0, 0.62, 0.08);
    float yy = vWorld.y;
    vec3 col = mix(low, midC, smoothstep(-2.0, 5.0, yy));
    col = mix(col, hiC, smoothstep(7.0, 11.0, yy));
    float faceLit = side * on;
    glow += col * faceLit * (0.30 + 0.55 * uPulse) * smoothstep(-7.0, -3.0, yy);
    glow += col * step(0.5, N.y) * (0.7 + 0.5 * uPulse);
    lit *= 1.0 - faceLit * 0.6;
  }
  vec3 c = lit + glow;
  outColor = vec4(haze(c, vWorld), alpha);
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
  vec3 base = vec3(0.010, 0.003, 0.026);
  float nearTrack = exp(-abs(vWorld.x) * 0.06);
  vec3 lineC = mix(vec3(0.85, 0.06, 0.55), vec3(0.08, 0.6, 1.0), nearTrack * 0.6);
  vec3 c = base + lineC * line * (0.38 + 0.4 * uPulse) + lineC * major * 0.5;
  float refl = exp(-pow(vWorld.x / 26.0, 2.0)) * smoothstep(-30.0, -220.0, vWorld.z);
  c += vec3(1.0, 0.25, 0.45) * refl * 0.22;
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
  vec3 body = mix(vec3(0.012, 0.004, 0.035), vec3(0.06, 0.012, 0.11), v);
  float ridge = smoothstep(0.93, 1.0, v);
  vec2 g = vec2(vUv.x * 160.0, v * 7.0);
  vec2 fw = fwidth(g);
  vec2 gl = abs(fract(g - 0.5) - 0.5) / max(fw, vec2(1e-4));
  float wire = (1.0 - min(min(gl.x, gl.y), 1.0)) * 0.25 * v;
  vec3 c = body + vTone * (ridge * 1.1 + wire);
  outColor = vec4(haze(c, vWorld), 1.0);
}`;

/** Additive glow: searchlight beams (fade along v and towards silhouette edges) and drifting motes. */
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
  float edge = uBeam > 0.5 ? pow(abs(dot(normalize(vNormal), V)), 1.5) : 1.0;
  float along = uBeam > 0.5 ? (1.0 - vUv.y) * (1.0 - vUv.y) : 1.0;
  float dist = length(vWorld - cameraPosition);
  float fade = uBeam > 0.5 ? 1.0 : smoothstep(140.0, 30.0, dist);
  vec3 c = baseColor * vTone * edge * along * fade * (0.8 + 0.4 * uPulse);
  outColor = vec4(c, 1.0);
}`;

/** The hopper: bright cyan core with a white fresnel rim and a beat-pulsing glow. */
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
  vec3 c = baseColor * key * 0.7 + emissive + vec3(0.85, 0.95, 1.0) * fres * 0.55;
  c += vec3(1.0, 0.25, 0.6) * pow(max(-N.z, 0.0), 3.0) * fres * 0.5;
  outColor = vec4(c, alpha);
}`;

const color3 = (value: Rgb) => ({ type: "color3" as const, value: [...value] });
const f32 = (value: number) => ({ type: "f32" as const, value });

export interface Haze { readonly color: Rgb; readonly density: number }

const hazeUniforms = (h: Haze) => ({ uFogColor: color3(h.color), uFogDensity: f32(h.density) });

export const stageSkySpec = (): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  wgsl: { vertex: WORLD_VERTEX_WGSL, fragment: SKY_FRAGMENT_WGSL },
  uniforms: { uClock: f32(0), uPulse: f32(0), uSunDir: color3(SUN_DIR) },
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

export const heroSpec = (base: Rgb): CustomSpec => ({
  glsl: { vertex: TONELESS_LIT_VERTEX, fragment: HERO_FRAGMENT },
  wgsl: { vertex: TONELESS_LIT_VERTEX_WGSL, fragment: HERO_FRAGMENT_WGSL },
  uniforms: { baseColor: color3(base), emissive: color3([0, 0, 0]), alpha: f32(1), uScrollZ: f32(0) },
  side: "double"
});
