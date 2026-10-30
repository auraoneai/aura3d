/**
 * GU47 WP-35 CD-12: rain puddles on the wet sandstone track, as one merged mesh (one draw). 24 irregular discs placed
 * deterministically along the run (never on the stream, never in the first 20 m), each a fan with a jittered rim; the
 * puddle shader (shaders.ts PUDDLE_FRAGMENT) mirrors the rain-washed sky with a fresnel, a sun glint and slow ripples.
 * Pure geometry: no engine import, unit-tested for count, placement and the decal cap (<= 32).
 */
import type { Chapter } from "./chapter";
import { frameAt, type V3 } from "./course";
import { Mesh } from "./mesh";
import { ROAD_HALF, groundHeight } from "./terrain";

export const PUDDLE_COUNT = 24;
export const PUDDLE_CAP = 32;
const RIM = 14;

export interface PuddlePlacement { readonly s: number; readonly lane: number; readonly rx: number; readonly rz: number; readonly yaw: number }

export function puddlePlacements(ch: Chapter, count = PUDDLE_COUNT): PuddlePlacement[] {
  let seed = 9177;
  const rnd = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), seed / 4294967296);
  const out: PuddlePlacement[] = [];
  const span = ch.length - 60;
  const slots = Math.ceil(count * 1.25);
  for (let i = 0; out.length < count && i < slots; i++) {
    const s = 24 + ((i + rnd() * 0.8) / slots) * span;
    if (ch.waters.some((w) => s > w.start - 8 && s < w.end + 8)) continue;
    const rx = 0.7 + rnd() * 1.1, rz = rx * (0.55 + rnd() * 0.4);
    const lane = (rnd() * 2 - 1) * (ROAD_HALF - rx - 0.4);
    out.push({ s, lane, rx, rz, yaw: rnd() * Math.PI });
  }
  return out;
}

export function buildPuddles(ch: Chapter, placements = puddlePlacements(ch)): Mesh {
  const m = new Mesh();
  let seed = 4411;
  const rnd = (): number => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0), seed / 4294967296);
  for (const p of placements) {
    const f = frameAt(p.s, p.lane);
    const lift = groundHeight(ch, p.s, p.lane) + 0.035;
    const c: V3 = [f.point[0] + f.up[0] * lift, f.point[1] + f.up[1] * lift, f.point[2] + f.up[2] * lift];
    const ca = Math.cos(p.yaw), sa = Math.sin(p.yaw);
    const centre = m.vertex(c, f.up, [0.5, 0.5], [1, 1, 1]);
    for (let k = 0; k < RIM; k++) {
      const a = (k / RIM) * Math.PI * 2, j = 0.8 + rnd() * 0.35;
      const lx = Math.cos(a) * p.rx * j, lz = Math.sin(a) * p.rz * j;
      const x = lx * ca - lz * sa, z = lx * sa + lz * ca;
      const v: V3 = [c[0] + f.right[0] * x + f.forward[0] * z, c[1] + f.right[1] * x + f.forward[1] * z, c[2] + f.right[2] * x + f.forward[2] * z];
      m.vertex(v, f.up, [0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5], [1, 1, 1]);
    }
    for (let k = 0; k < RIM; k++) m.tri(centre, centre + 1 + k, centre + 1 + ((k + 1) % RIM));
  }
  return m;
}
