/**
 * Thermal Drift signature effect (GU47 WP-13 HS-11): refraction heat haze.
 *
 * One before-tonemap shader pass (`effects.shaderPass`, linear HDR input) bends the image inside up to 8 projected heat
 * sources (the player's exhaust, the nearest rival exhausts, lava curtains, missiles) plus a faint shimmer of hot air
 * over the road, and runs a thermal edge ramp once the core passes 80% heat. Sources are projected every frame with the
 * presented camera (`camera.ts` `projectToScreen`) and written with `setPassUniform` (no pass rebuild).
 *
 * Tiers and accessibility (PRD §6.3, §6.4): reduced motion freezes the noise and drops the distortion, leaving a static
 * warm tint inside the sources; the Low tier runs at half strength. `?qaHaze=off` keeps the pass registered but
 * disabled for the phase-2 on/off pair.
 */
import { effects, type AuraCustomPostPass } from "@aura3d/engine";
import { projectToScreen, type CameraPose, type ScreenPoint } from "./camera";

export const HEAT_HAZE_PASS = "td-heat-haze";
export const HEAT_HAZE_MAX_SOURCES = 8;
/** Core heat (0..1) above which the edge thermal ramp starts. */
export const EDGE_RAMP_START = 0.8;

const SOURCE_UNIFORMS = Array.from({ length: HEAT_HAZE_MAX_SOURCES }, (_, i) => `u_src${i}`);

/** Fragment of the pass (u_color, v_uv and outColor come from the engine's pass wrapper). */
export const HEAT_HAZE_GLSL = `${SOURCE_UNIFORMS.map((u) => `uniform vec4 ${u};`).join("\n")}
uniform float u_time;
uniform float u_strength;
uniform float u_motion;
uniform float u_edge;
uniform float u_aspect;
uniform float u_ambient;
uniform vec3 u_tint;

float tdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tdNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tdHash(i), tdHash(i + vec2(1.0, 0.0)), u.x), mix(tdHash(i + vec2(0.0, 1.0)), tdHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Source: xy = centre in uv (origin bottom-left), z = radius in units of the frame height, w = strength (0 = off).
// Heat rises, so the mask reaches 1.6x further above the centre than below it.
float tdSource(vec4 s, vec2 uv) {
  if (s.w <= 0.0) return 0.0;
  vec2 d = uv - s.xy;
  d.x *= u_aspect;
  d.y *= d.y > 0.0 ? 0.62 : 1.0;
  return (1.0 - smoothstep(0.0, max(s.z, 1e-4), length(d))) * s.w;
}
void main() {
  vec2 uv = v_uv;
  float m = ${SOURCE_UNIFORMS.map((u) => `tdSource(${u}, uv)`).join(" + ")};
  m = clamp(m, 0.0, 1.0);
  float road = u_ambient * (1.0 - smoothstep(0.08, 0.46, uv.y)) * smoothstep(0.0, 0.06, uv.y);
  float amount = (m + road) * u_strength * u_motion;
  vec2 n = vec2(
    tdNoise(uv * vec2(42.0, 26.0) + vec2(0.0, -u_time * 2.4)),
    tdNoise(uv * vec2(33.0, 21.0) + vec2(u_time * 0.8, -u_time * 1.7) + 17.0)
  ) - 0.5;
  vec4 c = texture(u_color, uv + n * amount * 0.014);
  c.rgb = mix(c.rgb, c.rgb * u_tint, clamp(m * u_strength * 0.22, 0.0, 0.22));
  vec2 e = abs(uv - 0.5) * 2.0;
  float edge = smoothstep(0.5, 1.0, max(e.x, e.y));
  c.rgb += vec3(0.95, 0.2, 0.05) * (u_edge * edge * 0.35);
  outColor = c;
}`;

/** Linear RGB of a "#rrggbb" tint, normalised so its brightest channel is 1 (tint multiplies, never darkens much). */
export function tintVector(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const max = Math.max(...rgb, 1e-6);
  return [rgb[0]! / max, rgb[1]! / max, rgb[2]! / max];
}

export interface HeatHazeLook {
  readonly strength: number;
  readonly ambient: number;
  readonly tint: string;
}

/** The pass for a circuit (registered with `app.addPostPass`). */
export function heatHazePass(look: HeatHazeLook, enabled = true): AuraCustomPostPass {
  const uniforms: Record<string, number | readonly number[]> = {
    u_time: 0,
    u_strength: look.strength,
    u_motion: 1,
    u_edge: 0,
    u_aspect: 16 / 9,
    u_ambient: look.ambient,
    u_tint: tintVector(look.tint)
  };
  for (const u of SOURCE_UNIFORMS) uniforms[u] = [0, 0, 0, 0];
  return effects.shaderPass({ name: HEAT_HAZE_PASS, order: "before-tonemap", glsl: HEAT_HAZE_GLSL, uniforms, enabled });
}

/** Edge thermal ramp: 0 up to 80% core heat, linear to 1 at 100%. */
export function edgeRamp(heat01: number): number {
  return Math.min(1, Math.max(0, (heat01 - EDGE_RAMP_START) / (1 - EDGE_RAMP_START)));
}

export interface HazeFrameInput {
  /** Player core heat 0..1 (read-only from the sim). */
  readonly heat01: number;
  readonly reducedMotion: boolean;
  readonly lowTier: boolean;
  readonly timeSeconds: number;
  readonly aspect: number;
}

/** The scalar uniforms of one frame. Reduced motion: no distortion and frozen noise (static tint only). */
export function hazeScalars(look: HeatHazeLook, input: HazeFrameInput): { u_time: number; u_strength: number; u_motion: number; u_edge: number; u_aspect: number; u_ambient: number } {
  return {
    u_time: input.reducedMotion ? 0 : input.timeSeconds % 600,
    u_strength: look.strength * (input.lowTier ? 0.5 : 1),
    u_motion: input.reducedMotion ? 0 : 1,
    u_edge: edgeRamp(input.heat01),
    u_aspect: input.aspect,
    u_ambient: look.ambient
  };
}

/**
 * Collects up to 8 heat sources per frame as `[uvX, uvY, radius, strength]` (uv origin bottom-left; radius in frame
 * heights), reusing its arrays. Sources behind the camera or off screen are skipped; the strongest 8 win.
 */
export class HeatHazeSources {
  readonly slots: number[][] = Array.from({ length: HEAT_HAZE_MAX_SOURCES }, () => [0, 0, 0, 0]);
  private count = 0;
  private readonly screen: ScreenPoint = { x: 0, y: 0, depth: 0 };

  get size(): number { return this.count; }

  begin(): void { this.count = 0; }

  /** Project a world point with a world radius (metres) and strength (0..1). Returns true when it was kept. */
  add(pose: CameraPose, aspect: number, point: readonly [number, number, number], radiusMetres: number, strength: number): boolean {
    if (!(strength > 0)) return false;
    const s = projectToScreen(pose, aspect, point, this.screen);
    if (s.depth <= 0.5) return false;
    const radius = radiusMetres / (s.depth * 2 * Math.tan((pose.fov * Math.PI) / 360));
    if (s.x < -radius || s.x > 1 + radius || s.y < -radius || s.y > 1 + radius) return false;
    let slot = this.count < HEAT_HAZE_MAX_SOURCES ? this.count++ : -1;
    if (slot < 0) {
      // Full: replace the weakest source if this one is stronger.
      let weakest = 0;
      for (let i = 1; i < HEAT_HAZE_MAX_SOURCES; i += 1) if (this.slots[i]![3]! < this.slots[weakest]![3]!) weakest = i;
      if (this.slots[weakest]![3]! >= strength) return false;
      slot = weakest;
    }
    const out = this.slots[slot]!;
    out[0] = s.x;
    out[1] = 1 - s.y;
    out[2] = Math.min(0.5, radius);
    out[3] = Math.min(1, strength);
    return true;
  }

  /** Zero the unused slots (strength 0 switches a source off in the shader). */
  end(): void {
    for (let i = this.count; i < HEAT_HAZE_MAX_SOURCES; i += 1) {
      const out = this.slots[i]!;
      out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0;
    }
  }
}

/** E-I crop contract: `{ name, x, y, w, h }` normalised to the canvas, origin top-left. */
export interface GameQaCrop {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const qaScreen: ScreenPoint = { x: 0, y: 0, depth: 0 };

/** A square crop of `sizeMetres` around a projected world point (null when behind the camera). */
function cropAround(name: string, pose: CameraPose, aspect: number, point: readonly [number, number, number], sizeMetres: number): GameQaCrop | null {
  const s = projectToScreen(pose, aspect, point, qaScreen);
  if (s.depth <= 0.5) return null;
  const h = Math.min(0.6, sizeMetres / (s.depth * 2 * Math.tan((pose.fov * Math.PI) / 360)));
  const w = Math.min(0.6, h / Math.max(0.1, aspect));
  const x = clamp01(s.x - w / 2);
  const y = clamp01(s.y - h / 2);
  return { name, x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
}

/**
 * Crops the phase-2 acceptance reads: `exhaust` (HS-11 haze inside), `drone` (HS-01 R/B, HS-10 hue, HS-17 subject
 * height), static `top-row` (HS-03/HS-04), `road-far` (HS-05), `road-near` (HS-07), `centre` (HS-13 hot pixels) and the
 * two edge strips (HS-11 thermal ramp).
 */
export function hazeQaCrops(pose: CameraPose, aspect: number, exhaust: readonly [number, number, number], drone: readonly [number, number, number]): GameQaCrop[] {
  const out: GameQaCrop[] = [
    { name: "top-row", x: 0, y: 0, w: 1, h: 0.12 },
    { name: "road-far", x: 0.38, y: 0.42, w: 0.24, h: 0.1 },
    { name: "road-near", x: 0.3, y: 0.8, w: 0.4, h: 0.14 },
    { name: "centre", x: 0.35, y: 0.35, w: 0.3, h: 0.3 },
    { name: "edge-left", x: 0, y: 0.3, w: 0.06, h: 0.4 },
    { name: "edge-right", x: 0.94, y: 0.3, w: 0.06, h: 0.4 }
  ];
  const ex = cropAround("exhaust", pose, aspect, exhaust, 2.2);
  if (ex) out.push(ex);
  const dr = cropAround("drone", pose, aspect, drone, 4.2);
  if (dr) out.push(dr);
  return out;
}

/** Minimal app surface the controller writes through (the flattened SH-03 members). */
export interface HazeApp {
  addPostPass?(pass: AuraCustomPostPass): () => void;
  setPassUniform?(passName: string, key: string, value: number | readonly number[]): void;
}

/** Owns the registered pass: (re)registers it for a circuit and writes the per-frame uniforms. */
export class HeatHazeController {
  private release: (() => void) | undefined;
  private look: HeatHazeLook;
  readonly sources = new HeatHazeSources();

  constructor(private readonly app: HazeApp, look: HeatHazeLook, private readonly enabled = true) {
    this.look = look;
  }

  /** Register (or re-register after a scene remount) the pass for a circuit. */
  mount(look: HeatHazeLook): void {
    this.look = look;
    this.release?.();
    this.release = this.app.addPostPass?.(heatHazePass(look, this.enabled));
  }

  get mounted(): boolean { return this.release !== undefined; }

  /** Write this frame's uniforms. */
  write(input: HazeFrameInput): void {
    const set = this.app.setPassUniform;
    if (!set || !this.release) return;
    const scalars = hazeScalars(this.look, input);
    set.call(this.app, HEAT_HAZE_PASS, "u_time", scalars.u_time);
    set.call(this.app, HEAT_HAZE_PASS, "u_strength", scalars.u_strength);
    set.call(this.app, HEAT_HAZE_PASS, "u_motion", scalars.u_motion);
    set.call(this.app, HEAT_HAZE_PASS, "u_edge", scalars.u_edge);
    set.call(this.app, HEAT_HAZE_PASS, "u_aspect", scalars.u_aspect);
    for (let i = 0; i < HEAT_HAZE_MAX_SOURCES; i += 1) set.call(this.app, HEAT_HAZE_PASS, SOURCE_UNIFORMS[i]!, this.sources.slots[i]!);
  }

  dispose(): void {
    this.release?.();
    this.release = undefined;
  }
}
