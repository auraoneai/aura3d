/**
 * Slingshot Siege — GU47 presentation helpers (WP-22 SS47-P1, SS47-C1, QA crops). Pure functions over projected
 * screen points and the camera clock: nothing here reads or writes the sim, so gameplay and replays are untouched.
 */

/** A projected screen point in CSS pixels (as `projectWorld` returns it). */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
  readonly behind?: boolean;
}

/** One E-I QA crop: normalised 0..1 frame rectangle (x, y from the top-left). */
export interface QaCrop {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Normalised bounding rectangle of projected points with a pixel pad, clamped to the frame. Points behind the
 * camera are ignored; no point in front returns null (the crop is left out of the list).
 */
export function screenCrop(name: string, points: readonly ScreenPoint[], width: number, height: number, padPx = 6): QaCrop | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    if (p.behind || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  if (!Number.isFinite(x0) || width <= 0 || height <= 0) return null;
  const nx0 = clamp01((x0 - padPx) / width);
  const ny0 = clamp01((y0 - padPx) / height);
  const nx1 = clamp01((x1 + padPx) / width);
  const ny1 = clamp01((y1 + padPx) / height);
  if (nx1 - nx0 < 1e-3 || ny1 - ny0 < 1e-3) return null;
  const r = (v: number): number => Math.round(v * 10000) / 10000;
  return { name, x: r(nx0), y: r(ny0), w: r(nx1 - nx0), h: r(ny1 - ny0) };
}

/** The eight corners of an axis-aligned box. */
export function boxCorners(min: readonly [number, number, number], max: readonly [number, number, number]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
}

/** Fixed world boxes the capture compares against the fort (SS47-P1 far headland, SS47-P2 sand, SS47-E3 sea). */
export const QA_WORLD_BOXES = {
  /** The middle far headland across the bay (stage.ts headland 3). */
  farHeadland: { min: [1, 0.3, -26.4], max: [7, 2.4, -23.6] },
  /** The sandy footpath between the sling and the fort (the beach ring is a thin strip at the camera's side). */
  sand: { min: [-5.5, 0, 0.35], max: [-1, 0.03, 1.15] },
  /** Open sea to the left of the island, in front of the camera. */
  sea: { min: [-16, -0.26, 2], max: [-11.5, -0.26, 7] }
} as const;

/** Tilt-shift band (frame-height units, 0 top) the signature DOF keeps sharp. */
export interface TiltShiftBand {
  readonly bandCenter: number;
  readonly bandWidth: number;
}

/**
 * SS47-P1: a band that holds the fort, the sling and the live shot. The centre is the midpoint of the extremes
 * (so neither end falls out), the width covers their spread plus a margin and never drops below the chapter's
 * authored width; clamped to [0.18, 0.62] so a tall arc never turns the whole frame sharp.
 */
export function tiltShiftBand(ys: readonly number[], minWidth: number, margin = 0.08): TiltShiftBand {
  const finite = ys.filter((y) => Number.isFinite(y)).map(clamp01);
  if (finite.length === 0) return { bandCenter: 0.52, bandWidth: minWidth };
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const width = Math.min(0.62, Math.max(minWidth, 0.18, hi - lo + margin * 2));
  const center = Math.min(1 - width / 4, Math.max(width / 4, (lo + hi) / 2));
  return { bandCenter: Math.round(center * 1000) / 1000, bandWidth: Math.round(width * 1000) / 1000 };
}

/** True when the band moved enough to be worth a post patch (avoids a setEffect call every frame). */
export function bandChanged(a: TiltShiftBand | null, b: TiltShiftBand, eps = 0.004): boolean {
  return !a || Math.abs(a.bandCenter - b.bandCenter) > eps || Math.abs(a.bandWidth - b.bandWidth) > eps;
}
