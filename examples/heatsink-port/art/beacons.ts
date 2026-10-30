/**
 * GU47 IC-24 lane beacons: a small glowing post on both road edges every 44 m, merged into one custom mesh (+1 draw).
 * Each beacon is a 4-sided tapered column with a per-vertex district colour (`beaconColor`), so one `solidSpec`-style
 * program lights them. Twilight only; pure geometry from the track (the sim never reads it, PRD D8).
 */
import { emptyMesh, hexLinear, type MeshData } from "../meshes";
import type { Frame, Track } from "../track";

export const BEACON = { spacing: 44, inset: 0.6, height: 1.4, base: 0.22, top: 0.1 } as const;

/** every beacon position (s, side) on the course; deterministic */
export function beaconSlots(track: Track): readonly { readonly s: number; readonly side: -1 | 1 }[] {
  const out: { s: number; side: -1 | 1 }[] = [];
  for (let s = BEACON.spacing / 2; s < track.length; s += BEACON.spacing) { out.push({ s, side: -1 }); out.push({ s, side: 1 }); }
  return out;
}

export function buildBeacons(track: Track): MeshData {
  const m = emptyMesh(["beaconColor"]);
  const f: Partial<Frame> = {};
  for (const { s, side } of beaconSlots(track)) {
    const fr = track.frame(s, f) as Frame;
    const lat = side * Math.max(0, fr.hw - BEACON.inset);
    const cx = fr.x + fr.rx * lat, cz = fr.z + fr.rz * lat, cy = fr.y + track.latY(s, lat);
    const col = hexLinear(fr.sec.hud.color);
    const ring = (r: number, y: number): number[][] => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [cx + (fr.tx * a! + fr.rx * b!) * r, cy + y, cz + (fr.tz * a! + fr.rz * b!) * r]);
    const lo = ring(BEACON.base, 0), hi = ring(BEACON.top, BEACON.height);
    for (let k = 0; k < 4; k++) {
      const a = lo[k]!, b = lo[(k + 1) % 4]!, c = hi[(k + 1) % 4]!, d = hi[k]!;
      const o = m.positions.length / 3;
      const nx = (a[0]! + b[0]!) / 2 - cx, nz = (a[2]! + b[2]!) / 2 - cz, nl = Math.hypot(nx, nz) || 1;
      for (const [p, v] of [[a, 0], [b, 0], [c, 1], [d, 1]] as const) {
        m.positions.push(p[0]!, p[1]!, p[2]!);
        m.normals.push(nx / nl, 0, nz / nl);
        m.uvs.push(k / 4, v);
        m.attrs.beaconColor!.push(col[0], col[1], col[2]);
      }
      m.indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
  }
  return m;
}
