/**
 * QA crops for E-I's capture (`window.__AURA_QA__.crops`): named rects normalised 0..1 to the canvas, projected each
 * publish from the live camera pose with a pinhole model (the same eye, target and vertical fov the route hands to
 * `camera.setPose`). Points behind the camera or off screen are dropped; rects are clamped to the canvas.
 */
export type V3 = readonly [number, number, number];

export interface QaCrop {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface QaCropSubject {
  readonly name: string;
  readonly at: V3;
  /** Half-extent of the crop in metres (horizontal, vertical). */
  readonly half: readonly [number, number];
}

const sub = (a: V3, b: V3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): [number, number, number] => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Project one subject to a normalised rect (top-left origin), or null when it is behind the eye or off screen. */
export function projectCrop(eye: V3, target: V3, fovDeg: number, aspect: number, subject: QaCropSubject): QaCrop | null {
  const f = norm(sub(target, eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(subject.at, eye);
  const z = dot(d, f);
  if (z <= 0.1) return null;
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const nx = dot(d, r) / (z * t * aspect);
  const ny = dot(d, u) / (z * t);
  const hw = subject.half[0] / (z * t * aspect);
  const hh = subject.half[1] / (z * t);
  const x0 = Math.max(0, (nx - hw + 1) / 2), x1 = Math.min(1, (nx + hw + 1) / 2);
  const y0 = Math.max(0, (1 - (ny + hh)) / 2), y1 = Math.min(1, (1 - (ny - hh)) / 2);
  if (x1 <= x0 || y1 <= y0) return null;
  const round = (v: number) => Math.round(v * 1e4) / 1e4;
  return { name: subject.name, x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) };
}

export function projectCrops(eye: V3, target: V3, fovDeg: number, aspect: number, subjects: readonly QaCropSubject[]): QaCrop[] {
  const out: QaCrop[] = [];
  for (const s of subjects) {
    const c = projectCrop(eye, target, fovDeg, aspect, s);
    if (c) out.push(c);
  }
  return out;
}
