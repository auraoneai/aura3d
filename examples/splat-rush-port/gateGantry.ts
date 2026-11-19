/**
 * Splat paint-gate gantry (pass-through QA, owner 2026-11-18: the ball visibly rolled through gate posts).
 *
 * The sim resolves each row of three gates (lanes -2.3, 0, 2.3) against the NEAREST gate with a 1.2 m pass window, so the
 * windows of a row cover the whole road (-3.5..3.5) without a gap: wherever the ball is, it goes through one gate face
 * (a match, or an OUCH on a wrong colour). Any post between two lanes therefore stands inside some gate's pass window
 * plus the ball's radius, and the ball rolls through it. The drawn gates are rebuilt as one gantry per row instead
 * (presentation only; the sim is untouched):
 * - every gate draws its own crossbar segment (one lane wide, so the row's segments read as one beam), its drips and its
 *   pigment curtain filling the lane up to the bar;
 * - only the two OUTER gates draw a post, on the outside, at |x| = GANTRY_POST_X, beyond the steering clamp plus the
 *   largest ball radius; the bar is raised so the largest ball rolls under it.
 * Variants share one topology (the centre gate's post assembly is folded to a point inside the bar), so all gates stay
 * in one batch: `place(slot, ..., gantryVariant(laneX))`.
 */
import { capsuleMesh, gateDripMesh, mergeMeshes, revolveProfileMesh, transformMesh, type MeshData } from "./meshes";

/** The 0.32 group scale of the original gate (gate space -> metres). */
export const GATE_SCALE = 0.32;
/** Sim: lane spacing, pass window (|ball - nearest gate| < 1.2), steering clamp, ball radius and max ball scale. */
export const SIM_LANE = 2.3;
export const SIM_PASS_WINDOW = 1.2;
export const SIM_STEER_CLAMP = 3;
export const BALL_MAX_RADIUS = 0.55 * 1.6;
/** Gate space: crossbar centre height (was 4.92) and the outer post's x from its gate's centre. */
export const BAR_Y = 6.4;
export const BAR_RADIUS = 0.52;
export const POST_RADIUS = 0.46;
export const POST_X = 5.8;
/** Metres: post centre from the road centre, its footprint radius, and the bar's underside. */
export const GANTRY_POST_X = SIM_LANE + POST_X * GATE_SCALE;
/** (the shoulder collars, radius 0.5, are the widest part of the post) */
export const GANTRY_POST_RADIUS = 0.5 * GATE_SCALE;
export const GANTRY_BAR_BOTTOM = (BAR_Y - BAR_RADIUS) * GATE_SCALE;
/** Metres: half the lane a gate's own bar segment and curtain span. */
export const GANTRY_LANE_HALF = 1.165;
/** Metres: the curtain's half-width and top (just under the bar). */
export const CURTAIN_HALF = 1.1;
export const CURTAIN_TOP = GANTRY_BAR_BOTTOM - 0.02;
/** Gate space: how much the drips are lifted with the bar and spread across the wider lane. */
const DRIP_LIFT = BAR_Y - 4.92;
const DRIP_SPREAD = 1.4;

export type GantrySide = -1 | 0 | 1;
/** The gate's side of the row: -1 left (post on its left), 1 right, 0 centre (no post). */
export const gantrySide = (laneX: number): GantrySide => (laneX < -0.1 ? -1 : laneX > 0.1 ? 1 : 0);

function rotateHalfTurn(m: MeshData): MeshData {
  // 180 degrees about y (x -> -x, z -> -z): keeps the winding, unlike a mirror
  const out: MeshData = { positions: m.positions.slice(), normals: m.normals.slice(), uvs: m.uvs.slice(), indices: m.indices.slice() };
  for (let i = 0; i < out.positions.length; i += 3) {
    out.positions[i] = -(out.positions[i] as number); out.positions[i + 2] = -(out.positions[i + 2] as number);
    out.normals[i] = -(out.normals[i] as number); out.normals[i + 2] = -(out.normals[i + 2] as number);
  }
  return out;
}

function foldToPoint(m: MeshData, at: readonly [number, number, number]): MeshData {
  const out: MeshData = { positions: [], normals: [], uvs: m.uvs.slice(), indices: m.indices.slice() };
  for (let i = 0; i < m.positions.length; i += 3) { out.positions.push(at[0], at[1], at[2]); out.normals.push(0, 1, 0); }
  return out;
}

function liftAndSpread(m: MeshData, lift: number, spread: number): MeshData {
  const out: MeshData = { positions: m.positions.slice(), normals: m.normals.slice(), uvs: m.uvs.slice(), indices: m.indices.slice() };
  for (let i = 0; i < out.positions.length; i += 3) {
    out.positions[i] = (out.positions[i] as number) * spread;
    out.positions[i + 1] = (out.positions[i + 1] as number) + lift;
    const nx = (out.normals[i] as number) / spread, ny = out.normals[i + 1] as number, nz = out.normals[i + 2] as number;
    const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
    out.normals[i] = nx * inv; out.normals[i + 1] = ny * inv; out.normals[i + 2] = nz * inv;
  }
  return out;
}

/** Gate space: the gate's own bar segment (+ lifted, spread drips in carnival). */
function baseParts(carnival: boolean): MeshData[] {
  const radial = carnival ? 32 : 16, caps = carnival ? 14 : 6;
  const barLen = 2 * (GANTRY_LANE_HALF / GATE_SCALE - BAR_RADIUS);
  const bar = transformMesh(capsuleMesh(BAR_RADIUS, barLen, radial, caps), { rz: Math.PI / 2, ty: BAR_Y });
  return carnival ? [bar, liftAndSpread(gateDripMesh(), DRIP_LIFT, DRIP_SPREAD)] : [bar];
}

/** Gate space: the right-hand outer post, its collars and the bar run out to it. */
function postAssembly(carnival: boolean): MeshData {
  const radial = carnival ? 32 : 16, caps = carnival ? 14 : 6;
  const postLen = BAR_Y - 2 * POST_RADIUS;
  const post = transformMesh(capsuleMesh(POST_RADIUS, postLen, radial, caps), { tx: POST_X, ty: BAR_Y / 2 });
  const from = GANTRY_LANE_HALF / GATE_SCALE - BAR_RADIUS, to = POST_X;
  const run = transformMesh(capsuleMesh(BAR_RADIUS, to - from, radial, caps), { rz: Math.PI / 2, tx: (from + to) / 2, ty: BAR_Y });
  if (!carnival) return mergeMeshes([post, run]);
  const collar = revolveProfileMesh([[0.44, 0], [0.5, 0.07], [0.5, 0.21], [0.44, 0.28]], 32);
  for (let v = 1; v < collar.uvs.length; v += 2) collar.uvs[v] = 0;
  return mergeMeshes([post, run, transformMesh(collar, { tx: POST_X, ty: 0.34 }), transformMesh(collar, { tx: POST_X, ty: BAR_Y - 0.84 })]);
}

export interface GantryVariants {
  readonly left: MeshData;
  readonly center: MeshData;
  readonly right: MeshData;
  of(side: GantrySide): MeshData;
}

/** The three gate variants in metres (0.32 scale applied), one topology. */
export function gantryGateMeshes(carnival: boolean): GantryVariants {
  const base = baseParts(carnival);
  const post = postAssembly(carnival);
  const build = (assembly: MeshData) => transformMesh(mergeMeshes([...base, assembly]), { scale: GATE_SCALE });
  const right = build(post), left = build(rotateHalfTurn(post)), center = build(foldToPoint(post, [0, BAR_Y, 0]));
  return { left, center, right, of: (s) => (s < 0 ? left : s > 0 ? right : center) };
}

/** Translucent pigment curtain filling a gate's lane up to the raised bar (17 x 9 vertices, like `gateCurtainMesh`). */
export function gantryCurtainMesh(): MeshData {
  const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const cols = 16, rows = 8;
  const x0 = -CURTAIN_HALF, x1 = CURTAIN_HALF, y0 = 0.02, y1 = CURTAIN_TOP;
  for (let iy = 0; iy <= rows; iy++) {
    const v = iy / rows;
    const y = y0 + (y1 - y0) * v;
    for (let ix = 0; ix <= cols; ix++) {
      const u = ix / cols;
      const x = x0 + (x1 - x0) * u;
      const bow = 0.024 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
      const nx = -0.05 * Math.cos(u * Math.PI) * Math.sin(v * Math.PI);
      const inv = 1 / Math.hypot(nx, 1);
      m.positions.push(x, y, bow);
      m.normals.push(nx * inv, 0, inv);
      m.uvs.push(u, v);
    }
  }
  const stride = cols + 1;
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const a = iy * stride + ix, b = a + 1, c = (iy + 1) * stride + ix, d = c + 1;
      m.indices.push(a, b, c, b, d, c);
    }
  }
  return m;
}

/**
 * Soft cel shadow of a gantry gate on the deck (metres, local gate frame): the bar strip across its lane and, for an
 * outer gate, the post strip at the post; the centre gate's post strip is folded away. Three quads in every variant.
 */
export function gantryShadowMesh(length: number, skew: number, side: GantrySide): MeshData {
  const out: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const quad = (x0: number, x1: number, z0: number, z1: number, fold = false): void => {
    const b = out.positions.length / 3;
    for (const [x, z, u, v] of [[x0 + skew * z0, z0, 0, 0], [x1 + skew * z0, z0, 1, 0], [x1 + skew * z1, z1, 1, 1], [x0 + skew * z1, z1, 0, 1]] as const) {
      out.positions.push(fold ? 0 : x, 0, fold ? 0 : z); out.normals.push(0, 1, 0); out.uvs.push(u, v);
    }
    out.indices.push(b, b + 2, b + 1, b, b + 3, b + 2);
  };
  const px = POST_X * GATE_SCALE, w = 0.2;
  quad(px - w, px + w, -0.15, length, side <= 0);
  quad(-px - w, -px + w, -0.15, length, side >= 0);
  quad(-GANTRY_LANE_HALF, GANTRY_LANE_HALF, length * 0.82, length * 1.12);
  return out;
}
