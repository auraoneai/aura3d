/**
 * GU47 QA crops for the E-I capture (`tests/browser/game-luma-stats.ts` crop contract): rects normalised 0..1 to the
 * canvas, origin top-left. The car crop follows the projected box of the player car (the camera is fixed, so the box
 * only moves with lanes and camera modes); the rest are fixed regions the WP-14 acceptance lines name.
 */
export interface QaCrop { readonly name: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** Fixed regions: the sky above the marine deck, the skyline band, both facades, the road row and the headlight pool. */
export const STATIC_CROPS: readonly QaCrop[] = [
  { name: "sky-top", x: 0, y: 0, w: 1, h: 0.14 },
  { name: "skyline", x: 0.2, y: 0.14, w: 0.6, h: 0.2 },
  { name: "facade-left", x: 0, y: 0.25, w: 0.18, h: 0.4 },
  { name: "facade-right", x: 0.82, y: 0.25, w: 0.18, h: 0.4 },
  { name: "road", x: 0.25, y: 0.86, w: 0.5, h: 0.14 },
  { name: "headlight-pool", x: 0.38, y: 0.5, w: 0.24, h: 0.12 },
  { name: "headlight-side-l", x: 0.14, y: 0.5, w: 0.24, h: 0.12 },
  { name: "headlight-side-r", x: 0.62, y: 0.5, w: 0.24, h: 0.12 }
];

type Project = (p: readonly [number, number, number]) => { x: number; y: number; visible: boolean };

/** Screen box of the car (view-space centre x/z, ground y, size), clamped to the canvas; null when off screen. */
export function carCrop(project: Project, vw: number, vh: number, car: { readonly x: number; readonly y: number; readonly z: number; readonly width: number; readonly height: number; readonly length: number }): QaCrop | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const dx of [-0.5, 0.5]) for (const dy of [0, 1]) for (const dz of [-0.5, 0.5]) {
    const p = project([car.x + dx * car.width, car.y + dy * car.height, car.z + dz * car.length]);
    if (!p.visible) continue;
    xs.push(p.x / vw);
    ys.push(p.y / vh);
  }
  if (xs.length < 2) return null;
  const c = (v: number) => Math.min(1, Math.max(0, v));
  const x0 = c(Math.min(...xs));
  const y0 = c(Math.min(...ys));
  const w = c(Math.max(...xs)) - x0;
  const h = c(Math.max(...ys)) - y0;
  return w > 0.005 && h > 0.005 ? { name: "car", x: x0, y: y0, w, h } : null;
}
