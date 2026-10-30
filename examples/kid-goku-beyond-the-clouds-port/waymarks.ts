/**
 * GU47 WP-35 CD-20 (partial): waymarks along the ridge, merged into one mesh (one draw): stacked sandstone cairns on the
 * road shoulders every ~140 m and a pair of cord poles with cloth strips at each gorge the staff spans. The wind-carved
 * arches and the Meshy cord pole are WP-36 assets; these procedural pieces stand in until then. Sage moss pads with pale
 * flowers fill the shoulder hollows where rain water stands (same draw). Pure geometry.
 */
import type { Chapter } from "./chapter";
import { frameAt, type V3 } from "./course";
import { Mesh, box, cylinder, hex, icosphere, mix3 } from "./mesh";
import { yawOf } from "./props";
import { ROAD_HALF, groundHeight } from "./terrain";

export const CAIRN_SPACING = 140;
const SANDSTONE = hex("#b5643c"), PALE = hex("#d8a77a"), CORD = hex("#5a4632");
const CLOTH = [hex("#ffb347"), hex("#eef3f8"), hex("#2f6fb8"), hex("#6f8f4a")] as const;

export interface Waymark { readonly kind: "cairn" | "pole" | "hollow"; readonly s: number; readonly lane: number }

/** CD-20 hollows: a ground dip at least this deep below its four neighbours 3 m away gets a moss pad and flowers. */
export const HOLLOW_DEPTH = 0.3;
export const HOLLOW_SPACING = 24;
export const HOLLOW_CAP = 48;
const MOSS = hex("#6f8f4a"), MOSS_DARK = hex("#4f6b36");
const HOLLOW_FLOWERS = [hex("#f4ecd2"), hex("#eef3f8"), hex("#e9d79a")] as const;

/** Shoulder dips off the road (never on the stream or a gorge) where rain water would stand: moss and flowers grow there. */
export function hollowPlacements(ch: Chapter): Waymark[] {
  const out: Waymark[] = [];
  let last = -Infinity;
  for (let s = 30; s < ch.length - 20 && out.length < HOLLOW_CAP; s += 3) {
    if (s - last < HOLLOW_SPACING) continue;
    if (ch.poles.some((p) => s > p.start - 12 && s < p.end + 12) || ch.waters.some((w) => s > w.start - 6 && s < w.end + 6)) continue;
    let best: { lane: number; depth: number } | null = null;
    for (const side of [-1, 1] as const) {
      for (let off = 2.5; off <= 12; off += 1.5) {
        const lane = side * (ROAD_HALF + off), h = groundHeight(ch, s, lane);
        const around = (groundHeight(ch, s - 3, lane) + groundHeight(ch, s + 3, lane) + groundHeight(ch, s, lane - 3) + groundHeight(ch, s, lane + 3)) / 4;
        const depth = around - h;
        if (depth >= HOLLOW_DEPTH && (!best || depth > best.depth)) best = { lane, depth };
      }
    }
    if (best) { out.push({ kind: "hollow", s, lane: best.lane }); last = s; }
  }
  return out;
}

export function waymarkPlacements(ch: Chapter): Waymark[] {
  const out: Waymark[] = [];
  let side = 1;
  for (let s = 70; s < ch.length - 40; s += CAIRN_SPACING) {
    if (ch.poles.some((p) => s > p.start - 20 && s < p.end + 20) || ch.waters.some((w) => s > w.start - 10 && s < w.end + 10)) continue;
    out.push({ kind: "cairn", s, lane: side * (ROAD_HALF + 1.4) });
    side = -side;
  }
  for (const p of ch.poles) for (const lane of [-(ROAD_HALF + 0.9), ROAD_HALF + 0.9]) out.push({ kind: "pole", s: p.start - 3, lane });
  out.push(...hollowPlacements(ch));
  return out;
}

export function buildWaymarks(ch: Chapter, placements = waymarkPlacements(ch)): Mesh {
  const m = new Mesh();
  let seed = 2026;
  const rnd = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), seed / 4294967296);
  for (const w of placements) {
    const f = frameAt(w.s, w.lane), yaw = yawOf(f.forward);
    const base: V3 = [f.point[0], f.point[1] + groundHeight(ch, w.s, w.lane), f.point[2]];
    if (w.kind === "hollow") {
      // a low sage moss pad filling the dip, with a few pale flowers on it (same merged draw)
      m.append(icosphere(1, mix3(MOSS, MOSS_DARK, rnd() * 0.5), 0.18, rnd, true), [base[0], base[1] - 0.04, base[2]], [1.3 + rnd() * 0.8, 0.12, 1.0 + rnd() * 0.6], rnd() * Math.PI, 0);
      for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2, r = rnd() * 1.1;
        const stem = box(0.09, 0.16, 0.09, HOLLOW_FLOWERS[i % HOLLOW_FLOWERS.length]!);
        m.append(stem, [base[0] + Math.cos(a) * r, base[1] + 0.12, base[2] + Math.sin(a) * r], 0.8 + rnd() * 0.5, rnd() * Math.PI, 0);
      }
    } else if (w.kind === "cairn") {
      let y = 0;
      for (let i = 0; i < 5; i++) {
        const r = 0.55 - i * 0.09, hgt = r * 0.75;
        m.append(icosphere(1, mix3(SANDSTONE, PALE, rnd() * 0.6), 0.12, rnd, true), [base[0], base[1] + y, base[2]], [r, hgt, r * (0.8 + rnd() * 0.3)], rnd() * Math.PI, 0);
        y += hgt * 0.85;
      }
    } else {
      m.append(cylinder(6, 0.07, 0.05, 3.4, CORD, CORD), base, 1, yaw, 0);
      for (let i = 0; i < 4; i++) {
        const strip = box(0.12, 0.6, 0.02, CLOTH[i % CLOTH.length]!);
        m.append(strip, [base[0] + f.right[0] * (0.1 + i * 0.05), base[1] + 3.1 - i * 0.18, base[2] + f.right[2] * (0.1 + i * 0.05)], 1, yaw + 0.2 * i, 0.15);
      }
    }
  }
  m.computeNormals();
  return m;
}
