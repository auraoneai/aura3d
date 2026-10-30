/**
 * GU47 QA crops for E-I's capture (`window.__AURA_QA__.crops`, normalised 0..1 rects, updated as the camera moves). The chase
 * camera never moves in world space (the world moves past it), so a pinhole projection of the authored camera is exact up to
 * the speed FOV kick and the shake, which the crops absorb with a margin.
 */

export interface QaCrop {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

type V3 = readonly [number, number, number];

/** The authored chase camera (main.ts camera.perspective). */
export const CHASE_CAMERA = { position: [0, 3.6, 6.2] as V3, target: [0, 0.9, -6.0] as V3, fovDeg: 58 } as const;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const FORWARD = norm(sub(CHASE_CAMERA.target, CHASE_CAMERA.position));
const RIGHT = norm(cross(FORWARD, [0, 1, 0]));
const UP = cross(RIGHT, FORWARD);

/** Screen position (0..1, y down) of a world point for the chase camera, or null when it is behind the camera. */
export function projectChase(point: V3, aspect: number, fovDeg: number = CHASE_CAMERA.fovDeg): { x: number; y: number } | null {
  const v = sub(point, CHASE_CAMERA.position);
  const z = dot(v, FORWARD);
  if (z <= 0.01) return null;
  const t = Math.tan(((fovDeg * Math.PI) / 180) / 2);
  const ndcX = dot(v, RIGHT) / (z * t * Math.max(aspect, 1e-3));
  const ndcY = dot(v, UP) / (z * t);
  return { x: (ndcX + 1) / 2, y: (1 - ndcY) / 2 };
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** A rect around a centre, clamped to the frame. */
export function cropAround(name: string, cx: number, cy: number, halfW: number, halfH: number): QaCrop {
  const x0 = clamp01(cx - halfW);
  const y0 = clamp01(cy - halfH);
  const x1 = clamp01(cx + halfW);
  const y1 = clamp01(cy + halfH);
  return { name, x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Bounding rect of a box (centre, half extents) projected by the chase camera; null when any corner is behind it. */
export function projectBox(name: string, center: V3, half: V3, aspect: number): QaCrop | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = projectChase([center[0] + sx * half[0], center[1] + sy * half[1], center[2] + sz * half[2]], aspect);
    if (!p) return null;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const x0 = clamp01(minX);
  const y0 = clamp01(minY);
  return { name, x: x0, y: y0, w: Math.max(0, clamp01(maxX) - x0), h: Math.max(0, clamp01(maxY) - y0) };
}

/**
 * The crops the WP-12 acceptance names: `sun` (the disc and inner corona), `sky` (top-centre), `road` (bottom-centre deck),
 * `horizon` (the tangerine band under the sun) and `hero` (the player car).
 */
export function apexQaCrops(sunWorld: V3, heroCenter: V3, aspect: number): QaCrop[] {
  const crops: QaCrop[] = [
    { name: "sky", x: 0.35, y: 0, w: 0.3, h: 0.22 },
    { name: "road", x: 0.3, y: 0.74, w: 0.4, h: 0.26 }
  ];
  const sun = projectChase(sunWorld, aspect);
  if (sun && sun.x > -0.1 && sun.x < 1.1 && sun.y > -0.1 && sun.y < 1.1) {
    crops.push(cropAround("sun", sun.x, sun.y, 0.06 / Math.max(aspect, 0.5), 0.06));
    crops.push(cropAround("horizon", sun.x, sun.y + 0.03, 0.22, 0.03));
  }
  const hero = projectBox("hero", heroCenter, [1.12, 0.66, 2.2], aspect);
  if (hero) crops.push(hero);
  return crops;
}
