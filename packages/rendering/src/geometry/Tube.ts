import { resolveCurve3 } from "./Support";
import type { ParityMesh } from "./Support";

export interface TubeParityParams {
  readonly path: unknown;
  readonly tubularSegments?: number;
  readonly radius?: number;
  readonly radialSegments?: number;
  readonly closed?: boolean;
}

/** Sweep a circular section along the curve's arc-length and transported frame. */
export function tubeParityMesh(params: TubeParityParams): ParityMesh {
  const curve = resolveCurve3(params.path);
  const requestedLength = params.tubularSegments ?? 64;
  const requestedAround = params.radialSegments ?? 8;
  const radius = params.radius ?? 1;
  if (![requestedLength, requestedAround, radius].every(Number.isFinite)) {
    throw new RangeError("tubeParityMesh requires finite parameters");
  }
  const length = Math.max(1, Math.floor(requestedLength));
  const around = Math.max(3, Math.floor(requestedAround));
  const frames = curve.computeFrenetFrames(length, params.closed ?? false);
  if (!frames || frames.normals.length <= length || frames.binormals.length <= length) {
    throw new Error("tubeParityMesh requires a 3D curve with complete Frenet frames");
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = around + 1;

  for (let row = 0; row <= length; row += 1) {
    const frameIndex = params.closed && row === length ? 0 : row;
    const center = curve.getPointAt(frameIndex / length);
    const normal = frames.normals[frameIndex]!;
    const binormal = frames.binormals[frameIndex]!;
    for (let col = 0; col <= around; col += 1) {
      const angle = 2 * Math.PI * col / around;
      const a = -Math.cos(angle);
      const b = Math.sin(angle);
      let x = a * normal.x + b * binormal.x;
      let y = a * normal.y + b * binormal.y;
      let z = a * normal.z + b * binormal.z;
      const norm = Math.hypot(x, y, z);
      if (!Number.isFinite(norm) || norm === 0 || ![center.x, center.y, center.z].every(Number.isFinite)) {
        throw new Error("tubeParityMesh requires finite points and nonzero frame vectors");
      }
      x /= norm;
      y /= norm;
      z /= norm;
      positions.push(center.x + radius * x, center.y + radius * y, center.z + radius * z);
      normals.push(x, y, z);
      uvs.push(row / length, col / around);
      if (row > 0 && col > 0) {
        const last = row * stride + col;
        indices.push(last - stride - 1, last - 1, last - stride, last - 1, last, last - stride);
      }
    }
  }
  return { positions, normals, uvs, indices };
}
