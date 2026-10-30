/**
 * GU47 IC-02: moving glow pools. The custom shaders are unlit, so the boost pads and checkpoint veils light the road and
 * rock around them through two mat4 uniforms instead of engine lights (+0 draws): `poolPos` columns are (x, y, z,
 * radius), `poolCol` columns are (r, g, b, intensity), for the 4 emitters nearest the drone. Unused columns carry
 * intensity 0, and `?look=original` never writes them (the zero default leaves `lit()` exactly as today).
 *
 * Pure data and math: the sim never reads it (PRD D8).
 */
import type { Track } from "../track";
import { linearOf, type Rgb } from "./look";

export const POOL_SLOTS = 4;

export interface GlowEmitter {
  readonly kind: "pad" | "gate";
  /** index into `track.boostPads` or `track.checkpoints` (for the pulse) */
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly color: Rgb;
  readonly intensity: number;
}

/** boost pads glow amber close to the road; gates throw a wider, softer pool of their district colour */
export const POOL_STYLE = {
  pad: { radius: 13, intensity: 1.4, lift: 0.6, color: [1, 0.62, 0.15] as Rgb },
  gate: { radius: 22, intensity: 1.0, lift: 4 }
} as const;

/** every emitter on the course, built once from the track (positions are static) */
export function glowEmitters(track: Track): readonly GlowEmitter[] {
  const out: GlowEmitter[] = [];
  const w = { x: 0, y: 0, z: 0 };
  track.boostPads.forEach((p, index) => {
    const fr = track.frame(p.s);
    track.toWorld(p.s, p.x, fr.y + track.latY(p.s, p.x) + POOL_STYLE.pad.lift, w);
    out.push({ kind: "pad", index, x: w.x, y: w.y, z: w.z, radius: POOL_STYLE.pad.radius, color: POOL_STYLE.pad.color, intensity: POOL_STYLE.pad.intensity });
  });
  track.checkpoints.forEach((s, index) => {
    const fr = track.frame(s);
    track.toWorld(s, 0, fr.y + track.latY(s, 0) + POOL_STYLE.gate.lift, w);
    out.push({ kind: "gate", index, x: w.x, y: w.y, z: w.z, radius: POOL_STYLE.gate.radius, color: linearOf(fr.sec.hud.color), intensity: POOL_STYLE.gate.intensity });
  });
  return out;
}

export interface PoolUniforms {
  /** column-major mat4: column i = (x, y, z, radius) */
  readonly pos: Float32Array;
  /** column-major mat4: column i = (r, g, b, intensity) */
  readonly col: Float32Array;
  /** emitter index per slot (-1 = empty), for tests and the moving point light */
  readonly slot: Int32Array;
}

export function createPoolUniforms(): PoolUniforms {
  return { pos: new Float32Array(16), col: new Float32Array(16), slot: new Int32Array(POOL_SLOTS).fill(-1) };
}

/**
 * Fills `out` with the `POOL_SLOTS` emitters nearest (x, z), nearest first, without allocating. `pulse(kind, index)`
 * (0..1) brightens a pool when its pad or gate fires; `gain` scales every pool (0 turns them off).
 */
export function nearestPools(emitters: readonly GlowEmitter[], x: number, z: number, out: PoolUniforms, gain = 1, pulse?: (kind: GlowEmitter["kind"], index: number) => number): PoolUniforms {
  const best = out.slot;
  const dist = [Infinity, Infinity, Infinity, Infinity];
  best.fill(-1);
  for (let i = 0; i < emitters.length; i++) {
    const e = emitters[i]!;
    const d = (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z);
    if (d >= dist[POOL_SLOTS - 1]!) continue;
    let k = POOL_SLOTS - 1;
    while (k > 0 && dist[k - 1]! > d) { dist[k] = dist[k - 1]!; best[k] = best[k - 1]!; k--; }
    dist[k] = d; best[k] = i;
  }
  for (let k = 0; k < POOL_SLOTS; k++) {
    const i = best[k]!;
    const o = k * 4;
    if (i < 0) { out.pos.fill(0, o, o + 4); out.col.fill(0, o, o + 4); continue; }
    const e = emitters[i]!;
    out.pos[o] = e.x; out.pos[o + 1] = e.y; out.pos[o + 2] = e.z; out.pos[o + 3] = e.radius;
    out.col[o] = e.color[0]; out.col[o + 1] = e.color[1]; out.col[o + 2] = e.color[2];
    out.col[o + 3] = e.intensity * gain * (1 + 1.5 * (pulse ? Math.max(0, Math.min(1, pulse(e.kind, e.index))) : 0));
  }
  return out;
}
