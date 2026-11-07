// Deterministic synthetic sensor generator. Same seed => byte-identical frames for both viewers.
import { SEED, TICK_RING } from "../../configs.mjs";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Cfg {
  id: string;
  points: number;
  instances: number;
  segments: number;
  rateHz: number;
  fps: number;
  labels: number;
  orbit: boolean;
  probe: { kind: "points" | "instances"; n: number } | null;
  variant: string | null;
  shot: boolean;
  viewer: "aura" | "three";
}

export interface SpatialData {
  /** One entry per ring slot: float32 xyz, length points*3. */
  pointPositions: Float32Array[];
  /** One entry per ring slot: packed RGBA8, length points*4. */
  pointColors: Uint8Array[];
  /** One entry per ring slot: column-major 4x4 matrices, length instances*16. */
  instanceMatrices: Float32Array[];
  /** One entry per ring slot: segment endpoint pairs, length segments*2*3. */
  segmentPositions: Float32Array[];
  /** World positions of the label anchors (xyz triples). */
  labelAnchors: Float32Array;
  /** Scene radius used for the camera. */
  radius: number;
  generateMs: number;
}

const RADIUS = 20;

export function generate(cfg: Cfg): SpatialData {
  const t0 = performance.now();
  const rng = mulberry32(SEED);
  const ring = cfg.rateHz > 0 ? TICK_RING : 1;
  const pointPositions: Float32Array[] = [];
  const pointColors: Uint8Array[] = [];
  const instanceMatrices: Float32Array[] = [];
  const segmentPositions: Float32Array[] = [];

  // Points: a lidar-like shell plus clutter, jittered per ring slot.
  if (cfg.points > 0) {
    const n = cfg.points;
    const base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng() * 2 - 1;
      const th = rng() * Math.PI * 2;
      const r = RADIUS * (0.35 + 0.65 * Math.cbrt(rng()));
      const s = Math.sqrt(1 - u * u);
      base[i * 3] = r * s * Math.cos(th);
      base[i * 3 + 1] = r * u * 0.4;
      base[i * 3 + 2] = r * s * Math.sin(th);
    }
    for (let f = 0; f < ring; f++) {
      const p = new Float32Array(n * 3);
      const c = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        p[j] = base[j]! + (rng() - 0.5) * 0.15;
        p[j + 1] = base[j + 1]! + (rng() - 0.5) * 0.15;
        p[j + 2] = base[j + 2]! + (rng() - 0.5) * 0.15;
        const h = Math.min(1, Math.max(0, (p[j + 1]! + 8) / 16));
        const k = i * 4;
        c[k] = 40 + 200 * h;
        c[k + 1] = 80 + 120 * (1 - Math.abs(h - 0.5) * 2);
        c[k + 2] = 240 - 200 * h;
        c[k + 3] = 255;
      }
      pointPositions.push(p);
      pointColors.push(c);
    }
  }

  // Instances: boxes (tracked objects) with a heading that changes every tick.
  if (cfg.instances > 0) {
    const n = cfg.instances;
    const bx = new Float32Array(n * 2);
    const by = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = RADIUS * 0.9 * Math.sqrt(rng());
      bx[i * 2] = r * Math.cos(a);
      bx[i * 2 + 1] = r * Math.sin(a);
      by[i] = (rng() - 0.5) * 6;
    }
    for (let f = 0; f < ring; f++) {
      const m = new Float32Array(n * 16);
      for (let i = 0; i < n; i++) {
        const yaw = (f * 0.37 + i * 0.011) % (Math.PI * 2);
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        const o = i * 16;
        // scale (0.5, 0.3, 1.0) folded into the rotation (column-major).
        m[o] = c * 0.5; m[o + 2] = -s * 0.5;
        m[o + 5] = 0.3;
        m[o + 8] = s * 1.0; m[o + 10] = c * 1.0;
        m[o + 12] = bx[i * 2]! + 0.1 * f; m[o + 13] = by[i]!; m[o + 14] = bx[i * 2 + 1]!;
        m[o + 15] = 1;
      }
      instanceMatrices.push(m);
    }
  }

  // Trajectories: 200 trails x (segments/200 + 1) points, drawn as line segments (pairs of endpoints).
  if (cfg.segments > 0) {
    const trails = 200;
    const per = cfg.segments / trails; // segments per trail
    const start = new Float32Array(trails * 3);
    const vel = new Float32Array(trails * 3);
    for (let t = 0; t < trails; t++) {
      start[t * 3] = (rng() - 0.5) * RADIUS * 1.4;
      start[t * 3 + 1] = (rng() - 0.5) * 6;
      start[t * 3 + 2] = (rng() - 0.5) * RADIUS * 1.4;
      vel[t * 3] = (rng() - 0.5) * 0.3;
      vel[t * 3 + 1] = (rng() - 0.5) * 0.02;
      vel[t * 3 + 2] = (rng() - 0.5) * 0.3;
    }
    for (let f = 0; f < ring; f++) {
      const seg = new Float32Array(cfg.segments * 2 * 3);
      let o = 0;
      for (let t = 0; t < trails; t++) {
        for (let s = 0; s < per; s++) {
          for (let e = 0; e < 2; e++) {
            const q = s + e + f * 0.25;
            seg[o++] = start[t * 3]! + vel[t * 3]! * q + Math.sin(q * 0.3 + t) * 0.2;
            seg[o++] = start[t * 3 + 1]! + vel[t * 3 + 1]! * q;
            seg[o++] = start[t * 3 + 2]! + vel[t * 3 + 2]! * q + Math.cos(q * 0.3 + t) * 0.2;
          }
        }
      }
      segmentPositions.push(seg);
    }
  }

  const labelAnchors = new Float32Array(cfg.labels * 3);
  for (let i = 0; i < cfg.labels; i++) {
    labelAnchors[i * 3] = (rng() - 0.5) * RADIUS;
    labelAnchors[i * 3 + 1] = (rng() - 0.5) * 6;
    labelAnchors[i * 3 + 2] = (rng() - 0.5) * RADIUS;
  }
  return { pointPositions, pointColors, instanceMatrices, segmentPositions, labelAnchors, radius: RADIUS, generateMs: performance.now() - t0 };
}

/** Deterministic NDC probe points shared by both viewers. */
export function probePoints(n: number): Array<[number, number]> {
  const rng = mulberry32(SEED ^ 0x5eed);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) out.push([rng() * 1.6 - 0.8, rng() * 1.6 - 0.8]);
  return out;
}

/** Scripted orbit pose for rendered-frame index i. */
export function orbitPose(i: number, radius: number): { position: [number, number, number]; target: [number, number, number] } {
  const a = i * 0.004;
  const d = radius * 2.1;
  return { position: [Math.cos(a) * d, radius * 0.7, Math.sin(a) * d], target: [0, 0, 0] };
}
