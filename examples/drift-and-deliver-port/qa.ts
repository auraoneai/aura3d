/**
 * Gridlock Courier (GU47 WP-28): the QA crops E-I's steady-state capture reads (`window.__AURA_QA__.crops`). Rects are
 * normalised 0..1 to the canvas, origin top-left, recomputed every read from the camera pose so the courier box
 * follows the car. Pure (no DOM): `main.ts` passes the pose and the aspect.
 */
export interface Crop { readonly name: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface Pose { readonly eye: readonly [number, number, number]; readonly target: readonly [number, number, number]; readonly fovDeg: number; readonly aspect: number }

/** Projects a world point to normalised screen (0..1, top-left); null behind the camera. */
export function project(p: readonly [number, number, number], pose: Pose): [number, number] | null {
  const [ex, ey, ez] = pose.eye;
  let fx = pose.target[0] - ex, fy = pose.target[1] - ey, fz = pose.target[2] - ez;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  // right = forward x up(0,1,0); up' = right x forward
  let rx = -fz, rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl; rz /= rl;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const dx = p[0] - ex, dy = p[1] - ey, dz = p[2] - ez;
  const zc = dx * fx + dy * fy + dz * fz;
  if (zc <= 0.05) return null;
  const xc = dx * rx + dz * rz;
  const yc = dx * ux + dy * uy + dz * uz;
  const t = Math.tan((pose.fovDeg * Math.PI) / 360);
  return [0.5 + (xc / (zc * t * pose.aspect)) * 0.5, 0.5 - (yc / (zc * t)) * 0.5];
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Screen box of a car-sized box (half extents) at (x, z) facing `heading`; null when off screen. */
export function carBox(x: number, z: number, heading: number, pose: Pose, half = { w: 1.0, l: 2.2, h: 1.5 }): Crop | null {
  const s = Math.sin(heading), c = Math.cos(heading);
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0, seen = 0;
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const y of [0, half.h]) {
    const px = x + s * half.l * a + c * half.w * b;
    const pz = z + c * half.l * a - s * half.w * b;
    const q = project([px, y, pz], pose);
    if (!q) continue;
    seen++;
    x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
  }
  if (!seen) return null;
  x0 = clamp01(x0); x1 = clamp01(x1); y0 = clamp01(y0); y1 = clamp01(y1);
  if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) return null;
  return { name: "courier", x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The named crops: `courier` (GC-C2, GC-M3), `under-car` (GC-L3, a strip under the car box), `road-bottom` (GC-M1,
 * bottom third), `sky-top` (GC-S1, GC-L6 top hue), `horizon` (GC-S2 skyline band), `far-third` (GC-S3) and `beacon`
 * (GC-V2, projected pillar) when a job is open.
 */
export function shiftCrops(car: { x: number; z: number; heading: number }, pose: Pose, beacon: { x: number; z: number } | null): Crop[] {
  const out: Crop[] = [
    { name: "road-bottom", x: 0, y: 2 / 3, w: 1, h: 1 / 3 },
    { name: "sky-top", x: 0, y: 0, w: 1, h: 0.18 },
    { name: "horizon", x: 0, y: 0.3, w: 1, h: 0.12 },
    { name: "far-third", x: 0, y: 0.2, w: 1, h: 0.25 }
  ];
  const box = carBox(car.x, car.z, car.heading, pose);
  if (box) {
    out.push(box);
    const y = clamp01(box.y + box.h * 0.85);
    out.push({ name: "under-car", x: box.x, y, w: box.w, h: Math.max(0.005, Math.min(1 - y, box.h * 0.25)) });
  }
  if (beacon) {
    const base = project([beacon.x, 0, beacon.z], pose);
    const top = project([beacon.x, 70, beacon.z], pose);
    if (base && top) {
      const x = clamp01(Math.min(base[0], top[0]) - 0.01);
      const y0 = clamp01(Math.min(base[1], top[1]));
      const y1 = clamp01(Math.max(base[1], top[1]));
      if (y1 - y0 > 0.002 && x < 1) out.push({ name: "beacon", x, y: y0, w: Math.min(0.02 + Math.abs(base[0] - top[0]), 1 - x), h: y1 - y0 });
    }
  }
  return out;
}
