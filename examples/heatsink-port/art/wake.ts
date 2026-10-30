/**
 * GU47 IC-18 signature effect: the ion wake. A camera-facing ribbon of `segments` quads resampled from the drone's
 * positions over the last `seconds`, cyan at the head fading to violet at the tail at cruise, amber under the
 * afterburner. Game-side (one dynamic strip, one draw) because the engine trail (E-F `effects.trail`) has one colour per
 * ribbon and no head-to-tail ramp; swap point marked `GU47(E-F)`. Pure: reads the drone position, never the sim state.
 */
import type { HeatsinkLookRow, Rgb } from "./look";

export interface WakeSample { readonly t: number; readonly x: number; readonly y: number; readonly z: number }

/** width ramp by speed in m/s: zero at or below 8 m/s, full width at or above 28 m/s (~100 km/h) */
export const WAKE_SPEED_RAMP: readonly [number, number] = [8, 28];

export interface IonWake {
  /** vertex positions, `segments * 4 * 3` */
  readonly positions: Float32Array;
  /** per-vertex linear RGB, `segments * 4 * 3` */
  readonly colors: Float32Array;
  /** per-vertex alpha, `segments * 4` */
  readonly alpha: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly segments: number;
  push(sample: WakeSample): void;
  /**
   * rebuilds the strip for time `now`, facing `eye`; `boost` 0..1 blends toward the afterburner colour; `widthScale`
   * scales the ribbon (0 hides it). Returns the ribbon length in metres.
   */
  build(now: number, eye: readonly [number, number, number], speed: number, boost: number, widthScale?: number): number;
  clear(): void;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function createIonWake(look: HeatsinkLookRow, capacity = 256): IonWake {
  const segments = Math.max(1, look.wake.segments);
  const positions = new Float32Array(segments * 12);
  const colors = new Float32Array(segments * 12);
  const alpha = new Float32Array(segments * 4);
  const uvs = new Float32Array(segments * 8);
  const indices = new Uint32Array(segments * 6);
  for (let k = 0; k < segments; k++) {
    uvs.set([0, k / segments, 1, k / segments, 1, (k + 1) / segments, 0, (k + 1) / segments], k * 8);
    indices.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
  }
  const ring: WakeSample[] = [];
  const pts: [number, number, number][] = Array.from({ length: segments + 1 }, () => [0, 0, 0]);

  function sampleAt(t: number, out: [number, number, number]): boolean {
    if (ring.length === 0) return false;
    const first = ring[0]!, last = ring[ring.length - 1]!;
    if (t >= last.t) { out[0] = last.x; out[1] = last.y; out[2] = last.z; return true; }
    if (t <= first.t) { out[0] = first.x; out[1] = first.y; out[2] = first.z; return t > first.t - 1e-6; }
    for (let i = ring.length - 1; i > 0; i--) {
      const a = ring[i - 1]!, b = ring[i]!;
      if (t >= a.t) {
        const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
        out[0] = lerp(a.x, b.x, u); out[1] = lerp(a.y, b.y, u); out[2] = lerp(a.z, b.z, u);
        return true;
      }
    }
    return false;
  }

  return {
    positions, colors, alpha, uvs, indices, segments,
    push(sample) {
      const last = ring[ring.length - 1];
      if (last && sample.t <= last.t) { if (sample.t < last.t) ring.length = 0; else ring.pop(); }
      ring.push(sample);
      while (ring.length > capacity) ring.shift();
      const cutoff = sample.t - look.wake.seconds - 0.1;
      while (ring.length > 2 && ring[1]!.t < cutoff) ring.shift();
    },
    build(now, eye, speed, boost, widthScale = 1) {
      positions.fill(0); alpha.fill(0);
      if (!look.wake.enabled || ring.length < 2) return 0;
      const ramp = Math.max(0, Math.min(1, (speed - WAKE_SPEED_RAMP[0]) / (WAKE_SPEED_RAMP[1] - WAKE_SPEED_RAMP[0])));
      const half = look.wake.width * 0.5 * ramp * widthScale;
      if (half <= 0) return 0;
      const oldest = ring[0]!.t;
      let length = 0;
      let valid = 0;
      for (let k = 0; k <= segments; k++) {
        const t = now - (look.wake.seconds * k) / segments;
        if (t < oldest || !sampleAt(t, pts[k]!)) break;
        if (k > 0) length += Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1], pts[k]![2] - pts[k - 1]![2]);
        valid = k;
      }
      const b = Math.max(0, Math.min(1, boost));
      const head = mixRgb(look.wake.cruise, look.wake.afterburner, b);
      const tail = mixRgb(look.wake.cruiseTail, look.wake.afterburner, b * 0.7);
      for (let k = 0; k < valid; k++) {
        for (let e = 0; e < 2; e++) {
          const p = pts[k + e]!, q = pts[Math.min(valid, k + e + 1)]!, r = pts[Math.max(0, k + e - 1)]!;
          const dx = q[0] - r[0], dy = q[1] - r[1], dz = q[2] - r[2];
          const vx = p[0] - eye[0], vy = p[1] - eye[1], vz = p[2] - eye[2];
          let wx = dy * vz - dz * vy, wy = dz * vx - dx * vz, wz = dx * vy - dy * vx;
          const wl = Math.hypot(wx, wy, wz) || 1;
          const along = (k + e) / segments;
          const w = (half * (1 - 0.75 * along)) / wl;
          wx *= w; wy *= w; wz *= w;
          const o = k * 12 + (e === 0 ? 0 : 6);
          /* quad order: (k, -w), (k, +w), (k+1, +w), (k+1, -w) */
          if (e === 0) { positions.set([p[0] - wx, p[1] - wy, p[2] - wz, p[0] + wx, p[1] + wy, p[2] + wz], k * 12); }
          else { positions.set([p[0] + wx, p[1] + wy, p[2] + wz, p[0] - wx, p[1] - wy, p[2] - wz], o); }
          const c = mixRgb(head, tail, Math.min(1, along * 1.4));
          const a = Math.pow(1 - along, 1.6) * ramp;
          const v0 = k * 4 + (e === 0 ? 0 : 2);
          colors.set([...c, ...c], v0 * 3);
          alpha[v0] = a; alpha[v0 + 1] = a;
        }
      }
      return length;
    },
    clear() { ring.length = 0; positions.fill(0); alpha.fill(0); }
  };
}

/** IC-22 bank roll in radians for a steer value in -1..1 at a given speed fraction, capped by the look (0 = none) */
export function bankRoll(look: HeatsinkLookRow, steer: number, speed01: number): number {
  const s = Math.max(-1, Math.min(1, steer));
  return (-s * Math.min(1, speed01 * 1.4) * look.camera.rollDeg * Math.PI) / 180;
}
