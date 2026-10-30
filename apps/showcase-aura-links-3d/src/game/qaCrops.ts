/**
 * qaCrops.ts — the named crops Aura Links 3D publishes for the GU47
 * steady-state capture (`window.__AURA_QA__.crops`, E-I crop contract):
 * normalised 0..1 rects on the main canvas, origin top-left, re-projected
 * from the live camera pose at every read. They feed the WP-20 acceptance
 * lines: golfer pixels (LINKS-06), turf texture stddev (LINKS-05), the rough
 * crop's motion (LINKS-09), pond/lava motion and lava mean (LINKS-17), the
 * green (LINKS-16 Neon), the sky band (LINKS-02). Pure math, unit tested.
 */
import type { Vec3 } from "./types";

export interface QaCrop {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface QaView {
  readonly eye: Vec3;
  readonly target: Vec3;
  /** vertical field of view, degrees */
  readonly fov: number;
  /** width / height of the canvas */
  readonly aspect: number;
}

/** Projects a world point to normalised screen coordinates (0..1, origin top-left); null behind the camera. */
export function projectPoint(view: QaView, p: Vec3): readonly [number, number] | null {
  const f = normalize([view.target[0] - view.eye[0], view.target[1] - view.eye[1], view.target[2] - view.eye[2]]);
  // right = f x up(0,1,0); up' = right x f
  const r = normalize([-f[2], 0, f[0]]);
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d: Vec3 = [p[0] - view.eye[0], p[1] - view.eye[1], p[2] - view.eye[2]];
  const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  if (z <= 0.05) return null;
  const x = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
  const y = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const t = Math.tan((view.fov * Math.PI) / 360);
  const ndcX = x / (z * t * view.aspect);
  const ndcY = y / (z * t);
  return [0.5 + ndcX * 0.5, 0.5 - ndcY * 0.5];
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** The screen box around a set of world points, clamped to the canvas; null when it is off screen or smaller than `minSize`. */
export function boxCrop(name: string, view: QaView, points: readonly Vec3[], minSize = 0.01): QaCrop | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    const s = projectPoint(view, p);
    if (!s) return null;
    x0 = Math.min(x0, s[0]); y0 = Math.min(y0, s[1]); x1 = Math.max(x1, s[0]); y1 = Math.max(y1, s[1]);
  }
  const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(1, x1), cy1 = Math.min(1, y1);
  if (cx1 - cx0 < minSize || cy1 - cy0 < minSize) return null;
  const round = (n: number) => Number(n.toFixed(4));
  return { name, x: round(cx0), y: round(cy0), w: round(cx1 - cx0), h: round(cy1 - cy0) };
}

export interface QaScene {
  readonly ball: Vec3;
  readonly cup: Vec3;
  readonly aimYaw: number;
  readonly fairwayHalfWidth: number;
  readonly height: (x: number, z: number) => number;
  /** water hazards (lava on Cinder Rim): centre, radius, surface height */
  readonly ponds: readonly { readonly center: readonly [number, number]; readonly radius: number; readonly y: number }[];
}

/** A flat ground patch (corners on the turf) `ahead` metres along the aim and `side` metres to its right. */
function groundPatch(scene: QaScene, ahead: number, side: number, halfLen: number, halfWidth: number): Vec3[] {
  const fx = Math.sin(scene.aimYaw), fz = Math.cos(scene.aimYaw);
  const rx = Math.cos(scene.aimYaw), rz = -Math.sin(scene.aimYaw);
  const out: Vec3[] = [];
  for (const a of [ahead - halfLen, ahead + halfLen]) {
    for (const s of [side - halfWidth, side + halfWidth]) {
      const x = scene.ball[0] + fx * a + rx * s;
      const z = scene.ball[2] + fz * a + rz * s;
      out.push([x, scene.height(x, z) + 0.02, z]);
    }
  }
  return out;
}

/** The Links crops for this frame (at most 16, E-I contract); crops off screen are left out. */
export function linksQaCrops(view: QaView, scene: QaScene): QaCrop[] {
  const [bx, , bz] = scene.ball;
  const g = scene.height(bx, bz);
  const golfer = boxCrop("golfer", view, [
    [bx - 0.7, g, bz - 0.5], [bx + 0.9, g, bz - 0.5], [bx - 0.7, g + 1.95, bz + 0.5], [bx + 0.9, g + 1.95, bz + 0.5]
  ]);
  const ball = boxCrop("ball", view, [[bx - 0.15, g, bz - 0.15], [bx + 0.15, g + 0.15, bz + 0.15]], 0.002);
  const turf = boxCrop("turf", view, groundPatch(scene, 9, 0, 2, 1.6));
  const rough = boxCrop("rough", view, groundPatch(scene, 14, scene.fairwayHalfWidth + 6, 3, 2.5));
  const [cx, cy, cz] = scene.cup;
  const green = boxCrop("green", view, [[cx - 3, cy, cz - 3], [cx + 3, cy, cz + 3], [cx - 3, cy + 0.2, cz + 3], [cx + 3, cy + 0.2, cz - 3]]);
  const ponds = scene.ponds.slice(0, 2).map((p, i) => boxCrop(`pond-${i}`, view, [
    [p.center[0] - p.radius * 0.6, p.y, p.center[1] - p.radius * 0.6],
    [p.center[0] + p.radius * 0.6, p.y, p.center[1] + p.radius * 0.6],
    [p.center[0] - p.radius * 0.6, p.y, p.center[1] + p.radius * 0.6],
    [p.center[0] + p.radius * 0.6, p.y, p.center[1] - p.radius * 0.6]
  ]));
  const sky: QaCrop = { name: "sky", x: 0, y: 0, w: 1, h: 0.12 };
  return [sky, golfer, ball, turf, rough, green, ...ponds].filter((c): c is QaCrop => c !== null);
}
