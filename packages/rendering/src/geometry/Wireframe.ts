import type { ParityMesh } from "./Support";

export interface WireframeInput {
  readonly positions: ArrayLike<number>;
  readonly indices?: ArrayLike<number>;
  readonly groups?: readonly { readonly start: number; readonly count: number }[];
}

type Point = readonly [number, number, number];

/**
 * Produce one line segment per distinct triangle edge. Edge identity is based
 * on exact coordinates, so coincident vertices at UV or material seams share
 * a line. Indexed meshes can restrict traversal with groups; overlapping groups
 * still emit any shared edge only once. Lines retain first-encounter order.
 */
export function wireframeParityMesh(input: WireframeInput): ParityMesh {
  if (input.positions.length % 3 !== 0) throw new RangeError("Position data must contain complete 3D vertices.");
  const vertexCount = input.positions.length / 3;
  const cornerCount = input.indices?.length ?? vertexCount;
  const read = (corner: number): Point => {
    const index = input.indices ? input.indices[corner]! : corner;
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) throw new RangeError("Wireframe index is outside the position buffer.");
    const point: Point = [input.positions[index * 3]!, input.positions[index * 3 + 1]!, input.positions[index * 3 + 2]!];
    if (!point.every(Number.isFinite)) throw new RangeError("Wireframe positions must be finite.");
    return point;
  };
  const sections = input.indices && input.groups?.length
    ? input.groups
    : [{ start: 0, count: cornerCount }];
  const vertices: number[] = [];
  const visited = new Set<string>();
  for (const section of sections) {
    if (!Number.isInteger(section.start) || !Number.isInteger(section.count) || section.start < 0 || section.count < 0 || section.count % 3 !== 0 || section.start + section.count > cornerCount) {
      throw new RangeError("Wireframe groups must contain complete triangles inside the index buffer.");
    }
    for (let i = section.start; i < section.start + section.count; i += 3) {
      const corners = [read(i), read(i + 1), read(i + 2)] as const;
      for (let side = 0; side < 3; side += 1) {
        const a = corners[side]!;
        const b = corners[(side + 1) % 3]!;
        const aKey = a.join(",");
        const bKey = b.join(",");
        const key = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
        if (!visited.has(key)) {
          visited.add(key);
          vertices.push(...a, ...b);
        }
      }
    }
  }
  return { positions: vertices };
}
