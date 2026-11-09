/**
 * Splat Turf ball art: a glossy candy-paint ball, a crisp plum contact shadow and drippy paint-streak cells.
 * Presentation only: no sim state is read here, every value is a uniform or a constant.
 *
 * - `glossyBallSpec`: two-step cel diffuse under the sunset rig (same key, sky and plum ground as `hazed`), a crisp
 *   banded specular with a hot core above 1 (the bloom catches it), a pale sky-window reflection on the upper half, a warm
 *   fresnel rim, a thin plum ink line on the silhouette, faint lighter paint splotches in object space (so the roll reads)
 *   and contact darkening where it meets the road. The vertex stage squashes/stretches in world axes about the contact
 *   point (`crSquash` = sx, sy, sz, pivot drop), so the squash does not spin with the roll.
 * - `contactShadowSpec`: a dark core with a short soft penumbra, drawn over a unit quad's uv.
 * - `paintStreakFragment`: patches a toon-tone fragment so a painted cell reads as a wet paint streak with wobbly edges,
 *   bulges and droplets instead of a flat rectangle; outside the mask it fades to white, which matches the road beneath.
 */
import { TOON_TONE_VERTEX, hexToLinear, type CustomSpec, type Rgb } from "../../../../examples/shared/runner-kit/index";

/** The kit key light (every toon program in the game lights from here). */
const KEY_DIR = [6, 12, 6] as const;

export const BALL_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec3 vLocal;
void main() {
  vLocal = position;
  vec3 w = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 pivot = centre - vec3(0.0, crSquash.w, 0.0);
  vec3 s = max(crSquash.xyz, vec3(0.05));
  w = pivot + (w - pivot) * s;
  vWorld = w;
  vNormal = normalize((normalMatrix * normal) / s);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const SHOULDER = /* glsl */ `
vec3 shoulder(vec3 c) {
  const float k = 0.82;
  vec3 over = max(c - k, vec3(0.0));
  return min(c, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}`;

const BAND = /* glsl */ `
float band(float x, float e) {
  float fw = fwidth(x) * 0.75 + 1e-4;
  return smoothstep(e - fw, e + fw, x);
}`;

export const BALL_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
out vec4 outColor;
${SHOULDER}
${BAND}
float splotch(vec3 p, vec3 dir, float edge) { return band(dot(p, normalize(dir)), edge); }
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 p = normalize(vLocal);
  float s = splotch(p, vec3(0.8, 0.5, 0.3), 0.94);
  s = max(s, splotch(p, vec3(-0.6, 0.2, 0.75), 0.95));
  s = max(s, splotch(p, vec3(-0.3, -0.85, -0.4), 0.93));
  s = max(s, splotch(p, vec3(0.2, -0.3, -0.95), 0.96));
  s = max(s, splotch(p, vec3(-0.9, 0.35, -0.3), 0.96));
  s = max(s, splotch(p, vec3(0.45, 0.85, -0.3), 0.97));
  vec3 base = mix(baseColor, baseColor * 1.25 + vec3(0.08, 0.05, 0.08), 0.55 * s);
  vec3 L = normalize(crKeyDir);
  float d = dot(N, L);
  float lit = band(d, 0.3) * 0.62 + band(d, 0.72) * 0.38;
  vec3 hemi = mix(crGround, crSky, 0.5 * N.y + 0.5);
  vec3 c = base * (hemi * 0.6 + crKey * lit);
  float fres = 1.0 - max(dot(N, V), 0.0);
  c += crRim * band(fres, 0.6) * (0.35 + 0.65 * clamp(d + 0.6, 0.0, 1.0));
  vec3 R = reflect(-V, N);
  float win = band(R.y, 0.3) * (1.0 - band(fres, 0.74));
  float horizonLine = (band(R.y, -0.05) - band(R.y, 0.06)) * band(fres, 0.3);
  c = mix(c, crSkyWindow, win * crGloss.y);
  c += crRim * horizonLine * 0.5;
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float spec = band(pow(nh, crGloss.x), 0.5);
  float hot = band(pow(nh, crGloss.x * 5.0), 0.55);
  c += crKey * spec * 0.85;
  c *= 1.0 - crContact.y * (1.0 - smoothstep(0.0, crContact.x, vWorld.y));
  c = mix(c, crInk, band(fres, 0.9) * 0.85);
  outColor = vec4(shoulder(c) + crKey * hot * 0.9 + emissive, alpha);
}`;

export interface GlossyBall {
  /** Team colour (sRGB hex). */
  readonly color: string;
  /** Pale sky-window reflection colour (sRGB hex). */
  readonly skyWindow: string;
  /** Warm fresnel rim colour (sRGB hex). */
  readonly rim: string;
  /** Thin silhouette ink line (sRGB hex). */
  readonly ink: string;
}

const scale = (c: Rgb, k: number): number[] => [c[0] * k, c[1] * k, c[2] * k];

export function glossyBallSpec(look: GlossyBall): CustomSpec {
  const l = Math.hypot(...KEY_DIR);
  return {
    glsl: { vertex: BALL_VERTEX, fragment: BALL_FRAGMENT },
    uniforms: {
      baseColor: { type: "color3", value: [...hexToLinear(look.color)] },
      emissive: { type: "color3", value: [0, 0, 0] },
      alpha: { type: "f32", value: 1 },
      crKeyDir: { type: "vec3", value: KEY_DIR.map((v) => v / l) },
      crKey: { type: "color3", value: [0.72, 0.66, 0.6] },
      crSky: { type: "color3", value: [1, 0.94, 0.9] },
      crGround: { type: "color3", value: [0.3, 0.16, 0.36] },
      crRim: { type: "color3", value: scale(hexToLinear(look.rim), 0.6) },
      crSkyWindow: { type: "color3", value: [...hexToLinear(look.skyWindow)] },
      crInk: { type: "color3", value: [...hexToLinear(look.ink)] },
      /* x = shininess, y = sky-window mix */
      crGloss: { type: "vec2", value: [56, 0.5] },
      /* x = fade height (m), y = strength */
      crContact: { type: "vec2", value: [0.32, 0.4] },
      /* x, y, z = world-axis squash, w = pivot drop below the centre (radius x scale) */
      crSquash: { type: "vec4", value: [1, 1, 1, 0.45] }
    },
    side: "double"
  };
}

export const CONTACT_SHADOW_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const CONTACT_SHADOW_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float fw = fwidth(d) + 1e-3;
  float core = 1.0 - smoothstep(0.8 - fw, 0.8 + fw, d);
  float pen = (1.0 - smoothstep(0.8, 1.0, d)) * 0.35;
  outColor = vec4(baseColor, alpha * max(core, pen));
}`;

/** Tight plum contact shadow: a crisp dark core (80% of the quad radius, about the ball radius) and a short soft penumbra. */
export const contactShadowSpec = (): CustomSpec => ({
  glsl: { vertex: CONTACT_SHADOW_VERTEX, fragment: CONTACT_SHADOW_FRAGMENT },
  uniforms: { baseColor: { type: "color3", value: [0.05, 0.015, 0.07] }, alpha: { type: "f32", value: 0.9 } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

/** Toon-tone vertex plus the object-space position the streak pattern is anchored to (stable while the road scrolls). */
export const PAINT_VERTEX = TOON_TONE_VERTEX
  .replace("out vec3 vTone;", "out vec3 vTone;\nout vec3 vLocal;")
  .replace("vTone = tone;", "vTone = tone;\n  vLocal = position;");

const STREAK = /* glsl */ `
in vec3 vLocal;
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
/* Signed coverage of the paint streak in one 1 m cell: positive inside. x across the lane, z along the road. */
float streak(vec2 uv) {
  float ax = uv.x - 0.5;
  float lz = vLocal.z;
  float seed = (floor(vLocal.x) + 0.5) * 1.7 + 3.1;
  float w = 0.34 + 0.05 * sin(lz * 4.3 + seed) + 0.035 * sin(lz * 10.9 + seed * 2.3);
  float m = w - abs(ax);
  float k = floor(lz * 1.3 + seed);
  float bz = (k + 0.5 - seed) / 1.3;
  float side = h11(k) < 0.5 ? -1.0 : 1.0;
  float br = 0.1 + 0.05 * h11(k + 7.0);
  m = max(m, br - length(vec2(ax - side * 0.31, lz - bz)));
  float j = floor(lz * 2.2 + seed * 0.7);
  float dz = (j + h11(j + 3.0) - seed * 0.7) / 2.2;
  float dside = h11(j + 11.0) < 0.5 ? -1.0 : 1.0;
  float dr = 0.025 + 0.025 * h11(j + 5.0);
  float dx = dside * (0.4 + 0.03 * h11(j + 9.0));
  m = max(m, dr - length(vec2(ax - dx, lz - dz)));
  return m;
}`;

const KIT_TONE = "base *= vTone;";

/**
 * Patch a kit toon-tone fragment (before `hazed`) so painted cells read as paint streaks. White tone (an unpainted cell)
 * stays white everywhere, so it still matches the road; the streak edge gets a slightly darker lip for paint thickness.
 */
export function paintStreakFragment(fragment: string): string {
  if (!fragment.includes(KIT_TONE) || !fragment.includes("void main() {")) throw new Error("splat-turf ball: kit toon-tone fragment changed");
  return fragment
    .replace("void main() {", `${STREAK}\nvoid main() {`)
    .replace(KIT_TONE, [
      "float sm = streak(vUv);",
      "  float sfw = fwidth(sm) + 1e-4;",
      "  float smask = smoothstep(-sfw, sfw, sm);",
      "  vec3 paintTone = vTone * (0.82 + 0.18 * smoothstep(0.0, 0.05, sm));",
      "  base *= mix(vec3(1.0), paintTone, smask);"
    ].join("\n"));
}

/** Squash/stretch from the presented lateral velocity (m/s) and run speed; identity under reduced motion. */
export function ballSquash(lateralVelocity: number, speed: number, reduced: boolean): readonly [number, number, number] {
  if (reduced) return [1, 1, 1];
  const lat = Math.min(1, Math.abs(lateralVelocity) / 9);
  const run = Math.min(1, Math.max(0, (speed - 16) / 20));
  const sx = 1 + 0.12 * lat;
  const sz = 1 + 0.04 * run;
  const sy = 1 / (sx * sz);
  return [sx, sy, sz];
}
