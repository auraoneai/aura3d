/**
 * GU47 phase 4 (storm-washed row): soft sun-cast ground shadows under the hero trees and boulders, one merged draw.
 *
 * The low 28 deg storm sun throws long shadows away from the sun. The look key's cascaded shadow map is on (CD-02), but in
 * software WebGL2 captures it does not read on the custom-lit grass, so every hero tree and boulder gets a soft elliptical
 * shade stretched along the sun's ground direction from its foot. Each shade is a 4x4-vertex grid draped on the ground
 * (track-space corners lifted by `groundAt`), because the placements stand slightly sunk into sloped shoulders.
 * Presentation only: no collision, no sim. Uses the existing `shadowSpec` program (radial alpha from the uv).
 */
import { Mesh } from "./mesh";

type V3 = readonly [number, number, number];
export interface ShadowPlacement { readonly pos: V3; readonly scale: number; readonly s?: number; readonly lat?: number }
export interface GroundShadowShape {
  /** Shadow length along the ground per metre of height (damped 1 / tan(sun elevation)). */
  readonly lengthPerHeight: number;
  /** Shadow half-width per metre of height. */
  readonly widthPerHeight: number;
}
export const TREE_SHADOW: GroundShadowShape = { lengthPerHeight: 1.0, widthPerHeight: 0.3 };
export const BOULDER_SHADOW: GroundShadowShape = { lengthPerHeight: 0.9, widthPerHeight: 0.5 };
/** Grid resolution of one draped shade (vertices per side). */
export const SHADE_GRID = 4;

/** Unit ground direction the shadow falls along: away from the sun, flattened onto the ground. */
export function shadowGroundDir(sunDir: V3): [number, number] {
  const x = -sunDir[0], z = -sunDir[2], l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

/** Track frame at `s` (forward and right, world xz) and the draped ground point at (s, lat). */
export interface GroundFrame { forwardXZ(s: number): [number, number]; groundAt(s: number, lat: number): V3 }

/**
 * Append one draped shade per placement with a track position (placements without `s`/`lat` are skipped). The shade's
 * world direction is projected into track space at the placement, so its corners follow the ground.
 */
export function appendGroundShadows(mesh: Mesh, list: readonly ShadowPlacement[], sunDir: V3, shape: GroundShadowShape, g: GroundFrame): void {
  const [dx, dz] = shadowGroundDir(sunDir);
  const n = SHADE_GRID;
  for (const p of list) {
    if (p.s === undefined || p.lat === undefined) continue;
    const [fx, fz] = g.forwardXZ(p.s);
    /* right = forward x up (y up): (fz, -fx) in xz, matching course.ts frameAt */
    const rx = -fz, rz = fx;
    const ds = dx * fx + dz * fz, dl = dx * rx + dz * rz;
    const h = Math.max(0.2, p.scale);
    const half = (h * shape.lengthPerHeight) / 2, w = h * shape.widthPerHeight;
    const off = half - w * 0.6;
    const cs = p.s + ds * off, cl = p.lat + dl * off;
    const base = mesh.vertexCount;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = (i / (n - 1)) * 2 - 1, b = (j / (n - 1)) * 2 - 1;
      const ss = cs + ds * half * a - dl * w * b, ll = cl + dl * half * a + ds * w * b;
      mesh.vertex(g.groundAt(ss, ll), [0, 1, 0], [i / (n - 1), j / (n - 1)], [1, 1, 1]);
    }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const v = base + j * n + i;
      mesh.quad(v, v + 1, v + n + 1, v + n);
    }
  }
}
