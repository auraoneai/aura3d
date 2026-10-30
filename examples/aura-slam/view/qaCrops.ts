/**
 * GU47 WP-11: named QA crops for the remote luma capture (E-I contract: `window.__AURA_QA__.crops`, rects normalised
 * 0..1 to the main canvas, updated as the camera moves). Each crop is a world-space box projected through the live
 * camera pose, so the acceptance probes of TT-L1, TT-L2, TT-M1, TT-M2, TT-C1, TT-P2 and TT-H1 read the right pixels.
 * Presentation only: reads athlete and ball positions.
 */
import type { CameraPose, ProjectedPoint } from "./camera";
import { BASELINE_Z, COURT_X, COURT_Z, SERVICE_Z } from "./constants";
import type { Vec3 } from "../contract/units";

export interface QaCrop { readonly name: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export type Projector = (wx: number, wy: number, wz: number) => ProjectedPoint;

export interface QaCropInput {
  readonly width: number;
  readonly height: number;
  readonly project: Projector;
  /** Athletes in sim units (x across, y along the court; the player is the near one). */
  readonly player: { readonly x: number; readonly y: number };
  readonly rival: { readonly x: number; readonly y: number };
  /** The drawn ball in scene metres. */
  readonly ball: Vec3;
}

/** Normalised screen rect of a set of world points (null if any point is behind the camera). */
function rectOf(points: readonly Vec3[], input: QaCropInput, name: string, minPx = 4): QaCrop | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, z] of points) {
    const p = input.project(x, y, z);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.ndc[2] > 1 || p.ndc[2] < -1) return null;
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const w = Math.max(minPx, x1 - x0), h = Math.max(minPx, y1 - y0);
  const nx = Math.max(0, (cx - w / 2) / input.width), ny = Math.max(0, (cy - h / 2) / input.height);
  const nw = Math.min(1 - nx, w / input.width), nh = Math.min(1 - ny, h / input.height);
  if (nw <= 0 || nh <= 0) return null;
  return { name, x: nx, y: ny, w: nw, h: nh };
}

/** Axis-aligned world box corners. */
const box = (cx: number, cz: number, hx: number, y0: number, y1: number, hz = 0.05): Vec3[] => {
  const out: Vec3[] = [];
  for (const dx of [-hx, hx]) for (const y of [y0, y1]) for (const dz of [-hz, hz]) out.push([cx + dx, y, cz + dz]);
  return out;
};

export const QA_CROP_NAMES = [
  "athlete-near", "athlete-far", "torso-near", "feet-near", "court-beside-near", "ball", "net-band", "service-line",
  "court-centre", "far-stand", "far-athlete-head"
] as const;

/** The crops for this frame (names in QA_CROP_NAMES; a crop off screen is left out). */
export function slamQaCrops(input: QaCropInput): QaCrop[] {
  const nx = input.player.x * COURT_X, nz = input.player.y * COURT_Z;
  const fx = input.rival.x * COURT_X, fz = input.rival.y * COURT_Z;
  const [bx, by, bz] = input.ball;
  const crops = [
    rectOf(box(nx, nz, 0.45, 0, 1.9), input, "athlete-near"),
    rectOf(box(fx, fz, 0.45, 0, 1.9), input, "athlete-far"),
    rectOf(box(nx, nz, 0.22, 1.05, 1.45), input, "torso-near"),
    rectOf(box(nx, nz, 0.3, 0, 0.08, 0.3), input, "feet-near"),
    rectOf(box(nx + (nx > 0 ? -1.3 : 1.3), nz, 0.3, 0, 0.02, 0.3), input, "court-beside-near"),
    rectOf(box(bx, bz, 0.08, by - 0.08, by + 0.08), input, "ball", 3),
    rectOf(box(0, 0, 4.5, 0.25, 0.85, 0.02), input, "net-band"),
    rectOf(box(0, SERVICE_Z, 1.2, 0, 0.02, 0.06), input, "service-line"),
    rectOf(box(0, BASELINE_Z * 0.25, 1.5, 0, 0.02, 1), input, "court-centre"),
    rectOf(box(0, -13.5, 6, 1.2, 3.6, 0.5), input, "far-stand"),
    rectOf(box(fx, fz, 0.16, 1.55, 1.85), input, "far-athlete-head")
  ];
  return crops.filter((c): c is QaCrop => c !== null);
}
