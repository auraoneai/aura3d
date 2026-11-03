import type { ParityMesh } from "./Support";

export interface EdgesInput {
  readonly positions: ArrayLike<number>;
  readonly indices?: ArrayLike<number>;
}

type Point = readonly [number, number, number];
interface Edge {
  readonly incidents: { readonly normal: Point; readonly endpoints: readonly [Point, Point]; readonly order: number }[];
}

/**
 * Extract boundary edges and edges whose incident face normals differ by at
 * least `thresholdAngle` degrees. Vertices are identified by coordinates
 * rounded to 1e-4, allowing duplicated vertices at material or UV seams to
 * meet. For non-manifold edges, any qualifying pair includes the edge once.
 */
export function edgesParityMesh(input: EdgesInput, thresholdAngle = 1): ParityMesh {
  if (!Number.isFinite(thresholdAngle)) throw new RangeError("Edge angle must be finite.");
  if (input.positions.length % 3 !== 0) throw new RangeError("Position data must contain complete 3D vertices.");
  const cornerCount = input.indices?.length ?? input.positions.length / 3;
  if (cornerCount % 3 !== 0) throw new RangeError("Edge input must contain complete triangles.");
  const vertexCount = input.positions.length / 3;
  const pointAt = (corner: number): Point => {
    const index = input.indices ? input.indices[corner]! : corner;
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) throw new RangeError("Edge index is outside the position buffer.");
    const point: Point = [input.positions[index * 3]!, input.positions[index * 3 + 1]!, input.positions[index * 3 + 2]!];
    if (!point.every(Number.isFinite)) throw new RangeError("Edge positions must be finite.");
    return point;
  };
  const keyOf = (p: Point): string => p.map((v) => Math.round(v * 10_000)).join(",");
  const edges = new Map<string, Edge>();
  let order = 0;
  for (let i = 0; i < cornerCount; i += 3) {
    const triangle = [pointAt(i), pointAt(i + 1), pointAt(i + 2)] as const;
    const keys = triangle.map(keyOf);
    if (new Set(keys).size !== 3) continue;
    const u: Point = [triangle[1][0] - triangle[0][0], triangle[1][1] - triangle[0][1], triangle[1][2] - triangle[0][2]];
    const v: Point = [triangle[2][0] - triangle[0][0], triangle[2][1] - triangle[0][1], triangle[2][2] - triangle[0][2]];
    const cross: Point = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const magnitude = Math.hypot(...cross);
    if (magnitude === 0) continue;
    const normal: Point = [cross[0] / magnitude, cross[1] / magnitude, cross[2] / magnitude];
    for (let side = 0; side < 3; side += 1) {
      const next = (side + 1) % 3;
      const key = keys[side]! < keys[next]! ? `${keys[side]}|${keys[next]}` : `${keys[next]}|${keys[side]}`;
      const pair = [triangle[side]!, triangle[next]!] as const;
      const edge = edges.get(key);
      const incident = { normal, endpoints: pair, order: order++ };
      if (edge) {
        edge.incidents.push(incident);
      } else {
        edges.set(key, { incidents: [incident] });
      }
    }
  }
  const threshold = Math.cos(thresholdAngle * Math.PI / 180);
  const shared: { readonly order: number; readonly endpoints: readonly [Point, Point] }[] = [];
  const boundary: number[] = [];
  for (const edge of edges.values()) {
    if (edge.incidents.length === 1) {
      const pair = edge.incidents[0]!.endpoints;
      boundary.push(...pair[0], ...pair[1]);
      continue;
    }
    let closingIncident: Edge["incidents"][number] | undefined;
    for (let b = 1; b < edge.incidents.length && !closingIncident; b += 1) {
      for (let a = 0; a < b; a += 1) {
        const first = edge.incidents[a]!.normal;
        const second = edge.incidents[b]!.normal;
        if (first[0] * second[0] + first[1] * second[1] + first[2] * second[2] <= threshold) {
          closingIncident = edge.incidents[b];
          break;
        }
      }
    }
    if (closingIncident) shared.push(closingIncident);
  }
  shared.sort((a, b) => a.order - b.order);
  return { positions: [...shared.flatMap(({ endpoints }) => [...endpoints[0], ...endpoints[1]]), ...boundary] };
}
