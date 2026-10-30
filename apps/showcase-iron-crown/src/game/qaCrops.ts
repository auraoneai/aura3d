/**
 * IRON CROWN QA crops (GU47 WP-15, E-I capture hook): the named regions the IC47-L1 acceptance measures, published as
 * `window.__AURA_QA__.crops = [{ name, x, y, w, h }]`, normalised 0..1 to the canvas (x right, y down), and updated as
 * the camera moves.
 *
 * - `fighter-p1`, `fighter-p2`: each fighter's projected box (1.8 m tall, 0.9 m wide, 0.6 m deep).
 * - `foot-p1`, `foot-p2`: the bottom 15% of that box (the contact shadow and foot pool; "15% darker").
 * - `outer-ring-left`, `outer-ring-right`: the frame's side bands inside the letterbox, the area the single follow-spot
 *   leaves dark (chiaroscuro). A crop is a rectangle, so the outer ring is published as its two side bands.
 *
 * Pure: the view-projection is the camera's presented matrix (`app.camera.evidence().viewProjection`, column-major).
 */
export interface QaCrop {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

type Vec3 = readonly [number, number, number];

export const QA_FIGHTER_BOX = { height: 1.8, halfWidth: 0.45, halfDepth: 0.3, footShare: 0.15 } as const;
export const QA_OUTER_RING = { width: 0.1, top: 0.3, bottom: 0.85 } as const;

/** World point to normalised screen (x right, y down); `null` behind the camera or for a malformed matrix. */
export function projectToScreen(vp: readonly number[], p: Vec3): readonly [number, number] | null {
  if (vp.length !== 16) return null;
  const cx = vp[0]! * p[0] + vp[4]! * p[1] + vp[8]! * p[2] + vp[12]!;
  const cy = vp[1]! * p[0] + vp[5]! * p[1] + vp[9]! * p[2] + vp[13]!;
  const cw = vp[3]! * p[0] + vp[7]! * p[1] + vp[11]! * p[2] + vp[15]!;
  if (!(cw > 1e-6)) return null;
  return [(cx / cw + 1) / 2, (1 - cy / cw) / 2];
}

const round = (v: number) => Number(v.toFixed(4));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Screen rectangle of a world box `[x0..x1] x [y0..y1] x [z0..z1]`; `null` when off screen or behind the camera. */
function boxCrop(name: string, vp: readonly number[], min: Vec3, max: Vec3): QaCrop | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const s = projectToScreen(vp, [x, y, z]);
        if (!s) return null;
        x0 = Math.min(x0, s[0]);
        x1 = Math.max(x1, s[0]);
        y0 = Math.min(y0, s[1]);
        y1 = Math.max(y1, s[1]);
      }
    }
  }
  const cx0 = clamp01(x0);
  const cy0 = clamp01(y0);
  const w = clamp01(x1) - cx0;
  const h = clamp01(y1) - cy0;
  if (w <= 0 || h <= 0) return null;
  return { name, x: round(cx0), y: round(cy0), w: round(w), h: round(h) };
}

/** The crops for the current frame; fighters are `{ id, position }` with `position` at the feet. */
export function fightCrops(vp: readonly number[], fighters: readonly { readonly id: "p1" | "p2"; readonly position: Vec3 }[]): QaCrop[] {
  const crops: QaCrop[] = [];
  const b = QA_FIGHTER_BOX;
  for (const f of fighters) {
    const [x, y, z] = f.position;
    const body = boxCrop(`fighter-${f.id}`, vp, [x - b.halfWidth, y, z - b.halfDepth], [x + b.halfWidth, y + b.height, z + b.halfDepth]);
    const foot = boxCrop(`foot-${f.id}`, vp, [x - b.halfWidth, y, z - b.halfDepth], [x + b.halfWidth, y + b.height * b.footShare, z + b.halfDepth]);
    if (body) crops.push(body);
    if (foot) crops.push(foot);
  }
  const r = QA_OUTER_RING;
  crops.push(
    { name: "outer-ring-left", x: 0, y: r.top, w: r.width, h: round(r.bottom - r.top) },
    { name: "outer-ring-right", x: round(1 - r.width), y: r.top, w: r.width, h: round(r.bottom - r.top) }
  );
  return crops;
}
