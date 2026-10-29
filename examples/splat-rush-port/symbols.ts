/**
 * Colour symbols (C7, presentation only): one shape per palette colour so the core match mechanic does not rely on hue
 * alone. Red is a circle, yellow a triangle, blue a square and purple a cross; each sits as a dark mark on a white disc.
 * Every symbol mesh has the same vertex count and the same index list (two triangle fans), so one merged batch can
 * switch a slot between shapes by rewriting positions only.
 */
import type { MeshData } from "./meshes";

export type SymbolKind = "circle" | "triangle" | "square" | "cross";
/** Symbol per `COLORS` index (red, yellow, blue, purple). */
export const SYMBOL_FOR_COLOR: readonly SymbolKind[] = ["circle", "triangle", "square", "cross"];

const DISC_RIM = 32;
const MARK_RIM = 48;
const DISC_RADIUS = 0.5;
const MARK_RADIUS = 0.31;
/** The mark sits this far in front of its disc (towards +z, the camera side). */
const MARK_LIFT = 0.015;
/** Linear tones: the disc is white, the mark near-black (#262626). */
const DISC_TONE = [1, 1, 1] as const;
const MARK_TONE = [0.0185, 0.0185, 0.0185] as const;

type P2 = readonly [number, number];

/** `n` points along a closed polygon's perimeter, every corner included, in winding order. */
export function perimeterPoints(poly: readonly P2[], n: number): P2[] {
  const k = poly.length;
  const lens = poly.map((p, i) => Math.hypot(poly[(i + 1) % k]![0] - p[0], poly[(i + 1) % k]![1] - p[1]));
  const total = lens.reduce((a, b) => a + b, 0);
  const counts = lens.map((l) => Math.max(1, Math.round((n * l) / total)));
  let diff = n - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; diff !== 0; i = (i + 1) % k) {
    if (diff > 0) { counts[i]!++; diff--; }
    else if (counts[i]! > 1) { counts[i]!--; diff++; }
  }
  const out: P2[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % k]!;
    for (let j = 0; j < counts[i]!; j++) {
      const t = j / counts[i]!;
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  });
  return out;
}

const ring = (n: number, r: number): P2[] => Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * Math.PI * 2), r * Math.sin((i / n) * Math.PI * 2)] as const);

/** Mark outline in unit size (fits a radius-1 circle, visually balanced). */
export function markOutline(kind: SymbolKind): P2[] {
  switch (kind) {
    case "circle": return ring(MARK_RIM, 0.92);
    case "triangle": return perimeterPoints([[0, 1.05], [-0.95, -0.6], [0.95, -0.6]], MARK_RIM);
    case "square": return perimeterPoints([[0.74, 0.74], [-0.74, 0.74], [-0.74, -0.74], [0.74, -0.74]], MARK_RIM);
    case "cross": {
      const a = 0.3, e = 0.95;
      return perimeterPoints([[a, a], [a, e], [-a, e], [-a, a], [-e, a], [-e, -a], [-a, -a], [-a, -e], [a, -e], [a, -a], [e, -a], [e, a]], MARK_RIM);
    }
  }
}

/** Vertices per symbol mesh (both fans, centre points included). */
export const SYMBOL_VERTS = DISC_RIM + 1 + MARK_RIM + 1;

/** A symbol in the XY plane facing +z, centred on the origin, with its per-vertex tones (linear RGB). */
export function symbolMesh(kind: SymbolKind): MeshData & { readonly tones: number[] } {
  const m: MeshData & { tones: number[] } = { positions: [], normals: [], uvs: [], indices: [], tones: [] };
  const fan = (rim: readonly P2[], scale: number, z: number, tone: readonly number[]): void => {
    const c = m.positions.length / 3;
    m.positions.push(0, 0, z); m.normals.push(0, 0, 1); m.uvs.push(0.5, 0.5); m.tones.push(...tone);
    for (const [x, y] of rim) {
      m.positions.push(x * scale, y * scale, z); m.normals.push(0, 0, 1); m.uvs.push(0.5 + 0.5 * x, 0.5 + 0.5 * y); m.tones.push(...tone);
    }
    for (let i = 0; i < rim.length; i++) m.indices.push(c, c + 1 + i, c + 1 + ((i + 1) % rim.length));
  };
  fan(ring(DISC_RIM, 1), DISC_RADIUS, 0, DISC_TONE);
  fan(markOutline(kind), MARK_RADIUS, MARK_LIFT, MARK_TONE);
  return m;
}
