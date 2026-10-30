/**
 * GU47 WP-35 QA crops for the steady-state capture (E-I crop contract, `window.__AURA_QA__.crops` / the hook's `crops`
 * extra): normalised 0..1 rects on the main canvas, origin top-left, re-read at every shot so the hero box follows the
 * camera. Named after the WP's acceptance lines: `sky-top` (CD-05 top cells), `rainbow` (antisolar band, CD-05), `track`
 * (CD-12 centre band), `hero` (CD-03 silhouette ring, CD-02 shadow under the runner), `horizon` (CD-07 far mesas).
 */
export type V3 = readonly [number, number, number];
export interface QaCrop { readonly name: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface QaView { readonly eye: V3; readonly target: V3; readonly fov: number; readonly aspect: number; readonly hero: V3 }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Screen position (0..1, top-left origin) of a world point, or null behind the camera. */
export function project(view: QaView, p: V3): { x: number; y: number } | null {
  const f = norm(sub(view.target, view.eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const d = sub(p, view.eye), z = dot(d, f);
  if (z <= 0.05) return null;
  const t = Math.tan((view.fov * Math.PI) / 360);
  return { x: 0.5 + (dot(d, r) / (z * t * Math.max(view.aspect, 1e-3))) * 0.5, y: 0.5 - (dot(d, u) / (z * t)) * 0.5 };
}

export function cumulusCrops(view: QaView | null): QaCrop[] {
  const crops: QaCrop[] = [
    { name: "sky-top", x: 0, y: 0, w: 1, h: 0.18 },
    { name: "horizon", x: 0, y: 0.34, w: 1, h: 0.1 },
    { name: "track", x: 0.36, y: 0.72, w: 0.28, h: 0.26 }
  ];
  if (!view) return crops;
  const feet = project(view, view.hero), head = project(view, [view.hero[0], view.hero[1] + 1.5, view.hero[2]]);
  if (feet && head) {
    const h = Math.abs(feet.y - head.y), w = (h * 0.6) / Math.max(view.aspect, 1e-3) * 1.0;
    const x0 = clamp01(feet.x - w / 2), y0 = clamp01(Math.min(feet.y, head.y) - h * 0.05);
    const x1 = clamp01(feet.x + w / 2), y1 = clamp01(Math.max(feet.y, head.y) + h * 0.1);
    if (x1 > x0 && y1 > y0) crops.push({ name: "hero", x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  crops.push({ name: "rainbow", x: 0, y: 0.18, w: 1, h: 0.2 });
  return crops;
}
