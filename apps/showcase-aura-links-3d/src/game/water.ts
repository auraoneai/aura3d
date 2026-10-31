/**
 * GU47 LINKS-17: still ponds and the floodlit harbour as planar-reflecting water, Cinder Rim's lava as a scrolling
 * emissive custom material. Pure data (no engine calls), so unit tests read both.
 *
 * Ponds are round and `surfaces.mirror` is a square plane whose corners would show over the falling terrain around most
 * ponds (checked: the terrain mesh drops under a square's corners on all 22 water holes), so the mirror is E-G's
 * `world.water` lake: a circle at the pond's water level with calm detail normals and a planar reflection on the High
 * and Ultra tiers (IBL below), refraction off. `A3D_QR_WORLD_WATER` is default-on, so no flag change. At most two
 * reflecting ponds per hole (the largest), GU47 High tier only; the other ponds, Low and `?look=original` keep the 4.6.2
 * water cylinder.
 */
import { pondGeometry } from "./courses";
import type { CourseTheme, HoleSpec, HoleTerrain } from "./types";

export const MAX_MIRRORS = 2;

export interface ReflectivePond {
  readonly index: number;
  readonly center: readonly [number, number];
  readonly radius: number;
  readonly y: number;
}

/** Courses whose hazards are water (Cinder Rim's are lava; Mare has none). */
export function hasMirrorWater(theme: CourseTheme): boolean {
  return theme !== "volcanic" && theme !== "lunar";
}

/** The ponds of a hole that reflect: the largest first, at most two, returned in hole order. */
export function reflectivePonds(terrain: HoleTerrain, hole: HoleSpec, theme: CourseTheme, opts: { readonly tier: "high" | "low"; readonly look: "gu47" | "original" }): readonly ReflectivePond[] {
  if (opts.look === "original" || opts.tier !== "high" || !hasMirrorWater(theme)) return [];
  return hole.layout.water
    .map((w, index) => ({ w, index }))
    .sort((a, b) => b.w.radius - a.w.radius || a.index - b.index)
    .slice(0, MAX_MIRRORS)
    .map(({ w, index }) => {
      const g = pondGeometry(terrain, w);
      return { index, center: [w.center[0], w.center[1]] as const, radius: g.pondDiameter / 2, y: g.surfaceY + 0.03 };
    })
    .sort((a, b) => a.index - b.index);
}

function liftHex(hex: string, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const ch = (c: number) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** Shallow colour: the course water lifted 35% toward white; deep: 45% toward black. */
export function pondColors(water: string): { readonly shallowColor: string; readonly deepColor: string } {
  return { shallowColor: liftHex(water, 0.35), deepColor: liftHex(water, -0.45) };
}

/**
 * GU47 phase 3: a still pond's own ripple set, about 2 cm high (amplitude = steepness x wavelength / 2pi). The engine's
 * "calm" preset is sea swell for a pond (about 0.4 m summed): its troughs fell below the pond floor and the bank, which
 * showed through as pale wavy bands (run g10p3-r5-2).
 */
export const POND_RIPPLES = [
  { directionDeg: 20, wavelength: 3.2, steepness: 0.035, speed: 0.6 },
  { directionDeg: 115, wavelength: 1.7, steepness: 0.03, speed: 0.6 }
] as const;

/**
 * The `world.water` options of one reflecting pond. Reduced motion (PRD §6.3): no waves and still detail normals, so
 * the surface holds still and only the reflection moves with the camera.
 */
export function pondWaterOptions(pond: ReflectivePond, water: string, reducedMotion: boolean) {
  return {
    id: `pond-water-${pond.index}`,
    kind: "lake" as const,
    shape: { kind: "circle" as const, center: pond.center, radius: pond.radius },
    height: pond.y,
    ...pondColors(water),
    waves: reducedMotion ? [] : POND_RIPPLES,
    normalScale: 0.15,
    normalSpeed: reducedMotion ? 0 : 0.6,
    // GU47 phase 3: on High the planar capture drew black speckle bands and white shore-foam rings across the pond
    // (software WebGL2, run g10p3-r3-1 swing-5); High reflects the IBL sky, Ultra keeps the planar mirror; no foam on a
    // still pond
    reflection: { low: "ibl", medium: "ibl", high: "ibl", ultra: "planar" } as const,
    foam: { shoreDepth: 0, crest: 0 },
    refraction: { low: false, medium: false, high: false, ultra: false } as const
  };
}

/* ---------- lava (Cinder Rim) ---------- */

/** Crust drift in m/s; reduced motion stops it (PRD §6.3). */
export const LAVA_FLOW_MPS = 0.35;

export function lavaFlow(reducedMotion: boolean): number {
  return reducedMotion ? 0 : LAVA_FLOW_MPS;
}

const LAVA_VERTEX = /* glsl */ `
out vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/**
 * Two layers of value noise in world metres, drifting against each other: dark cooling crust plates over bright
 * cracks of molten rock. Emission is linear HDR (the crack core reaches about 3x the hot colour) so bloom and the
 * tonemapper read it as the brightest thing on the course; scene fog applies (`fog: true`).
 */
const LAVA_FRAGMENT = /* glsl */ `
in vec3 vW;
out vec4 outColor;
float lavaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lavaNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = lavaHash(i), b = lavaHash(i + vec2(1.0, 0.0)), c = lavaHash(i + vec2(0.0, 1.0)), d = lavaHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
void main() {
  float t = uTime * lavaFlow;
  vec2 p = vW.xz * 0.45;
  float n1 = lavaNoise(p + vec2(t, 0.6 * t));
  float n2 = lavaNoise(p * 2.3 - vec2(0.7 * t, 1.1 * t) + 17.0);
  float n = 0.62 * n1 + 0.38 * n2;
  float crack = smoothstep(0.38, 0.5, n) * (1.0 - smoothstep(0.5, 0.64, n));
  float crust = smoothstep(0.55, 0.85, n);
  vec3 hot = lavaHot;
  vec3 col = mix(hot * 1.4, lavaCrust, crust) + hot * crack * 1.6;
  outColor = vec4(col, 1.0);
}`;

export interface LavaUniforms {
  readonly lavaHot: { readonly type: "vec3"; readonly value: readonly [number, number, number] };
  readonly lavaCrust: { readonly type: "vec3"; readonly value: readonly [number, number, number] };
  readonly lavaFlow: { readonly type: "f32"; readonly value: number };
}

/** The `material.custom` spec of Cinder Rim's lava pools (linear colours). */
export function lavaSpec(reducedMotion: boolean): { glsl: { vertex: string; fragment: string }; uniforms: LavaUniforms; fog: true; castShadow: false } {
  return {
    glsl: { vertex: LAVA_VERTEX, fragment: LAVA_FRAGMENT },
    uniforms: {
      lavaHot: { type: "vec3", value: [1.0, 0.36, 0.06] },
      lavaCrust: { type: "vec3", value: [0.09, 0.035, 0.02] },
      lavaFlow: { type: "f32", value: lavaFlow(reducedMotion) }
    },
    fog: true,
    castShadow: false
  };
}
