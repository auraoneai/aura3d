/**
 * Named QA crops for the GU47 steady-state capture (E-I crop contract): `window.__AURA_QA__.crops` is a function the
 * capture calls at every shot, so the rects follow the broadcast camera. Rects are normalised 0..1 to the canvas,
 * origin top-left. Crops: `infield` (the dirt square), `outfield-wall` (centre field wall), `board` (scoreboard screen),
 * `batter` (the batter's box), `sky` (fixed top band). Pure math; reads the camera pose only.
 */
import { fencePoint, scoreboardPlacement, type ParkSpec, type Vec3 } from "../src/rules";

export interface QaCrop {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface QaCameraPose {
  readonly eye: Vec3;
  readonly target: Vec3;
  /** Vertical field of view, degrees. */
  readonly fov: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Screen rect (0..1, top-left) of world points seen from `pose`, clipped to the frame; null when none is in front. */
export function projectRect(pose: QaCameraPose, aspect: number, points: readonly Vec3[]): Omit<QaCrop, "name"> | null {
  const f = norm(sub(pose.target, pose.eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const t = Math.tan((pose.fov * Math.PI) / 360);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    const d = sub(p, pose.eye);
    const z = dot(d, f);
    if (z <= 0.2) continue;
    const sx = (dot(d, r) / (z * t * aspect) + 1) / 2;
    const sy = (1 - dot(d, u) / (z * t)) / 2;
    x0 = Math.min(x0, sx);
    x1 = Math.max(x1, sx);
    y0 = Math.min(y0, sy);
    y1 = Math.max(y1, sy);
  }
  if (!Number.isFinite(x0)) return null;
  const cx0 = Math.max(0, x0);
  const cy0 = Math.max(0, y0);
  const cx1 = Math.min(1, x1);
  const cy1 = Math.min(1, y1);
  if (cx1 - cx0 < 0.005 || cy1 - cy0 < 0.005) return null;
  return { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 };
}

const box = (min: Vec3, max: Vec3): Vec3[] => {
  const out: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
};

/** The crops of a park from the current camera; crops out of frame are left out. */
export function diamondCrops(park: ParkSpec, pose: QaCameraPose, aspect: number): QaCrop[] {
  const out: QaCrop[] = [];
  const add = (name: string, rect: Omit<QaCrop, "name"> | null): void => {
    if (rect) out.push({ name, ...rect });
  };
  add("infield", projectRect(pose, aspect, box([-13, 0, -27], [13, 0.05, 1])));
  const wall: Vec3[] = [];
  for (const theta of [-12, -6, 0, 6, 12]) {
    const p = fencePoint(park, theta, 0);
    wall.push([p[0], 0, p[2]], [p[0], park.wallH, p[2]]);
  }
  add("outfield-wall", projectRect(pose, aspect, wall));
  const sb = scoreboardPlacement(park).screen;
  add("board", projectRect(pose, aspect, box([sb[0] - 5.25, sb[1] - 1.7, sb[2] - 0.2], [sb[0] + 5.25, sb[1] + 1.7, sb[2] + 0.2])));
  add("batter", projectRect(pose, aspect, box([-1.3, 0, -0.3], [0.1, 2.1, 1.1])));
  out.push({ name: "sky", x: 0, y: 0, w: 1, h: 0.16 });
  return out;
}
