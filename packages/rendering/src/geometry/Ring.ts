import type { ParityMesh } from "./Support";

export interface RingParityParams {
  readonly innerRadius?: number;
  readonly outerRadius?: number;
  readonly thetaSegments?: number;
  readonly phiSegments?: number;
  readonly thetaStart?: number;
  readonly thetaLength?: number;
}

/** An annular XY sector, laid out as concentric rows with an angular seam. */
export function ringParityMesh(params: RingParityParams = {}): ParityMesh {
  const inner = params.innerRadius ?? 0.5;
  const outer = params.outerRadius ?? 1;
  const angular = params.thetaSegments ?? 32;
  const radial = params.phiSegments ?? 1;
  const start = params.thetaStart ?? 0;
  const sweep = params.thetaLength ?? 2 * Math.PI;
  if (![inner, outer, angular, radial, start, sweep].every(Number.isFinite)) {
    throw new RangeError("ringParityMesh requires finite parameters");
  }
  const columns = Math.max(3, Math.floor(angular));
  const rows = Math.max(1, Math.floor(radial));
  const stride = columns + 1;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= rows; row += 1) {
    const distance = inner + (outer - inner) * row / rows;
    const uvRadius = outer === 0 ? 0 : distance / outer;
    for (let column = 0; column <= columns; column += 1) {
      const angle = start + sweep * column / columns;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      positions.push(distance * x, distance * y, 0);
      normals.push(0, 0, 1);
      uvs.push(0.5 + uvRadius * x / 2, 0.5 + uvRadius * y / 2);
      if (row && column) {
        const lowerRight = row * stride + column;
        const lowerLeft = lowerRight - 1;
        const upperRight = lowerRight - stride;
        const upperLeft = upperRight - 1;
        indices.push(upperLeft, lowerLeft, upperRight, lowerLeft, lowerRight, upperRight);
      }
    }
  }
  return { positions, normals, uvs, indices };
}
