/**
 * GU47 WP-35 CD-16: a narrow waterfall off the sun-side drop near the start of the run, falling down the sandstone face
 * into the cloud sea, as one merged ribbon (one draw). A short runnel crosses the shoulder, the fall follows the drop
 * profile (terrain.ts `profile`) and continues below its foot until it fades into the cloud sea. The shader
 * (shaders.ts WATERFALL_FRAGMENT) scrolls streaks down `uv.y` and fades the edges; the spray at the lip is a runtime
 * preset (art/vfx.ts `falls-spray`). Pure geometry, no screen-wide rain.
 */
import type { Chapter } from "./chapter";
import { frameAt, type V3 } from "./course";
import { Mesh } from "./mesh";
import { ROAD_HALF, profile } from "./terrain";

/** Where the fall leaves the ridge: distance along the course and the side of the drop (the right side drops for s < 290). */
export const WATERFALL_S = 150;
export const WATERFALL_SIDE: 1 | -1 = 1;
export const WATERFALL_WIDTH = 4.2;
/** Extra drop below the profile's last point, into the cloud sea (the valley plane sits ~43 m below the track). */
export const WATERFALL_TAIL = 14;
const ROWS_ACROSS = 4;

export interface WaterfallPath { readonly lat: number; readonly h: number; readonly v: number }

/** The fall's centre path from the road shoulder over the lip and down the face, with `v` = metres travelled (for the uv). */
export function waterfallPath(ch: Chapter, s = WATERFALL_S, side: 1 | -1 = WATERFALL_SIDE): WaterfallPath[] {
  const p = profile(ch, s, side).slice(2);
  const out: WaterfallPath[] = [];
  let v = 0, prev: { lat: number; h: number } | null = null;
  const push = (u: number, h: number, lift: number): void => {
    const lat = side * (ROAD_HALF + u);
    if (prev) v += Math.hypot(lat - prev.lat, h - prev.h);
    out.push({ lat, h: h + lift, v });
    prev = { lat, h };
  };
  for (const q of p) push(q.u, q.h, 0.12);
  const last = p[p.length - 1]!;
  push(last.u + 2, last.h - WATERFALL_TAIL, 0);
  return out;
}

/** The fall ribbon: `uv.x` across (0..1), `uv.y` metres down the path (the shader scrolls it). */
export function buildWaterfall(ch: Chapter, s = WATERFALL_S, side: 1 | -1 = WATERFALL_SIDE): Mesh {
  const m = new Mesh();
  const path = waterfallPath(ch, s, side);
  const total = path[path.length - 1]!.v || 1;
  let prevRow = -1;
  for (const q of path) {
    const row = m.vertexCount;
    // the fall narrows over the lip and spreads a little as it drops
    const spread = WATERFALL_WIDTH * (0.55 + 0.45 * (q.v / total));
    for (let k = 0; k <= ROWS_ACROSS; k++) {
      const a = k / ROWS_ACROSS, ds = (a - 0.5) * spread;
      const f = frameAt(s + ds, q.lat);
      const p: V3 = [f.point[0] + f.up[0] * q.h, f.point[1] + f.up[1] * q.h, f.point[2] + f.up[2] * q.h];
      m.vertex(p, [f.right[0] * side, f.right[1] * side, f.right[2] * side], [a, q.v], [1, 1, 1]);
    }
    if (prevRow >= 0) for (let k = 0; k < ROWS_ACROSS; k++) m.quad(prevRow + k, prevRow + k + 1, row + k + 1, row + k);
    prevRow = row;
  }
  return m;
}

/** World position of the lip (where the runnel tips over the drop), for the spray preset. */
export function waterfallLip(ch: Chapter, s = WATERFALL_S, side: 1 | -1 = WATERFALL_SIDE): V3 {
  const p = profile(ch, s, side), lip = p[4]!;
  const f = frameAt(s, side * (ROAD_HALF + lip.u));
  return [f.point[0] + f.up[0] * lip.h, f.point[1] + f.up[1] * lip.h, f.point[2] + f.up[2] * lip.h];
}
