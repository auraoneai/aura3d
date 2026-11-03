import type { ParityMesh } from "./Support";

export interface TorusKnotParityParams {
  readonly radius?: number;
  readonly tube?: number;
  readonly tubularSegments?: number;
  readonly radialSegments?: number;
  readonly p?: number;
  readonly q?: number;
}

/** Sweep a round cross section around an analytically differentiated torus knot. */
export function torusKnotParityMesh(params: TorusKnotParityParams = {}): ParityMesh {
  const radius = params.radius ?? 1;
  const tube = params.tube ?? 0.4;
  const requestedLength = params.tubularSegments ?? 64;
  const requestedAround = params.radialSegments ?? 8;
  const p = params.p ?? 2;
  const q = params.q ?? 3;
  if (![radius, tube, requestedLength, requestedAround, p, q].every(Number.isFinite) || p === 0) {
    throw new RangeError("torusKnotParityMesh requires finite parameters and nonzero p");
  }
  const length = Math.max(1, Math.floor(requestedLength));
  const around = Math.max(3, Math.floor(requestedAround));
  const stride = around + 1;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= length; row += 1) {
    const t = row / length;
    const majorAngle = 2 * Math.PI * p * t;
    const minorAngle = 2 * Math.PI * q * t;
    const cosine = Math.cos(majorAngle);
    const sine = Math.sin(majorAngle);
    const minorCosine = Math.cos(minorAngle);
    const minorSine = Math.sin(minorAngle);
    const majorRadius = 1 + 0.5 * minorCosine;
    const radialDerivative = -0.5 * q * minorSine;
    // Factor 2π and the global radius cancel during normalization.
    let tx = radialDerivative * cosine - majorRadius * p * sine;
    let ty = radialDerivative * sine + majorRadius * p * cosine;
    let tz = 0.5 * q * minorCosine;
    const tangentLength = Math.hypot(tx, ty, tz);
    if (!Number.isFinite(tangentLength) || tangentLength === 0) {
      throw new RangeError("torusKnotParityMesh curve tangent is degenerate");
    }
    tx /= tangentLength;
    ty /= tangentLength;
    tz /= tangentLength;

    // Project the radial direction onto the tangent's perpendicular plane.
    let bx = -tz * sine;
    let by = tz * cosine;
    let bz = tx * sine - ty * cosine;
    const binormalLength = Math.hypot(bx, by, bz);
    if (binormalLength === 0) throw new RangeError("torusKnotParityMesh cannot construct a frame");
    bx /= binormalLength;
    by /= binormalLength;
    bz /= binormalLength;
    const nx = by * tz - bz * ty;
    const ny = bz * tx - bx * tz;
    const nz = bx * ty - by * tx;
    const cx = radius * majorRadius * cosine;
    const cy = radius * majorRadius * sine;
    const cz = radius * 0.5 * minorSine;
    for (let col = 0; col <= around; col += 1) {
      const angle = 2 * Math.PI * col / around;
      const a = -Math.cos(angle);
      const b = Math.sin(angle);
      const x = a * nx + b * bx;
      const y = a * ny + b * by;
      const z = a * nz + b * bz;
      positions.push(cx + tube * x, cy + tube * y, cz + tube * z);
      const orientation = tube < 0 ? -1 : 1;
      normals.push(orientation * x, orientation * y, orientation * z);
      uvs.push(t, col / around);
      if (row > 0 && col > 0) {
        const last = row * stride + col;
        indices.push(last - stride - 1, last - 1, last - stride, last - 1, last, last - stride);
      }
    }
  }
  return { positions, normals, uvs, indices };
}
