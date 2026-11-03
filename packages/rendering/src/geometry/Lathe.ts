import type { ParityMesh } from "./Support";

export interface LatheParityParams {
  readonly points: readonly (readonly [number, number] | { readonly x: number; readonly y: number })[];
  readonly segments?: number;
  readonly phiStart?: number;
  readonly phiLength?: number;
}

/** Revolve a radius/height polyline around the Y axis. */
export function latheParityMesh(params: LatheParityParams): ParityMesh {
  const profile = params.points.map((point): [number, number] => {
    if (Array.isArray(point)) return [point[0] as number, point[1] as number];
    const objectPoint = point as { readonly x: number; readonly y: number };
    return [objectPoint.x, objectPoint.y];
  });
  if (profile.length < 2) throw new Error("Aura3D lathe requires a profile of at least two points.");
  const requested = params.segments ?? 12;
  const start = params.phiStart ?? 0;
  const length = params.phiLength ?? 2 * Math.PI;
  if (![requested, start, length, ...profile.flat()].every(Number.isFinite)) {
    throw new RangeError("latheParityMesh requires finite parameters and profile points");
  }
  const divisions = Math.max(3, Math.floor(requested));
  const sweep = Math.min(2 * Math.PI, Math.max(0, length));
  const edgeNormals = profile.slice(1).map((point, index): [number, number] => {
    const previous = profile[index]!;
    return [point[1] - previous[1], previous[0] - point[0]];
  });
  const profileNormals = profile.map((_, index): [number, number] => {
    const previous = edgeNormals[Math.max(0, index - 1)]!;
    const next = edgeNormals[Math.min(edgeNormals.length - 1, index)]!;
    let x = previous[0] + next[0];
    let y = previous[1] + next[1];
    let magnitude = Math.hypot(x, y);
    if (magnitude === 0) {
      // At a doubled point or a reversal use a neighboring valid edge normal.
      const fallback = Math.hypot(...next) ? next : Math.hypot(...previous)
        ? previous
        : edgeNormals.find((normal) => Math.hypot(...normal) > 0) ?? [1, 0];
      [x, y] = fallback;
      magnitude = Math.hypot(x, y);
    }
    return magnitude ? [x / magnitude, y / magnitude] : [0, 0];
  });
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = profile.length;
  for (let col = 0; col <= divisions; col += 1) {
    const u = col / divisions;
    const angle = start + u * sweep;
    const sine = Math.sin(angle);
    const cosine = Math.cos(angle);
    for (let row = 0; row < profile.length; row += 1) {
      const [radius, height] = profile[row]!;
      const [radialNormal, verticalNormal] = profileNormals[row]!;
      positions.push(radius * sine, height, radius * cosine);
      normals.push(radialNormal * sine, verticalNormal, radialNormal * cosine);
      uvs.push(u, row / (profile.length - 1));
      if (col > 0 && row > 0) {
        const lowerRight = col * stride + row;
        const lowerLeft = lowerRight - 1;
        const upperRight = lowerRight - stride;
        const upperLeft = upperRight - 1;
        indices.push(upperLeft, lowerLeft, upperRight, lowerRight, upperRight, lowerLeft);
      }
    }
  }
  return { positions, normals, uvs, indices };
}
