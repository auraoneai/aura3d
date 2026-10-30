/**
 * GU47 LT-18 / E-I handoff: named QA crops normalised to the canvas (0..1), recomputed on every capture from the camera
 * pose on screen. `sky-top` is the top band of the frame; `platform` boxes the pool town's platform lamps; `headlamp`
 * boxes the tram's headlamp. A subject behind the camera or off screen yields no crop.
 */
import type { V3 } from "./orient";

export interface QaCrop { readonly name: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface QaCameraPose { readonly eye: V3; readonly target: V3; readonly fov: number }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Normalised screen position (x right, y down, 0..1 inside the frame) of `p` for a perspective camera with vertical `fov` (deg); null behind the camera. */
export function projectNormalised(pose: QaCameraPose, aspect: number, p: V3): [number, number] | null {
  const f = norm(sub(pose.target, pose.eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const d = sub(p, pose.eye), z = dot(d, f);
  if (z <= 0.05) return null;
  const t = Math.tan((pose.fov * Math.PI) / 360);
  return [0.5 + dot(d, r) / (z * t * aspect) / 2, 0.5 - dot(d, u) / (z * t) / 2];
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** The screen box around a set of world points, padded by `pad` (normalised); null when no point is in front of the camera or the box is off screen. */
export function boxOf(name: string, pose: QaCameraPose, aspect: number, points: readonly V3[], pad: number): QaCrop | null {
  const xy = points.map((p) => projectNormalised(pose, aspect, p)).filter((v): v is [number, number] => v !== null);
  if (xy.length === 0) return null;
  const x0 = clamp01(Math.min(...xy.map((v) => v[0])) - pad), x1 = clamp01(Math.max(...xy.map((v) => v[0])) + pad);
  const y0 = clamp01(Math.min(...xy.map((v) => v[1])) - pad), y1 = clamp01(Math.max(...xy.map((v) => v[1])) + pad);
  if (x1 - x0 < 0.005 || y1 - y0 < 0.005) return null;
  return { name, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const SKY_TOP: QaCrop = { name: "sky-top", x: 0, y: 0, w: 1, h: 0.16 };

export function lamplightCrops(pose: QaCameraPose, aspect: number, platformLamps: readonly V3[], headlamp: V3): QaCrop[] {
  const out: QaCrop[] = [SKY_TOP];
  const platform = boxOf("platform", pose, aspect, platformLamps.flatMap((p) => [p, [p[0], p[1] - 4, p[2]] as V3]), 0.01);
  if (platform) out.push(platform);
  const lamp = boxOf("headlamp", pose, aspect, [headlamp], 0.03);
  if (lamp) out.push(lamp);
  return out;
}
