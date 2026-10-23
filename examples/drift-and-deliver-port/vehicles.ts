/**
 * Drift & Deliver port: low-poly car shells built in code (this port's own models).
 *
 * Each shell is two meshes: `paint` (body, roof; tinted per instance) and `detail` (glass, bumpers, lamps, wheels
 * arches; never tinted). Local frame: +z forward, +y up, ground at y = 0, centred on the car.
 */
import { createMesh, hexRgb, prismX, type MeshData, type Rgb, type V3 } from "./mesh";

export type CarKind = "sedan" | "hatch" | "van" | "pickup";
export const CAR_KINDS: readonly CarKind[] = ["sedan", "hatch", "van", "pickup"];

export interface CarSpec {
  readonly w: number;
  readonly l: number;
  readonly bodyY0: number;
  readonly bodyH: number;
  /** cabin z range at its base / roof, and its height */
  readonly cabBase: readonly [number, number];
  readonly cabRoof: readonly [number, number];
  readonly cabH: number;
  readonly hoodDrop: number;
  readonly wheelR: number;
}

export const CAR_SPECS: Record<CarKind, CarSpec> = {
  sedan: { w: 1.9, l: 4.5, bodyY0: 0.3, bodyH: 0.62, cabBase: [-1.55, 0.95], cabRoof: [-1.15, 0.45], cabH: 0.56, hoodDrop: 0.1, wheelR: 0.36 },
  hatch: { w: 1.8, l: 3.95, bodyY0: 0.3, bodyH: 0.64, cabBase: [-1.7, 1.0], cabRoof: [-1.55, 0.5], cabH: 0.62, hoodDrop: 0.12, wheelR: 0.34 },
  van: { w: 2.0, l: 5.0, bodyY0: 0.34, bodyH: 0.86, cabBase: [-2.3, 1.55], cabRoof: [-2.25, 1.15], cabH: 0.82, hoodDrop: 0.2, wheelR: 0.38 },
  pickup: { w: 2.0, l: 5.2, bodyY0: 0.38, bodyH: 0.7, cabBase: [-0.35, 1.55], cabRoof: [-0.1, 0.95], cabH: 0.68, hoodDrop: 0.1, wheelR: 0.42 }
};

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** A convex face: fan triangles, wound to point away from `centroid`. */
function face(m: MeshData, pts: V3[], centroid: V3, color: Rgb): void {
  const centre = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) centre[k] = centre[k]! + p[k]! / pts.length;
  const out: V3 = [centre[0]! - centroid[0], centre[1]! - centroid[1], centre[2]! - centroid[2]];
  for (let i = 1; i < pts.length - 1; i++) {
    let a = pts[0]!, b = pts[i]!, c = pts[i + 1]!;
    const n = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) [b, c] = [c, b];
    const nn = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
    const len = Math.hypot(nn[0], nn[1], nn[2]) || 1;
    const base = m.positions.length / 3;
    for (const p of [a, b, c]) {
      m.positions.push(p[0], p[1], p[2]);
      m.normals.push(nn[0] / len, nn[1] / len, nn[2] / len);
      m.uvs.push(0, 0);
      m.colors.push(color[0], color[1], color[2], 1);
    }
    m.indices.push(base, base + 1, base + 2);
  }
}

export interface HexColors {
  top: Rgb;
  bottom?: Rgb;
  front: Rgb;
  back: Rgb;
  left: Rgb;
  right: Rgb;
}

/**
 * Eight-vertex convex solid: bottom corners 0..3 (-x/z0, +x/z0, +x/z1, -x/z1) then top corners 4..7 in the same order.
 * Faces are routed to the meshes chosen by the caller.
 */
export function hex(into: { top: MeshData; side: MeshData; bottom?: MeshData }, v: V3[], c: HexColors): void {
  const sum = [0, 0, 0];
  for (const p of v) for (let k = 0; k < 3; k++) sum[k] = sum[k]! + p[k]! / 8;
  const centroid: V3 = [sum[0]!, sum[1]!, sum[2]!];
  const f = (mesh: MeshData, ids: number[], color: Rgb): void => face(mesh, ids.map((i) => v[i] as V3), centroid, color);
  f(into.top, [4, 5, 6, 7], c.top);
  if (into.bottom && c.bottom) f(into.bottom, [0, 1, 2, 3], c.bottom);
  f(into.side, [3, 2, 6, 7], c.front);
  f(into.side, [0, 1, 5, 4], c.back);
  f(into.side, [1, 2, 6, 5], c.right);
  f(into.side, [0, 3, 7, 4], c.left);
}

export interface CarShell {
  paint: MeshData;
  detail: MeshData;
  spec: CarSpec;
}

const WHITE: Rgb = [1, 1, 1];

export function buildCarShell(kind: CarKind): CarShell {
  const s = CAR_SPECS[kind];
  const paint = createMesh();
  const detail = createMesh();
  const glass = hexRgb("#17202b");
  const trim = hexRgb("#1b1c20");
  const hw = s.w / 2;
  const z0 = -s.l / 2;
  const z1 = s.l / 2;
  const y0 = s.bodyY0;
  const y1 = s.bodyY0 + s.bodyH;
  // lower body: the nose and tail slope down a little
  hex({ top: paint, side: paint }, [
    [-hw, y0, z0], [hw, y0, z0], [hw, y0, z1], [-hw, y0, z1],
    [-hw * 0.96, y1, z0 + 0.1], [hw * 0.96, y1, z0 + 0.1], [hw * 0.96, y1 - s.hoodDrop, z1 - 0.12], [-hw * 0.96, y1 - s.hoodDrop, z1 - 0.12]
  ], { top: WHITE, front: WHITE, back: WHITE, left: WHITE, right: WHITE });
  // greenhouse: glass sides/front/back, painted roof
  const cb = s.cabBase;
  const cr = s.cabRoof;
  const cy0 = y1 - 0.03;
  const cy1 = y1 + s.cabH;
  hex({ top: paint, side: detail }, [
    [-hw * 0.92, cy0, cb[0]], [hw * 0.92, cy0, cb[0]], [hw * 0.92, cy0, cb[1]], [-hw * 0.92, cy0, cb[1]],
    [-hw * 0.8, cy1, cr[0]], [hw * 0.8, cy1, cr[0]], [hw * 0.8, cy1, cr[1]], [-hw * 0.8, cy1, cr[1]]
  ], { top: WHITE, front: glass, back: glass, left: glass, right: glass });
  // pillars: a painted beam down the middle of each side window
  const pz = (cb[0] + cr[0]) / 2 + (cb[1] - cb[0]) * 0.1;
  hex({ top: paint, side: paint }, [
    [-hw * 0.93, cy0, pz - 0.06], [hw * 0.93, cy0, pz - 0.06], [hw * 0.93, cy0, pz + 0.06], [-hw * 0.93, cy0, pz + 0.06],
    [-hw * 0.82, cy1, pz - 0.05], [hw * 0.82, cy1, pz - 0.05], [hw * 0.82, cy1, pz + 0.05], [-hw * 0.82, cy1, pz + 0.05]
  ], { top: WHITE, front: WHITE, back: WHITE, left: WHITE, right: WHITE });
  // pickup bed: a low open box behind the cab
  if (kind === "pickup") {
    hex({ top: detail, side: paint }, [
      [-hw * 0.97, y1, z0 + 0.1], [hw * 0.97, y1, z0 + 0.1], [hw * 0.97, y1, cb[0] - 0.05], [-hw * 0.97, y1, cb[0] - 0.05],
      [-hw * 0.97, y1 + 0.28, z0 + 0.1], [hw * 0.97, y1 + 0.28, z0 + 0.1], [hw * 0.97, y1 + 0.28, cb[0] - 0.05], [-hw * 0.97, y1 + 0.28, cb[0] - 0.05]
    ], { top: hexRgb("#2b2c31"), front: WHITE, back: WHITE, left: WHITE, right: WHITE });
  }
  // bumpers, grille and valance
  hex({ top: detail, side: detail }, [
    [-hw, y0 - 0.06, z1 - 0.1], [hw, y0 - 0.06, z1 - 0.1], [hw, y0 - 0.06, z1 + 0.1], [-hw, y0 - 0.06, z1 + 0.1],
    [-hw, y0 + 0.2, z1 - 0.1], [hw, y0 + 0.2, z1 - 0.1], [hw, y0 + 0.2, z1 + 0.1], [-hw, y0 + 0.2, z1 + 0.1]
  ], { top: trim, front: trim, back: trim, left: trim, right: trim });
  hex({ top: detail, side: detail }, [
    [-hw, y0 - 0.06, z0 - 0.1], [hw, y0 - 0.06, z0 - 0.1], [hw, y0 - 0.06, z0 + 0.1], [-hw, y0 - 0.06, z0 + 0.1],
    [-hw, y0 + 0.2, z0 - 0.1], [hw, y0 + 0.2, z0 - 0.1], [hw, y0 + 0.2, z0 + 0.1], [-hw, y0 + 0.2, z0 + 0.1]
  ], { top: trim, front: trim, back: trim, left: trim, right: trim });
  // headlamps and tail lamps
  const head = hexRgb("#fff3cf");
  const tail = hexRgb("#d02020");
  for (const side of [-1, 1]) {
    const lx = side * hw * 0.68;
    hex({ top: detail, side: detail }, [
      [lx - 0.3, y1 - 0.34, z1 - 0.12], [lx + 0.3, y1 - 0.34, z1 - 0.12], [lx + 0.3, y1 - 0.34, z1 + 0.04], [lx - 0.3, y1 - 0.34, z1 + 0.04],
      [lx - 0.3, y1 - 0.14, z1 - 0.12], [lx + 0.3, y1 - 0.14, z1 - 0.12], [lx + 0.3, y1 - 0.14, z1 + 0.04], [lx - 0.3, y1 - 0.14, z1 + 0.04]
    ], { top: head, front: head, back: head, left: head, right: head });
    hex({ top: detail, side: detail }, [
      [lx - 0.3, y1 - 0.38, z0 - 0.04], [lx + 0.3, y1 - 0.38, z0 - 0.04], [lx + 0.3, y1 - 0.38, z0 + 0.12], [lx - 0.3, y1 - 0.38, z0 + 0.12],
      [lx - 0.3, y1 - 0.2, z0 - 0.04], [lx + 0.3, y1 - 0.2, z0 - 0.04], [lx + 0.3, y1 - 0.2, z0 + 0.12], [lx - 0.3, y1 - 0.2, z0 + 0.12]
    ], { top: tail, front: tail, back: tail, left: tail, right: tail });
  }
  // wheel arches: dark blocks that the tyres sit in
  for (const side of [-1, 1]) {
    for (const wz of wheelZ(kind)) {
      const ax = side * (hw - 0.02);
      const r = s.wheelR + 0.08;
      hex({ top: detail, side: detail }, [
        [ax - 0.02, y0 - 0.02, wz - r], [ax + 0.02, y0 - 0.02, wz - r], [ax + 0.02, y0 - 0.02, wz + r], [ax - 0.02, y0 - 0.02, wz + r],
        [ax - 0.02, y0 + r * 1.05, wz - r * 0.7], [ax + 0.02, y0 + r * 1.05, wz - r * 0.7], [ax + 0.02, y0 + r * 1.05, wz + r * 0.7], [ax - 0.02, y0 + r * 1.05, wz + r * 0.7]
      ], { top: trim, front: trim, back: trim, left: trim, right: trim });
    }
  }
  // wheels and hubs are part of the shell (they never steer or spin visibly), so a car is two draws, not twelve
  const tyre = hexRgb("#1a1a1e");
  const hub = hexRgb("#b9bcc4");
  for (const [wx, wy, wz] of wheelOffsets(kind)) {
    const out = Math.sign(wx);
    prismX(detail, wx, wy, wz, s.wheelR, 0.14, 8, tyre, tyre);
    prismX(detail, wx + out * 0.1, wy, wz, s.wheelR * 0.55, 0.06, 8, hub, hub);
  }
  return { paint, detail, spec: s };
}

/** Axle positions (z). */
export function wheelZ(kind: CarKind): [number, number] {
  const s = CAR_SPECS[kind];
  return [-s.l * 0.31, s.l * 0.32];
}

/** Wheel centres relative to the car centre: (x, y, z). */
export function wheelOffsets(kind: CarKind): V3[] {
  const s = CAR_SPECS[kind];
  const out: V3[] = [];
  for (const wz of wheelZ(kind)) for (const side of [-1, 1]) out.push([side * (s.w / 2 - 0.12), s.wheelR, wz]);
  return out;
}
