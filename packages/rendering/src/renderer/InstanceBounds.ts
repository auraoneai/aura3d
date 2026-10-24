import { RenderDeviceError } from "../RenderDevice";
import { Bounds3 as SceneBounds3 } from "@aura3d/scene";

interface BoundsLike {
  readonly min: ArrayLike<number>;
  readonly max: ArrayLike<number>;
}

/**
 * World AABB of `envelope` drawn once per `instanceTransforms` matrix under `modelMatrix` (world = model · instance ·
 * local). Allocation-free per instance: each instance's box is the transformed centre plus |M₃ₓ₃| · half-extents, which is
 * exactly the AABB of the eight transformed corners for an affine matrix. The previous per-instance
 * slice / matrix multiply / Bounds3 union allocated ~15 objects per instance per call and ran several times per frame.
 * `instanceTransforms.length % 16` leftovers are ignored unless `rejectPartial` (the legacy `renderableWorldBounds` contract).
 */
export function instancedWorldBounds(
  envelope: BoundsLike,
  modelMatrix: ArrayLike<number>,
  instanceTransforms: ArrayLike<number>,
  options: { readonly label?: string; readonly rejectPartial?: boolean } = {}
): SceneBounds3 {
  const length = instanceTransforms.length;
  const partial = length % 16;
  if (partial !== 0 && options.rejectPartial) throw matrixContractError(partial, options.label);
  const result = new SceneBounds3();
  if (!(envelope.min[0]! <= envelope.max[0]! && envelope.min[1]! <= envelope.max[1]! && envelope.min[2]! <= envelope.max[2]!)) return result;
  const m = modelMatrix;
  const cx = (envelope.min[0]! + envelope.max[0]!) / 2, cy = (envelope.min[1]! + envelope.max[1]!) / 2, cz = (envelope.min[2]! + envelope.max[2]!) / 2;
  const hx = (envelope.max[0]! - envelope.min[0]!) / 2, hy = (envelope.max[1]! - envelope.min[1]!) / 2, hz = (envelope.max[2]! - envelope.min[2]!) / 2;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let o = 0; o + 16 <= length; o += 16) {
    const i = instanceTransforms;
    // 3x4 of (model · instance), column-major.
    const a0 = i[o]!, a1 = i[o + 1]!, a2 = i[o + 2]!, a4 = i[o + 4]!, a5 = i[o + 5]!, a6 = i[o + 6]!, a8 = i[o + 8]!, a9 = i[o + 9]!, a10 = i[o + 10]!, a12 = i[o + 12]!, a13 = i[o + 13]!, a14 = i[o + 14]!;
    const e00 = m[0]! * a0 + m[4]! * a1 + m[8]! * a2;
    const e10 = m[1]! * a0 + m[5]! * a1 + m[9]! * a2;
    const e20 = m[2]! * a0 + m[6]! * a1 + m[10]! * a2;
    const e01 = m[0]! * a4 + m[4]! * a5 + m[8]! * a6;
    const e11 = m[1]! * a4 + m[5]! * a5 + m[9]! * a6;
    const e21 = m[2]! * a4 + m[6]! * a5 + m[10]! * a6;
    const e02 = m[0]! * a8 + m[4]! * a9 + m[8]! * a10;
    const e12 = m[1]! * a8 + m[5]! * a9 + m[9]! * a10;
    const e22 = m[2]! * a8 + m[6]! * a9 + m[10]! * a10;
    const tx = m[0]! * a12 + m[4]! * a13 + m[8]! * a14 + m[12]!;
    const ty = m[1]! * a12 + m[5]! * a13 + m[9]! * a14 + m[13]!;
    const tz = m[2]! * a12 + m[6]! * a13 + m[10]! * a14 + m[14]!;
    const wx = e00 * cx + e01 * cy + e02 * cz + tx;
    const wy = e10 * cx + e11 * cy + e12 * cz + ty;
    const wz = e20 * cx + e21 * cy + e22 * cz + tz;
    const ex = Math.abs(e00) * hx + Math.abs(e01) * hy + Math.abs(e02) * hz;
    const ey = Math.abs(e10) * hx + Math.abs(e11) * hy + Math.abs(e12) * hz;
    const ez = Math.abs(e20) * hx + Math.abs(e21) * hy + Math.abs(e22) * hz;
    if (!(Number.isFinite(wx + wy + wz + ex + ey + ez + i[o + 3]! + i[o + 7]! + i[o + 11]! + i[o + 15]!))) throw matrixContractError(16, options.label);
    if (wx - ex < minX) minX = wx - ex; if (wx + ex > maxX) maxX = wx + ex;
    if (wy - ey < minY) minY = wy - ey; if (wy + ey > maxY) maxY = wy + ey;
    if (wz - ez < minZ) minZ = wz - ez; if (wz + ez > maxZ) maxZ = wz + ez;
  }
  if (minX === Infinity) return result;
  result.min = [minX, minY, minZ];
  result.max = [maxX, maxY, maxZ];
  return result;
}

function matrixContractError(scalars: number, label: string | undefined): RenderDeviceError {
  return new RenderDeviceError("Renderer matrix inputs must be finite mat4 values", "RENDERER_MATRIX_CONTRACT", { field: "instanceTransforms", label, scalars });
}
