/**
 * Shared G1-continuous SDF limb chains (shoulder -> elbow -> wrist -> mitten hand, hip -> knee -> ankle).
 *
 * Each limb is ONE implicit surface: tapered capsules smooth-unioned (`sminPoly`) at every joint, so there is no
 * socket sphere, no capped-tube crease, and no gap at shoulders, elbows, hips, or knees. Hands are sculpted mittens
 * (palm + curled finger mitt + opposed thumb) in a local wrist frame instead of scaled icospheres. `tagAt` reports the
 * nearest sub-part so callers can vertex-paint or split the single surface into material regions.
 *
 * Meshes are built once per assembly (callers memoize); nothing here runs per frame.
 */
import {
  paintMeshColors,
  sculptOrganicSdfMesh,
  sdfTaperedCapsule,
  sminPoly,
  srgbHexToLinearRgba,
  type RawMesh,
  type V3
} from "./proceduralKernel";

export interface SdfLimbCapsule {
  readonly a: V3;
  readonly b: V3;
  readonly ra: number;
  readonly rb: number;
  readonly tag: number;
}

export interface SdfMittenHand {
  readonly wrist: V3;
  /** Direction the hand extends (usually elbow -> wrist). */
  readonly dir: V3;
  /** Approximate palm-facing direction (orthogonalised against `dir`). */
  readonly palm: V3;
  /** Wrist radius; the hand is proportioned from it. */
  readonly radius: number;
  /** Which local side (+/- along `dir x palm`) the thumb sits on. */
  readonly thumbSide: 1 | -1;
  readonly tag: number;
}

export interface SdfLimbChain {
  readonly capsules: readonly SdfLimbCapsule[];
  readonly hands?: readonly SdfMittenHand[];
  /** Smooth-union radius at joints. */
  readonly blend: number;
  /** Target grid cell size (world units). */
  readonly cell: number;
  readonly taubinIterations?: number;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

interface HandFrame {
  readonly o: V3;
  readonly u: V3;
  readonly n: V3;
  readonly s: V3;
  readonly r: number;
  readonly side: number;
}

function handFrame(h: SdfMittenHand): HandFrame {
  const u = norm(h.dir);
  const n0 = sub(h.palm, [u[0] * dot(h.palm, u), u[1] * dot(h.palm, u), u[2] * dot(h.palm, u)]);
  const n = norm(Math.hypot(n0[0], n0[1], n0[2]) < 1e-6 ? cross(u, [1, 0, 0]) : n0);
  return { o: h.wrist, u, n, s: norm(cross(u, n)), r: h.radius, side: h.thumbSide };
}

const FLAT = 0.68;

function mittenDistance(p: V3, f: HandFrame): number {
  const d = sub(p, f.o);
  const r = f.r;
  // Local coords: x across knuckles, y along the hand, z through the palm (flattened back-to-palm).
  const q: V3 = [dot(d, f.s), dot(d, f.u), dot(d, f.n) / FLAT];
  const palm = sdfTaperedCapsule(q, [0, 0.2 * r, 0], [0, 1.25 * r, 0.05 * r], 1.0 * r, 0.95 * r);
  const mitt = sdfTaperedCapsule(q, [0, 1.3 * r, 0.08 * r], [0, 2.15 * r, 0.55 * r], 0.86 * r, 0.6 * r);
  const qt: V3 = [q[0], q[1], q[2] * FLAT];
  const thumb = sdfTaperedCapsule(
    qt,
    [f.side * 0.62 * r, 0.55 * r, 0.32 * r],
    [f.side * 1.12 * r, 1.42 * r, 0.62 * r],
    0.36 * r,
    0.26 * r
  );
  return sminPoly(sminPoly(palm, mitt, 0.32 * r) * FLAT, thumb, 0.22 * r);
}

function chainEval(chain: SdfLimbChain, frames: readonly HandFrame[], p: V3): { d: number; tag: number } {
  let d = Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  let tag = chain.capsules[0]?.tag ?? 0;
  for (const c of chain.capsules) {
    const di = sdfTaperedCapsule(p, c.a, c.b, c.ra, c.rb);
    d = d === Number.POSITIVE_INFINITY ? di : sminPoly(d, di, chain.blend);
    if (di < best) {
      best = di;
      tag = c.tag;
    }
  }
  const hands = chain.hands ?? [];
  for (let i = 0; i < hands.length; i += 1) {
    const di = mittenDistance(p, frames[i]!);
    d = d === Number.POSITIVE_INFINITY ? di : sminPoly(d, di, Math.min(chain.blend, frames[i]!.r * 0.4));
    if (di < best) {
      best = di;
      tag = hands[i]!.tag;
    }
  }
  return { d, tag };
}

function chainBounds(chain: SdfLimbChain): { min: V3; max: V3 } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const grow = (p: V3, r: number): void => {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k]!, p[k]! - r);
      max[k] = Math.max(max[k]!, p[k]! + r);
    }
  };
  for (const c of chain.capsules) {
    grow(c.a, c.ra + chain.blend);
    grow(c.b, c.rb + chain.blend);
  }
  for (const h of chain.hands ?? []) grow(h.wrist, h.radius * 2.9);
  return { min: [min[0]!, min[1]!, min[2]!], max: [max[0]!, max[1]!, max[2]!] };
}

/** Sculpts the whole chain as one watertight smooth surface. */
export function sculptSdfLimbChainMesh(chain: SdfLimbChain): RawMesh {
  const frames = (chain.hands ?? []).map(handFrame);
  const { min, max } = chainBounds(chain);
  const res = [0, 1, 2].map((k) => Math.max(10, Math.min(56, Math.ceil((max[k]! - min[k]!) / chain.cell) + 4))) as [
    number,
    number,
    number
  ];
  return sculptOrganicSdfMesh({
    boundsMin: min,
    boundsMax: max,
    resolution: res,
    taubinIterations: chain.taubinIterations ?? 6,
    projectToIso: 0.94,
    evaluate: (x, y, z) => chainEval(chain, frames, [x, y, z]).d
  });
}

/** Returns a nearest-sub-part classifier for painting or splitting a sculpted chain. */
export function limbChainTagger(chain: SdfLimbChain): (p: V3) => number {
  const frames = (chain.hands ?? []).map(handFrame);
  return (p) => chainEval(chain, frames, p).tag;
}

/** Splits a mesh into per-tag sub-meshes by triangle centroid (keeps shared normals, so shading stays continuous). */
export function splitMeshByTag(mesh: RawMesh, tagAt: (p: V3) => number): Map<number, RawMesh> {
  const buckets = new Map<number, { positions: number[]; normals: number[]; uvs: number[]; indices: number[]; remap: Map<number, number> }>();
  const P = mesh.positions;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const ia = mesh.indices[t]!;
    const ib = mesh.indices[t + 1]!;
    const ic = mesh.indices[t + 2]!;
    const cx = (P[ia * 3]! + P[ib * 3]! + P[ic * 3]!) / 3;
    const cy = (P[ia * 3 + 1]! + P[ib * 3 + 1]! + P[ic * 3 + 1]!) / 3;
    const cz = (P[ia * 3 + 2]! + P[ib * 3 + 2]! + P[ic * 3 + 2]!) / 3;
    const tag = tagAt([cx, cy, cz]);
    let b = buckets.get(tag);
    if (!b) {
      b = { positions: [], normals: [], uvs: [], indices: [], remap: new Map() };
      buckets.set(tag, b);
    }
    for (const vi of [ia, ib, ic]) {
      let ni = b.remap.get(vi);
      if (ni === undefined) {
        ni = b.positions.length / 3;
        b.remap.set(vi, ni);
        b.positions.push(P[vi * 3]!, P[vi * 3 + 1]!, P[vi * 3 + 2]!);
        b.normals.push(mesh.normals[vi * 3] ?? 0, mesh.normals[vi * 3 + 1] ?? 1, mesh.normals[vi * 3 + 2] ?? 0);
        b.uvs.push(mesh.uvs[vi * 2] ?? 0, mesh.uvs[vi * 2 + 1] ?? 0);
      }
      b.indices.push(ni);
    }
  }
  const out = new Map<number, RawMesh>();
  for (const [tag, b] of buckets) {
    out.set(tag, {
      positions: b.positions,
      normals: b.normals,
      uvs: b.uvs,
      indices: b.indices,
      ...(mesh.analyticNormals ? { analyticNormals: true } : {})
    });
  }
  return out;
}

/**
 * Averages per-vertex colours with their one-ring neighbours `passes` times. Turns the stair-stepped boundary of a
 * hard per-vertex paint switch into a clean, anti-aliased seam without touching geometry.
 */
export function smoothVertexColors(mesh: RawMesh, passes = 2): RawMesh {
  if (!mesh.colors || passes <= 0) return mesh;
  const vCount = Math.floor(mesh.positions.length / 3);
  const adj: number[][] = Array.from({ length: vCount }, () => []);
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t]!;
    const b = mesh.indices[t + 1]!;
    const c = mesh.indices[t + 2]!;
    adj[a]!.push(b, c);
    adj[b]!.push(a, c);
    adj[c]!.push(a, b);
  }
  let cur = mesh.colors.slice();
  for (let pass = 0; pass < passes; pass += 1) {
    const next = cur.slice();
    for (let v = 0; v < vCount; v += 1) {
      const nb = adj[v]!;
      if (nb.length === 0) continue;
      for (let k = 0; k < 4; k += 1) {
        let sum = 0;
        for (const n of nb) sum += cur[n * 4 + k]!;
        next[v * 4 + k] = 0.5 * cur[v * 4 + k]! + 0.5 * (sum / nb.length);
      }
    }
    cur = next;
  }
  return { ...mesh, colors: cur };
}

/** Sculpts a limb chain and vertex-paints each sub-part (`hexByTag[tag]`) with softened seams. */
export function sculptPaintedLimbChain(
  chain: SdfLimbChain,
  hexByTag: Readonly<Record<number, string>>,
  seamPasses = 2
): RawMesh {
  const mesh = sculptSdfLimbChainMesh(chain);
  const tagAt = limbChainTagger(chain);
  const fallback = hexByTag[chain.capsules[0]?.tag ?? 0] ?? "#808080";
  const rgbaByTag = new Map<number, ReturnType<typeof srgbHexToLinearRgba>>();
  for (const [k, hex] of Object.entries(hexByTag)) rgbaByTag.set(Number(k), srgbHexToLinearRgba(hex));
  const fallbackRgba = srgbHexToLinearRgba(fallback);
  return smoothVertexColors(
    paintMeshColors(mesh, (pos) => rgbaByTag.get(tagAt(pos)) ?? fallbackRgba),
    seamPasses
  );
}
