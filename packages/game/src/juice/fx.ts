/**
 * §6.7 GameFxLayer backend A ("primitive-pool") — one instanced node per kind
 * (sphere for spark/debris/bubble, quad for dust/ring/streak and the rest) with
 * a fixed tier capacity (§17: low 32 / medium 96 / high 256 / ultra 512 live
 * total, spread across kinds). Bursts are deterministic given `seed`.
 *
 * Per frame: integrate on session dt (gravity + drag), then write the live
 * matrices through C-37 `setInstanceTransforms` on the pool node (1 draw per
 * kind) and set `visible = count > 0` — never parked at y=-50 (§6.7 shadow-fit
 * note). Pool nodes mount hidden at [0,0,0] scale 1 with castShadow:false via
 * the scene decorator.
 */
import { SeededRandom } from "@aura3d/math";
import type { GameFxKind, Vec3Like } from "./Juice.js";

export type FxQualityTier = "low" | "medium" | "high" | "ultra";

/** §17 live-instance budget per tier (global cap across kinds). */
export const FX_TIER_LIVE_CAP: Readonly<Record<FxQualityTier, number>> = Object.freeze({
  low: 32,
  medium: 96,
  high: 256,
  ultra: 512
});

/** Per-kind capacity = tier cap / number of kinds, clamped ≥ 8. */
export function fxKindCapacity(tier: FxQualityTier): number {
  return Math.max(8, Math.floor(FX_TIER_LIVE_CAP[tier] / 10));
}

export type FxShape = "sphere" | "quad";

export interface FxPreset {
  readonly shape: FxShape;
  readonly life: readonly [number, number]; // seconds range
  readonly speed: readonly [number, number];
  readonly gravity: number; // m/s² downward
  readonly drag: number; // exponential per-second damping
  readonly scale: readonly [number, number];
  readonly color: string;
  readonly spread: number; // cone spread about `normal`, radians-ish
}

export const FX_PRESETS: Readonly<Record<GameFxKind, FxPreset>> = Object.freeze({
  spark: { shape: "sphere", life: [0.2, 0.45], speed: [3, 7], gravity: 9.8, drag: 1.5, scale: [0.02, 0.05], color: "#ffd27a", spread: 1.2 },
  dust: { shape: "quad", life: [0.5, 0.9], speed: [0.4, 1.2], gravity: 0.4, drag: 2.5, scale: [0.15, 0.35], color: "#c8c0b4", spread: 2.2 },
  debris: { shape: "sphere", life: [0.4, 0.8], speed: [2, 5], gravity: 12, drag: 0.8, scale: [0.03, 0.07], color: "#8a8a8a", spread: 1.6 },
  ring: { shape: "quad", life: [0.3, 0.5], speed: [2.5, 4], gravity: 0, drag: 3, scale: [0.1, 0.2], color: "#9fd8ff", spread: 0.3 },
  streak: { shape: "quad", life: [0.15, 0.3], speed: [6, 10], gravity: 0, drag: 1, scale: [0.02, 0.05], color: "#ffffff", spread: 0.2 },
  pickup: { shape: "quad", life: [0.35, 0.6], speed: [1.5, 3], gravity: -1.5, drag: 2, scale: [0.06, 0.1], color: "#7dff9a", spread: 2.0 },
  "explosion-small": { shape: "sphere", life: [0.35, 0.7], speed: [4, 9], gravity: 6, drag: 1.8, scale: [0.05, 0.12], color: "#ff8c3a", spread: 3.14 },
  muzzle: { shape: "quad", life: [0.08, 0.16], speed: [5, 8], gravity: 0, drag: 4, scale: [0.04, 0.08], color: "#ffe6a3", spread: 0.5 },
  splash: { shape: "sphere", life: [0.3, 0.6], speed: [2, 4.5], gravity: 9.8, drag: 1.2, scale: [0.03, 0.07], color: "#7ec8ff", spread: 1.8 },
  bubble: { shape: "sphere", life: [0.6, 1.2], speed: [0.5, 1.2], gravity: -2, drag: 1.5, scale: [0.02, 0.05], color: "#cfefff", spread: 1.0 }
});

/** Sink a kind pool writes into — the runtime handle's C-37 member + visible. */
export interface FxNodeSink {
  setInstanceTransforms(matrices: Float32Array, count: number, colors?: Float32Array): void;
  setVisible(visible: boolean): void;
}

export interface FxPrimitivePoolOptions {
  readonly tier?: FxQualityTier;
  readonly seed?: number;
  /** Per-kind writer; when absent, matrices are computed but not written (headless/tests). */
  readonly sinkFor?: (kind: GameFxKind) => FxNodeSink | undefined;
}

interface Particle {
  alive: boolean;
  age: number;
  life: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  scale: number;
  r: number; g: number; b: number;
}

interface KindPool {
  particles: Particle[];
  aliveCount: number;
  dirty: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class FxPrimitivePool {
  private readonly pools = new Map<GameFxKind, KindPool>();
  private readonly rng: SeededRandom;
  private readonly matrices = new Map<GameFxKind, Float32Array>();
  private readonly colors = new Map<GameFxKind, Float32Array>();
  private readonly cap: number;
  private readonly sinkFor?: (kind: GameFxKind) => FxNodeSink | undefined;

  constructor(options: FxPrimitivePoolOptions = {}) {
    this.rng = new SeededRandom(options.seed ?? 1);
    this.cap = fxKindCapacity(options.tier ?? "high");
    this.sinkFor = options.sinkFor;
    for (const kind of Object.keys(FX_PRESETS) as GameFxKind[]) {
      this.pools.set(kind, {
        particles: Array.from({ length: this.cap }, () => ({ alive: false, age: 0, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, scale: 0, r: 1, g: 1, b: 1 })),
        aliveCount: 0,
        dirty: false
      });
      this.matrices.set(kind, new Float32Array(this.cap * 16));
      this.colors.set(kind, new Float32Array(this.cap * 3));
    }
  }

  get liveCount(): number {
    let n = 0;
    for (const p of this.pools.values()) n += p.aliveCount;
    return n;
  }

  liveCountFor(kind: GameFxKind): number {
    return this.pools.get(kind)?.aliveCount ?? 0;
  }

  burst(kind: GameFxKind, position: Vec3Like, options?: { count?: number; speed?: number; color?: string; normal?: Vec3Like; seed?: number }): void {
    const preset = FX_PRESETS[kind];
    const pool = this.pools.get(kind);
    if (!pool) return;
    const rng = options?.seed !== undefined ? new SeededRandom(options.seed) : this.rng;
    const vec3 = (v: Vec3Like): [number, number, number] => ("x" in v ? [v.x, v.y, v.z] : [v[0], v[1], v[2]]);
    const [px, py, pz] = vec3(position);
    const n = options?.normal ? vec3(options.normal) : [0, 1, 0];
    const baseColor = options?.color ? hexToRgb(options.color) : hexToRgb(preset.color);
    const wanted = Math.min(options?.count ?? 12, this.cap);
    let spawned = 0;
    for (const p of pool.particles) {
      if (spawned >= wanted) break;
      if (p.alive) continue;
      const life = rng.range(preset.life[0], preset.life[1]);
      const speed = (options?.speed ?? rng.range(preset.speed[0], preset.speed[1]));
      // Cone sample: random unit-ish direction bent toward `normal`.
      const spread = preset.spread;
      const dx = rng.range(-spread, spread) + n[0] * 2;
      const dy = rng.range(0, spread) + Math.max(0.2, n[1]) * 2;
      const dz = rng.range(-spread, spread) + n[2] * 2;
      const inv = speed / (Math.hypot(dx, dy, dz) || 1);
      p.alive = true;
      p.age = 0;
      p.life = life;
      p.x = px; p.y = py; p.z = pz;
      p.vx = dx * inv; p.vy = dy * inv; p.vz = dz * inv;
      p.scale = rng.range(preset.scale[0], preset.scale[1]);
      p.r = baseColor[0]; p.g = baseColor[1]; p.b = baseColor[2];
      spawned++;
    }
    pool.aliveCount += spawned;
    if (spawned > 0) pool.dirty = true;
  }

  /** Advance one step on session dt and write live matrices via the sinks. */
  tick(dt: number): void {
    if (dt <= 0) return;
    for (const [kind, pool] of this.pools) {
      if (pool.aliveCount === 0 && !pool.dirty) continue;
      const hadLive = pool.aliveCount > 0;
      const preset = FX_PRESETS[kind];
      const matrices = this.matrices.get(kind)!;
      const colors = this.colors.get(kind)!;
      let w = 0; // write index
      for (const p of pool.particles) {
        if (!p.alive) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.alive = false;
          pool.aliveCount--;
          continue;
        }
        p.vy -= preset.gravity * dt;
        const damp = Math.exp(-preset.drag * dt);
        p.vx *= damp; p.vy *= damp; p.vz *= damp;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const grow = p.scale * (0.35 + 0.65 * (p.age / p.life));
        const o = w * 16;
        matrices[o] = grow; matrices[o + 1] = 0; matrices[o + 2] = 0; matrices[o + 3] = 0;
        matrices[o + 4] = 0; matrices[o + 5] = grow; matrices[o + 6] = 0; matrices[o + 7] = 0;
        matrices[o + 8] = 0; matrices[o + 9] = 0; matrices[o + 10] = grow; matrices[o + 11] = 0;
        matrices[o + 12] = p.x; matrices[o + 13] = p.y; matrices[o + 14] = p.z; matrices[o + 15] = 1;
        colors[w * 3] = p.r; colors[w * 3 + 1] = p.g; colors[w * 3 + 2] = p.b;
        w++;
      }
      // Write while live, and once more on the frame the pool empties so the
      // sink gets `count: 0` / `visible: false`.
      if (w > 0 || hadLive || pool.dirty) {
        this.sinkFor?.(kind)?.setInstanceTransforms(matrices, w, colors);
        this.sinkFor?.(kind)?.setVisible(w > 0);
      }
      pool.dirty = false;
    }
  }
}

/**
 * Scene decorator (§6.7): appends one hidden instanced pool node per kind —
 * `castShadow:false`, `visible:false`, at [0,0,0] scale 1 — so routes never
 * call `nodes()` and parked nodes never inflate the shadow fit.
 */
export function fxPoolSceneNodes(tier: FxQualityTier = "high"): readonly Record<string, unknown>[] {
  const cap = fxKindCapacity(tier);
  return (Object.keys(FX_PRESETS) as GameFxKind[]).map((kind) => {
    const preset = FX_PRESETS[kind];
    return {
      kind: "primitive",
      primitive: preset.shape === "sphere" ? "sphere" : "plane",
      name: `a3g-fx-${kind}`,
      position: [0, 0, 0],
      scale: 1,
      castShadow: false,
      receiveShadow: false,
      visible: false,
      runtime: { id: `a3g-fx-${kind}`, tags: ["a3g-fx"] },
      material: { kind: "unlit", color: preset.color, toneMapped: false },
      instances: Array.from({ length: cap }, () => ({ position: [0, 0, 0], scale: 0 })),
      instanceColors: Array.from({ length: cap }, () => preset.color)
    };
  });
}
