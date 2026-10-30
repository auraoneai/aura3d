/**
 * Gridlock Courier (GU47 WP-28): the VFX preset pack and the skid-mark ring buffer.
 *
 * `registerCourierFx(app.effects)` registers the game's runtime effect kinds with `registerPreset` (E-F): tyre smoke
 * while drifting, the nitro streak, the delivery ring burst with its teal flash and camera punch (the signature
 * delivery beacon's payoff), one pickup sparkle per pickup kind and the traffic-bump puff. `SkidMarks` is a fixed
 * ring of road quads (one draw) laid behind the rear wheels while the car drifts; each quad fades over
 * `SKID_LIFE` seconds in its shader, so nothing is re-uploaded to fade them.
 *
 * Reduced motion (PRD §6.3): `fxScale(reduced)` halves particle counts and drops the camera punch; reduced flash caps
 * the delivery flash at 0.3 peak.
 */
import type { CustomSpec } from "./headlights";

/** Courier teal, reserved for the car, the drop-off beacon and the minimap (WP-28 identity). */
export const COURIER_TEAL = "#22c3c9";
export const SODIUM = "#ffb347";
export const TAIL_RED = "#ff3b3b";

type Layer = { readonly type: "emitter" | "mesh" | "ribbon" | "decal" | "light" | "camera"; readonly at?: number } & Readonly<Record<string, unknown>>;
export interface FxSpec { readonly name: string; readonly layers: readonly Layer[] }
/** The slice of `app.effects` the pack needs (structural, so the unit test can pass a recorder). */
export interface FxRegistry { registerPreset(kind: string, spec: FxSpec): void }

export const FX_KINDS = {
  tyreSmoke: "courier-tyre-smoke",
  nitro: "courier-nitro-streak",
  delivery: "courier-delivery-ring",
  deliveryCalm: "courier-delivery-ring-calm",
  missed: "courier-job-missed",
  coin: "courier-pickup-parcel",
  star: "courier-pickup-express",
  heart: "courier-pickup-care",
  bump: "courier-traffic-bump",
  speedLines: "courier-speed-lines"
} as const;

export type FxKind = (typeof FX_KINDS)[keyof typeof FX_KINDS];

/** Every preset of the pack, keyed by its registered name. */
export function courierFxPresets(): Record<FxKind, FxSpec> {
  return {
    [FX_KINDS.tyreSmoke]: {
      name: FX_KINDS.tyreSmoke,
      layers: [{ type: "emitter", preset: "dust", count: 6, speed: 1.6, life: 1.6, gravity: -0.35, drag: 1.2, size: 1.1, spread: 0.8, color: "#d9dde2", blend: "normal", maxScreen: 0.25 }]
    },
    [FX_KINDS.nitro]: {
      name: FX_KINDS.nitro,
      layers: [{ type: "emitter", preset: "streak", count: 4, speed: 9, life: 0.35, size: 0.35, color: "#9ff3f5", additive: true }]
    },
    [FX_KINDS.delivery]: {
      name: FX_KINDS.delivery,
      layers: [
        { type: "emitter", preset: "ring", count: 1, size: 9, life: 0.6, color: COURIER_TEAL, additive: true },
        { type: "emitter", preset: "spark", count: 28, speed: 7, life: 0.9, gravity: 4, size: 0.25, color: "#bff7f8", additive: true },
        { type: "light", intensity: 6, range: 22, duration: 0.3, color: COURIER_TEAL },
        { type: "camera", punch: 0.35 }
      ]
    },
    [FX_KINDS.deliveryCalm]: {
      name: FX_KINDS.deliveryCalm,
      layers: [
        { type: "emitter", preset: "ring", count: 1, size: 9, life: 0.6, color: COURIER_TEAL, additive: true },
        { type: "emitter", preset: "spark", count: 14, speed: 5, life: 0.9, gravity: 4, size: 0.25, color: "#bff7f8", additive: true },
        { type: "light", intensity: 1.6, range: 22, duration: 0.2, color: COURIER_TEAL }
      ]
    },
    [FX_KINDS.missed]: {
      name: FX_KINDS.missed,
      layers: [{ type: "emitter", preset: "dust", count: 10, speed: 2, life: 0.9, size: 0.6, color: "#8a7d78" }]
    },
    [FX_KINDS.coin]: { name: FX_KINDS.coin, layers: [{ type: "emitter", preset: "pickup-gold", count: 10, speed: 3, life: 0.6, color: "#ffc35c", additive: true }] },
    [FX_KINDS.star]: { name: FX_KINDS.star, layers: [{ type: "emitter", preset: "pickup-star", count: 14, speed: 4, life: 0.7, color: "#fff0a8", additive: true }] },
    [FX_KINDS.heart]: { name: FX_KINDS.heart, layers: [{ type: "emitter", preset: "pickup-heart", count: 10, speed: 3, life: 0.6, color: "#ff7aa0", additive: true }] },
    [FX_KINDS.speedLines]: {
      name: FX_KINDS.speedLines,
      layers: [{ type: "emitter", preset: "streak", count: 3, speed: 26, life: 0.22, size: 0.12, spread: 0.15, color: "#e8f6f7", additive: true, maxScreen: 0.12 }]
    },
    [FX_KINDS.bump]: {
      name: FX_KINDS.bump,
      layers: [
        { type: "emitter", preset: "debris", count: 6, speed: 3, life: 0.5, size: 0.12, color: "#3a3f48" },
        { type: "camera", shake: 0.25 }
      ]
    }
  };
}

/** Registers the pack (idempotent per registry: the engine replaces a preset of the same name). */
export function registerCourierFx(effects: FxRegistry | undefined | null): readonly FxKind[] {
  if (!effects) return [];
  const presets = courierFxPresets();
  for (const [kind, spec] of Object.entries(presets)) effects.registerPreset(kind, spec);
  return Object.keys(presets) as FxKind[];
}

/** Particle-count scale and camera feedback for the player's motion setting (PRD §6.3: emission halves). */
export function fxScale(reducedMotion: boolean): { count: number; camera: boolean } {
  return reducedMotion ? { count: 0.5, camera: false } : { count: 1, camera: true };
}

/** The delivery burst kind: reduced motion or reduced flash take the calm variant (flash 0.3 of peak, no punch). */
export const deliveryKind = (reducedMotion: boolean, reducedFlash: boolean): FxKind => (reducedMotion || reducedFlash ? FX_KINDS.deliveryCalm : FX_KINDS.delivery);

/** Smoke puffs per second while drifting (one puff per rear wheel per emit). */
export const SMOKE_RATE = 10;

/** GC-V1 speed lines: from this speed (m/s, about 100 km/h) or while boosting, emitted this often (s). */
export const SPEED_LINES = { minSpeed: 28, interval: 0.07, ahead: 7, ring: 2.6, y: 1.4 } as const;

/**
 * Where a batch of speed lines spawns: ahead of the car on a ring around its path, streaking back past the camera.
 * Off under reduced motion (PRD §6.3). `seed` picks the ring angle deterministically.
 */
export function speedLineSpawn(car: { x: number; z: number; heading: number; speed: number; boosting: boolean }, seed: number, reducedMotion: boolean): { at: [number, number, number]; normal: [number, number, number] } | null {
  if (reducedMotion || (Math.abs(car.speed) < SPEED_LINES.minSpeed && !car.boosting)) return null;
  const s = Math.sin(car.heading), c = Math.cos(car.heading);
  const a = (seed * 2.399963) % (Math.PI * 2);
  const lat = Math.cos(a) * SPEED_LINES.ring;
  const up = Math.max(0.3, SPEED_LINES.y + Math.sin(a) * SPEED_LINES.ring * 0.5);
  return { at: [car.x + s * SPEED_LINES.ahead + c * lat, up, car.z + c * SPEED_LINES.ahead - s * lat], normal: [-s, 0, -c] };
}

/* ------------------------------------------------------------------ skid marks */

/** Seconds a skid quad takes to fade out. */
export const SKID_LIFE = 20;
/** Quads in the ring (one draw). */
export const SKID_QUADS = 384;
/** A new quad pair is laid once the car moved this far, metres. */
export const SKID_STEP = 0.7;
const SKID_HALF_W = 0.13;
/** Rear wheel track half-width and the wheels' distance behind the car's centre, metres. */
const REAR = { halfTrack: 0.78, back: 1.35 } as const;

/**
 * Ring buffer of skid quads in world space. Each quad joins the previous and the current rear-wheel position of one
 * wheel; the second uv channel holds its birth time, which the shader fades over `SKID_LIFE`. A never-written quad
 * has birth -1e6 and is fully transparent.
 */
export class SkidMarks {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  private next = 0;
  private laid = 0;
  private last: { l: [number, number]; r: [number, number] } | null = null;
  /** Number of quads written since the last `reset` (capped by the ring size when counting live ones). */
  get written(): number { return this.laid; }

  constructor(readonly capacity = SKID_QUADS) {
    this.positions = new Float32Array(capacity * 4 * 3);
    this.normals = new Float32Array(capacity * 4 * 3);
    this.uvs = new Float32Array(capacity * 4 * 2);
    this.indices = new Uint32Array(capacity * 6);
    for (let q = 0; q < capacity; q++) {
      const v = q * 4;
      this.indices.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
      for (let k = 0; k < 4; k++) {
        this.normals[(v + k) * 3 + 1] = 1;
        this.positions[(v + k) * 3 + 1] = -50;
        this.uvs[(v + k) * 2] = k < 2 ? 0 : 1;
        this.uvs[(v + k) * 2 + 1] = -1e6;
      }
    }
  }

  reset(): void {
    this.last = null;
    this.laid = 0;
    this.next = 0;
    for (let i = 0; i < this.uvs.length; i += 2) this.uvs[i + 1] = -1e6;
  }

  /** Lift the pen (the car stopped drifting): the next `lay` starts a new mark. */
  lift(): void {
    this.last = null;
  }

  /** Lays marks behind both rear wheels; returns the number of quads written (0 or 2). */
  lay(x: number, z: number, heading: number, time: number): number {
    const s = Math.sin(heading);
    const c = Math.cos(heading);
    // car forward is (sin h, cos h); right is (cos h, -sin h)
    const wheel = (side: number): [number, number] => [x - s * REAR.back + c * REAR.halfTrack * side, z - c * REAR.back - s * REAR.halfTrack * side];
    const l = wheel(-1);
    const r = wheel(1);
    if (!this.last) {
      this.last = { l, r };
      return 0;
    }
    if (Math.hypot(l[0] - this.last.l[0], l[1] - this.last.l[1]) < SKID_STEP) return 0;
    this.quad(this.last.l, l, time);
    this.quad(this.last.r, r, time);
    this.last = { l, r };
    return 2;
  }

  /** Quads still visible at `time`. */
  liveCount(time: number): number {
    let n = 0;
    for (let q = 0; q < this.capacity; q++) if (time - this.uvs[q * 8 + 1]! < SKID_LIFE) n++;
    return n;
  }

  private quad(a: [number, number], b: [number, number], time: number): void {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const px = (-dz / len) * SKID_HALF_W;
    const pz = (dx / len) * SKID_HALF_W;
    const v = this.next * 4;
    const y = 0.035;
    const put = (k: number, x: number, z: number) => {
      this.positions[(v + k) * 3] = x;
      this.positions[(v + k) * 3 + 1] = y;
      this.positions[(v + k) * 3 + 2] = z;
      this.uvs[(v + k) * 2 + 1] = time;
    };
    put(0, a[0] - px, a[1] - pz);
    put(1, b[0] - px, b[1] - pz);
    put(2, b[0] + px, b[1] + pz);
    put(3, a[0] + px, a[1] + pz);
    this.next = (this.next + 1) % this.capacity;
    this.laid++;
  }
}

export const SKID_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * (modelMatrix * vec4(position, 1.0));
}`;

export const SKID_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  float age = skidNow - vUv.y;
  float a = 0.55 * clamp(1.0 - age / skidLife, 0.0, 1.0);
  float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
  a *= edge;
  outColor = vec4(vec3(0.03, 0.03, 0.035), (a == a) ? a : 0.0);
}`;

/** `skidNow` is written each frame with `setUniform` (no recompiles); `time` is avoided (an engine built-in). */
export const skidSpec = (): CustomSpec => ({
  glsl: { vertex: SKID_VERTEX, fragment: SKID_FRAGMENT },
  uniforms: { skidNow: { type: "f32", value: 0 }, skidLife: { type: "f32", value: SKID_LIFE } },
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: "normal",
  side: "double"
});
