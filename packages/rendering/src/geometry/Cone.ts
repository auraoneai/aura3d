import type { ParityMesh } from "./Support";

export interface CylinderParityParams {
  readonly radiusTop?: number;
  readonly radiusBottom?: number;
  readonly height?: number;
  readonly radialSegments?: number;
  readonly heightSegments?: number;
  readonly openEnded?: boolean;
  readonly thetaStart?: number;
  readonly thetaLength?: number;
}

/** Build a tapered cylinder, with independent planar caps and material groups. */
export function cylinderParityMesh(params: CylinderParityParams = {}): ParityMesh {
  const top = params.radiusTop ?? 1;
  const bottom = params.radiusBottom ?? 1;
  const height = params.height ?? 1;
  const requestedAround = params.radialSegments ?? 32;
  const requestedHeight = params.heightSegments ?? 1;
  const start = params.thetaStart ?? 0;
  const sweep = params.thetaLength ?? 2 * Math.PI;
  if (![top, bottom, height, requestedAround, requestedHeight, start, sweep].every(Number.isFinite)) {
    throw new RangeError("cylinderParityMesh requires finite parameters");
  }
  const around = Math.max(3, Math.floor(requestedAround));
  const along = Math.max(1, Math.floor(requestedHeight));
  const stride = around + 1;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];

  // The radial derivative and the height derivative give a side normal with
  // radial component 1 and vertical component (bottom-top)/height.
  const rise = height === 0 ? 0 : (bottom - top) / height;
  const sideLength = Math.hypot(1, rise);
  const sideRadial = 1 / sideLength;
  const sideY = rise / sideLength;
  for (let row = 0; row <= along; row += 1) {
    const v = row / along;
    const radius = top * (1 - v) + bottom * v;
    for (let col = 0; col <= around; col += 1) {
      const u = col / around;
      const angle = start + sweep * u;
      const x = Math.sin(angle);
      const z = Math.cos(angle);
      positions.push(radius * x, height * (0.5 - v), radius * z);
      normals.push(sideRadial * x, sideY, sideRadial * z);
      uvs.push(u, 1 - v);
    }
  }
  for (let col = 0; col < around; col += 1) {
    for (let row = 0; row < along; row += 1) {
      const a = row * stride + col;
      const b = a + stride;
      // Omit the zero-area half of the first or last row at a pointed end.
      if (top > 0 || row > 0) indices.push(a, b, a + 1);
      if (bottom > 0 || row < along - 1) indices.push(b, b + 1, a + 1);
    }
  }
  groups.push({ start: 0, count: indices.length, materialIndex: 0 });

  const appendCap = (radius: number, side: 1 | -1): void => {
    if (radius <= 0) return;
    const indexStart = indices.length;
    const centerStart = positions.length / 3;
    const y = side * height / 2;
    // A center per triangle keeps every cap sector's vertex attributes distinct.
    for (let col = 0; col < around; col += 1) {
      positions.push(0, y, 0);
      normals.push(0, side, 0);
      uvs.push(0.5, 0.5);
    }
    const edgeStart = positions.length / 3;
    for (let col = 0; col <= around; col += 1) {
      const angle = start + sweep * col / around;
      const x = Math.sin(angle);
      const z = Math.cos(angle);
      positions.push(radius * x, y, radius * z);
      normals.push(0, side, 0);
      uvs.push(0.5 + z / 2, 0.5 + side * x / 2);
      if (col > 0) {
        const center = centerStart + col - 1;
        const edge = edgeStart + col - 1;
        if (side === 1) indices.push(edge, edge + 1, center);
        else indices.push(edge + 1, edge, center);
      }
    }
    groups.push({ start: indexStart, count: indices.length - indexStart, materialIndex: side === 1 ? 1 : 2 });
  };
  if (!(params.openEnded ?? false)) {
    appendCap(top, 1);
    appendCap(bottom, -1);
  }
  return { positions, normals, uvs, indices, groups };
}

export interface ConeParityParams {
  readonly radius?: number;
  readonly height?: number;
  readonly radialSegments?: number;
  readonly heightSegments?: number;
  readonly openEnded?: boolean;
  readonly thetaStart?: number;
  readonly thetaLength?: number;
}

/** A cone is a tapered cylinder whose upper radius is zero. */
export function coneParityMesh(params: ConeParityParams = {}): ParityMesh {
  return cylinderParityMesh({
    radiusTop: 0,
    radiusBottom: params.radius,
    height: params.height,
    radialSegments: params.radialSegments,
    heightSegments: params.heightSegments,
    openEnded: params.openEnded,
    thetaStart: params.thetaStart,
    thetaLength: params.thetaLength
  });
}
