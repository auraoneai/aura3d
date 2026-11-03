import type { ParityMesh } from "./Support";

export interface CircleParityParams {
  readonly radius?: number;
  readonly segments?: number;
  readonly thetaStart?: number;
  readonly thetaLength?: number;
}

/** A disk or sector in the XY plane, with a duplicated angular seam. */
export function circleParityMesh(params: CircleParityParams = {}): ParityMesh {
  const radius = params.radius ?? 1;
  const requestedSegments = params.segments ?? 32;
  const start = params.thetaStart ?? 0;
  const sweep = params.thetaLength ?? 2 * Math.PI;
  if (![radius, requestedSegments, start, sweep].every(Number.isFinite)) {
    throw new RangeError("circleParityMesh requires finite parameters");
  }
  const divisions = Math.max(3, Math.floor(requestedSegments));
  const positions: number[] = [0, 0, 0];
  const normals: number[] = [0, 0, 1];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];

  for (let k = 0; k <= divisions; k += 1) {
    const angle = start + sweep * k / divisions;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    positions.push(radius * x, radius * y, 0);
    normals.push(0, 0, 1);
    // The unit-circle parameterization remains finite when radius is zero.
    uvs.push(0.5 + x / 2, 0.5 + y / 2);
    if (k > 0) indices.push(k, k + 1, 0);
  }
  return { positions, normals, uvs, indices };
}
