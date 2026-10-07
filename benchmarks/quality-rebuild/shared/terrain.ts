/**
 * PRD-06 T3.9: analytic terrain shared by the prd06-ik-slope lane adapters.
 * Both engines raycast the SAME height function — the aura3d side feeds it to
 * foot-planting (`{heightAt}` heightfield) and the three side feeds it to
 * `CCDIKSolver` target placement, so the surfaces stay spec-driven and the
 * §17.0 engine-reported contact metric compares like-for-like.
 *
 * Profile: flat ground for x < rampStartX; a smooth `slopeDeg` ramp rising to
 * `rise = rampLength * tan(slopeDeg)`; stairs with `stepHeight`/`stepDepth`
 * quantize the same rise over the same run. The surface splits along
 * `splitZ`: z < splitZ gets the smooth ramp, z >= splitZ gets the staircase.
 */
export interface RampStairsTerrainSpec {
  readonly kind: "ramp-stairs";
  /** Ramp slope in degrees (20 per T3.9). */
  readonly slopeDeg: number;
  /** World x where the ramp/stairs start rising (flat ground before it). */
  readonly rampStartX: number;
  /** Horizontal run of the ramp/stairs along +x. */
  readonly rampLength: number;
  /** Stair rise per step in meters (0.18 per T3.9). */
  readonly stepHeight: number;
  readonly stepCount: number;
  /** Horizontal tread depth of one step. */
  readonly stepDepth: number;
  /** z below this is smooth ramp; at/above is stairs. */
  readonly splitZ: number;
}

export function rampStairsRise(terrain: RampStairsTerrainSpec): number {
  return terrain.rampLength * Math.tan((terrain.slopeDeg * Math.PI) / 180);
}

export function rampStairsHeightAt(
  terrain: RampStairsTerrainSpec,
  x: number,
  z: number
): { height: number; normal: readonly [number, number, number] } {
  const rise = rampStairsRise(terrain);
  if (x < terrain.rampStartX) return { height: 0, normal: [0, 1, 0] };
  const onSlope = x < terrain.rampStartX + terrain.rampLength;
  if (!onSlope) return { height: rise, normal: [0, 1, 0] };
  if (z < terrain.splitZ) {
    const theta = (terrain.slopeDeg * Math.PI) / 180;
    return {
      height: (x - terrain.rampStartX) * Math.tan(theta),
      normal: [-Math.sin(theta), Math.cos(theta), 0]
    };
  }
  const stepIndex = Math.min(
    terrain.stepCount - 1,
    Math.max(0, Math.floor((x - terrain.rampStartX) / terrain.stepDepth))
  );
  return { height: Math.min((stepIndex + 1) * terrain.stepHeight, rise), normal: [0, 1, 0] };
}

/* ── Model-space ground projection ─────────────────────────────────────────
 * The aura foot-IK constraint + `animation.socket` matrices live in the
 * actor's own space (the compiled model node's transform is applied by the
 * mount, outside `pipeline.resources.scene`). A raw `(x, z)` ground query is
 * therefore already in model-local coordinates — feeding it the world-space
 * heightfield plants feet on the terrain at the ORIGIN instead of under the
 * model. `modelSpaceHeightAt` wraps a world-space height query with the
 * node's transform so both frames see the same surface.
 */

export interface TerrainTransformLike {
  readonly position?: readonly [number, number, number];
  /** Euler in the engine's ZYX convention (R = Rz·Ry·Rx). */
  readonly rotation?: readonly [number, number, number];
  readonly scale?: number | readonly [number, number, number];
}

function eulerToQuaternionZYX(e: readonly [number, number, number]): readonly [number, number, number, number] {
  const cx = Math.cos(e[0] / 2), sx = Math.sin(e[0] / 2);
  const cy = Math.cos(e[1] / 2), sy = Math.sin(e[1] / 2);
  const cz = Math.cos(e[2] / 2), sz = Math.sin(e[2] / 2);
  // q = qz ⊗ qy ⊗ qx (ZYX: X applied first, matching the engine's rotationXYZ).
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz
  ];
}

/** Column-major T·R·S matrix for a spec transform (matches composeWorldMatrix null-parent). */
export function transformSpecMatrix(t: TerrainTransformLike): Float32Array {
  const [px, py, pz] = t.position ?? [0, 0, 0];
  const [sx, sy, sz] = t.scale === undefined ? [1, 1, 1] : typeof t.scale === "number" ? [t.scale, t.scale, t.scale] : t.scale;
  const [qx, qy, qz, qw] = eulerToQuaternionZYX(t.rotation ?? [0, 0, 0]);
  const xx = qx * qx, yy = qy * qy, zz = qz * qz;
  const xy = qx * qy, xz = qx * qz, yz = qy * qz;
  const xw = qx * qw, yw = qy * qw, zw = qz * qw;
  const m = new Float32Array(16);
  m[0] = (1 - 2 * (yy + zz)) * sx; m[1] = (2 * (xy + zw)) * sx; m[2] = (2 * (xz - yw)) * sx;
  m[4] = (2 * (xy - zw)) * sy; m[5] = (1 - 2 * (xx + zz)) * sy; m[6] = (2 * (yz + xw)) * sy;
  m[8] = (2 * (xz + yw)) * sz; m[9] = (2 * (yz - xw)) * sz; m[10] = (1 - 2 * (xx + yy)) * sz;
  m[12] = px; m[13] = py; m[14] = pz; m[15] = 1;
  return m;
}

/** Affine inverse of a column-major 4x4 (rotation+scale+translation). */
export function invertAffineMatrix(m: Float32Array): Float32Array {
  const a00 = m[0]!, a01 = m[4]!, a02 = m[8]!;
  const a10 = m[1]!, a11 = m[5]!, a12 = m[9]!;
  const a20 = m[2]!, a21 = m[6]!, a22 = m[10]!;
  // Cofactors C(i,j); element (r,c) lives at m[c*4+r].
  const c00 = a11 * a22 - a12 * a21, c01 = a12 * a20 - a10 * a22, c02 = a10 * a21 - a11 * a20;
  const c10 = a02 * a21 - a01 * a22, c11 = a00 * a22 - a02 * a20, c12 = a01 * a20 - a00 * a21;
  const c20 = a01 * a12 - a02 * a11, c21 = a02 * a10 - a00 * a12, c22 = a00 * a11 - a01 * a10;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  const inv = 1 / det;
  // inverse(r,c) = C(c,r) / det — adjugate is the cofactor transpose.
  const out = new Float32Array(16);
  out[0] = c00 * inv; out[4] = c10 * inv; out[8] = c20 * inv;
  out[1] = c01 * inv; out[5] = c11 * inv; out[9] = c21 * inv;
  out[2] = c02 * inv; out[6] = c12 * inv; out[10] = c22 * inv;
  out[12] = -(out[0] * m[12]! + out[4] * m[13]! + out[8] * m[14]!);
  out[13] = -(out[1] * m[12]! + out[5] * m[13]! + out[9] * m[14]!);
  out[14] = -(out[2] * m[12]! + out[6] * m[13]! + out[10] * m[14]!);
  out[15] = 1;
  return out;
}

export function applyMatrixPoint(m: Float32Array, p: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = p;
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!
  ];
}

function applyMatrixDirection(m: Float32Array, d: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = d;
  const nx = m[0]! * x + m[4]! * y + m[8]! * z;
  const ny = m[1]! * x + m[5]! * y + m[9]! * z;
  const nz = m[2]! * x + m[6]! * y + m[10]! * z;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/**
 * Wrap a world-space height query so it answers in a model node's LOCAL
 * space: `(x, z)` local → world (via the node transform), terrain queried in
 * world space, height + normal mapped back. Heightfield queries can't carry
 * the foot's local y, so the forward map evaluates at y=0 — exact for
 * yaw-only/flat mounts, approximate under pitch/roll (documented, not hidden).
 */
export function modelSpaceHeightAt(
  heightAt: (x: number, z: number) => { height: number; normal: readonly [number, number, number] },
  transform: TerrainTransformLike
): (x: number, z: number) => { height: number; normal: readonly [number, number, number] } {
  const world = transformSpecMatrix(transform);
  const inverse = invertAffineMatrix(world);
  return (x, z) => {
    const [wx, , wz] = applyMatrixPoint(world, [x, 0, z]);
    const sample = heightAt(wx, wz);
    const [, ly] = applyMatrixPoint(inverse, [wx, sample.height, wz]);
    return { height: ly, normal: applyMatrixDirection(inverse, sample.normal) };
  };
}
