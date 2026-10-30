// Aura FC 3D — GU47 QA crops (E-I crop contract, tests/browser/game-luma-stats.ts): named screen rects, normalised
// 0..1 to the canvas, origin top-left, projected from world boxes through the shown broadcast camera every time the
// capture reads them. Read-only: positions come from the sim state and the camera director, nothing is written.

import { PITCH_HX, PITCH_HZ } from "./dims";
import { mainFloodPosition } from "./scene";

export type V3 = readonly [number, number, number];
export interface QaCamera { readonly eye: V3; readonly target: V3; readonly fovDeg: number; readonly aspect: number }
export interface QaCrop { readonly name: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }

const sub = (a: V3, b: V3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): [number, number, number] => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Project a world point to normalised screen (x right, y down); null when behind the camera. Vertical fov. */
export function projectPoint(cam: QaCamera, p: V3): [number, number] | null {
  const f = norm(sub(cam.target, cam.eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(p, cam.eye);
  const z = dot(d, f);
  if (z <= 0.05) return null;
  const t = Math.tan((cam.fovDeg * Math.PI) / 360);
  const sx = dot(d, r) / (z * t * cam.aspect);
  const sy = dot(d, u) / (z * t);
  return [(sx + 1) / 2, (1 - sy) / 2];
}

/** Screen rect of an axis-aligned world box (min/max corners), clamped to 0..1; null if off screen or behind. */
export function projectBox(cam: QaCamera, min: V3, max: V3, name: string): QaCrop | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
    const s = projectPoint(cam, [x, y, z]);
    if (!s) return null;
    x0 = Math.min(x0, s[0]); y0 = Math.min(y0, s[1]); x1 = Math.max(x1, s[0]); y1 = Math.max(y1, s[1]);
  }
  const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(1, x1), cy1 = Math.min(1, y1);
  if (cx1 - cx0 < 1e-3 || cy1 - cy0 < 1e-3) return null;
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  return { name, x: r4(cx0), y: r4(cy0), w: r4(cx1 - cx0), h: r4(cy1 - cy0) };
}

/**
 * The crops the WP-19 acceptance lines name: `player` (controlled athlete, L3/M2), `ball`, `pitch` (centre circle
 * area, L1/M1), `crowd` (far stand, L3/AN1), `flood-bank` (main-stand flood head, P3), `sky` (top band above the far
 * stand, L1/S1/V2). At most 16; off-screen boxes are left out.
 */
export function fcQaCrops(cam: QaCamera, player: { x: number; z: number } | null, ball: V3): QaCrop[] {
  const out: (QaCrop | null)[] = [];
  if (player) out.push(projectBox(cam, [player.x - 0.45, 0, player.z - 0.45], [player.x + 0.45, 1.9, player.z + 0.45], "player"));
  out.push(projectBox(cam, [ball[0] - 0.25, Math.max(0, ball[1] - 0.25), ball[2] - 0.25], [ball[0] + 0.25, ball[1] + 0.25, ball[2] + 0.25], "ball"));
  out.push(projectBox(cam, [-6, 0, -6], [6, 0.02, 6], "pitch"));
  out.push(projectBox(cam, [-PITCH_HX, 0.9, -(PITCH_HZ + 12)], [PITCH_HX, 6, -(PITCH_HZ + 4)], "crowd"));
  const [fx, fy, fz] = mainFloodPosition();
  out.push(projectBox(cam, [fx - 1.2, fy - 0.8, fz - 1.2], [fx + 1.2, fy + 0.8, fz + 1.2], "flood-bank"));
  out.push(projectBox(cam, [-PITCH_HX - 20, 16, -(PITCH_HZ + 40)], [PITCH_HX + 20, 40, -(PITCH_HZ + 39)], "sky"));
  return out.filter((c): c is QaCrop => c !== null).slice(0, 16);
}
