/**
 * Per-instance frustum culling for large instanced draws (forward pass, main camera only).
 *
 * A 10,000-instance forest submits every instance to the GPU even though a third of them are behind or beside the camera; on a software
 * rasteriser the vertex stage alone for those instances dominates the frame. This compacts the instance matrices (and colours) to the ones
 * whose bounding sphere intersects the view frustum, in draw order, so the draw is pixel-identical and cheaper. It is conservative: the
 * sphere is inflated, and anything it cannot reason about (non-finite matrices, tiny draws) is left to the caller's normal path.
 *
 * The scan and the output are allocation-free in steady state (SI-2): the keep list and the compacted transforms and colours live in
 * module scratch buffers that grow on demand and are reused, so the result arrays are views that stay valid only until the next call.
 * Every consumer in the forward draw copies them synchronously (InstanceBuffer.setMatrices, the uniform pack, createBuffer with data).
 * Before this a 900-slot pool with most slots parked off-screen allocated about 72 KB of fresh arrays per frame.
 */

/** Below this many instances the GPU handles the draw trivially and the scan would cost more than it saves. */
export const MIN_CULLED_INSTANCES = 512;
/** Conservative inflation of each instance's bounding sphere (covers wind sway, rounding and TAA jitter). */
const RADIUS_INFLATION = 1.15;

export interface InstanceFrustumCullInput {
  /** Column-major view-projection of the camera that rasterises this draw (GL clip space, -w..w). */
  readonly viewProjection: ArrayLike<number>;
  /** The item's model matrix (column-major), or undefined for identity. */
  readonly modelMatrix?: ArrayLike<number> | undefined;
  /** Local-space AABB of the instanced geometry. */
  readonly bounds: { readonly min: ArrayLike<number>; readonly max: ArrayLike<number> };
  readonly transforms: Float32Array;
  /** Optional per-instance RGBA (4 floats each), compacted alongside. */
  readonly colors?: Float32Array | undefined;
}

export interface InstanceFrustumCullResult {
  readonly transforms: Float32Array;
  readonly colors?: Float32Array;
  readonly count: number;
  readonly total: number;
}

let keepScratch = new Uint32Array(0);
let transformScratch: Float32Array<ArrayBuffer> = new Float32Array(0);
let colorScratch: Float32Array<ArrayBuffer> = new Float32Array(0);

function grown(current: Float32Array<ArrayBuffer>, length: number): Float32Array<ArrayBuffer> {
  return current.length >= length ? current : new Float32Array(Math.max(length, current.length * 2));
}
const planes = new Float64Array(24);

function extractPlanes(vp: ArrayLike<number>): boolean {
  // Gribb-Hartmann on a column-major matrix: row i = (m[i], m[4+i], m[8+i], m[12+i]).
  const r = (row: number, col: number): number => vp[col * 4 + row]!;
  const set = (index: number, a: number, b: number, c: number, d: number): boolean => {
    const length = Math.hypot(a, b, c);
    if (!(length > 1e-12) || !Number.isFinite(d)) return false;
    const o = index * 4;
    planes[o] = a / length; planes[o + 1] = b / length; planes[o + 2] = c / length; planes[o + 3] = d / length;
    return true;
  };
  for (let i = 0; i < 16; i += 1) if (!Number.isFinite(vp[i]!)) return false;
  return (
    set(0, r(3, 0) + r(0, 0), r(3, 1) + r(0, 1), r(3, 2) + r(0, 2), r(3, 3) + r(0, 3)) && // left
    set(1, r(3, 0) - r(0, 0), r(3, 1) - r(0, 1), r(3, 2) - r(0, 2), r(3, 3) - r(0, 3)) && // right
    set(2, r(3, 0) + r(1, 0), r(3, 1) + r(1, 1), r(3, 2) + r(1, 2), r(3, 3) + r(1, 3)) && // bottom
    set(3, r(3, 0) - r(1, 0), r(3, 1) - r(1, 1), r(3, 2) - r(1, 2), r(3, 3) - r(1, 3)) && // top
    set(4, r(3, 0) + r(2, 0), r(3, 1) + r(2, 1), r(3, 2) + r(2, 2), r(3, 3) + r(2, 3)) && // near (GL; looser than a 0..1 near)
    set(5, r(3, 0) - r(2, 0), r(3, 1) - r(2, 1), r(3, 2) - r(2, 2), r(3, 3) - r(2, 3))    // far
  );
}

function isIdentity(m: ArrayLike<number> | undefined): boolean {
  if (!m || m.length < 16) return true;
  for (let i = 0; i < 16; i += 1) {
    if (m[i] !== ((i % 5 === 0) ? 1 : 0)) return false;
  }
  return true;
}

/**
 * Returns the visible subset (views into reused scratch, valid until the next call), or null when nothing was culled (or culling does not apply), in which case the caller keeps its originals.
 * A result with `count === 0` means every instance is outside the frustum.
 */
export function cullInstancesToFrustum(input: InstanceFrustumCullInput): InstanceFrustumCullResult | null {
  const { transforms, colors, bounds } = input;
  const total = Math.floor(transforms.length / 16);
  if (total < MIN_CULLED_INSTANCES || transforms.length % 16 !== 0) return null;
  if (colors !== undefined && colors.length < total * 4) return null;
  if (!extractPlanes(input.viewProjection)) return null;

  const cx = (bounds.min[0]! + bounds.max[0]!) / 2, cy = (bounds.min[1]! + bounds.max[1]!) / 2, cz = (bounds.min[2]! + bounds.max[2]!) / 2;
  const radius = Math.hypot(bounds.max[0]! - bounds.min[0]!, bounds.max[1]! - bounds.min[1]!, bounds.max[2]! - bounds.min[2]!) / 2 * RADIUS_INFLATION;
  if (!Number.isFinite(radius) || !Number.isFinite(cx + cy + cz)) return null;

  const model = input.modelMatrix;
  const modelIdentity = isIdentity(model);
  const m = model as ArrayLike<number>;
  // Model scale bound for the sphere radius when the model matrix is not identity.
  let modelScale = 1;
  if (!modelIdentity) {
    modelScale = Math.max(
      Math.hypot(m[0]!, m[1]!, m[2]!), Math.hypot(m[4]!, m[5]!, m[6]!), Math.hypot(m[8]!, m[9]!, m[10]!)
    );
    if (!Number.isFinite(modelScale)) return null;
  }

  if (keepScratch.length < total) keepScratch = new Uint32Array(total);

  let kept = 0;
  for (let i = 0; i < total; i += 1) {
    const o = i * 16;
    const a0 = transforms[o]!, a1 = transforms[o + 1]!, a2 = transforms[o + 2]!;
    const b0 = transforms[o + 4]!, b1 = transforms[o + 5]!, b2 = transforms[o + 6]!;
    const c0 = transforms[o + 8]!, c1 = transforms[o + 9]!, c2 = transforms[o + 10]!;
    // Instance-space centre of the geometry, then (optionally) the model transform.
    let wx = a0 * cx + b0 * cy + c0 * cz + transforms[o + 12]!;
    let wy = a1 * cx + b1 * cy + c1 * cz + transforms[o + 13]!;
    let wz = a2 * cx + b2 * cy + c2 * cz + transforms[o + 14]!;
    const sx2 = a0 * a0 + a1 * a1 + a2 * a2, sy2 = b0 * b0 + b1 * b1 + b2 * b2, sz2 = c0 * c0 + c1 * c1 + c2 * c2;
    let scale = Math.sqrt(sx2 > sy2 ? (sx2 > sz2 ? sx2 : sz2) : (sy2 > sz2 ? sy2 : sz2));
    if (!modelIdentity) {
      const tx = wx, ty = wy, tz = wz;
      wx = m[0]! * tx + m[4]! * ty + m[8]! * tz + m[12]!;
      wy = m[1]! * tx + m[5]! * ty + m[9]! * tz + m[13]!;
      wz = m[2]! * tx + m[6]! * ty + m[10]! * tz + m[14]!;
      scale *= modelScale;
    }
    const r = radius * scale;
    let visible = true;
    // A non-finite centre fails every comparison below, so it is kept (never culled on bad data).
    for (let p = 0; p < 24; p += 4) {
      if (planes[p]! * wx + planes[p + 1]! * wy + planes[p + 2]! * wz + planes[p + 3]! < -r) { visible = false; break; }
    }
    if (!visible) continue;
    keepScratch[kept] = i;
    kept += 1;
  }
  if (kept === total) return null;
  transformScratch = grown(transformScratch, kept * 16);
  const outTransforms = transformScratch.subarray(0, kept * 16);
  let outColors: Float32Array<ArrayBuffer> | undefined;
  if (colors !== undefined) {
    colorScratch = grown(colorScratch, kept * 4);
    outColors = colorScratch.subarray(0, kept * 4);
  }
  for (let k = 0; k < kept; k += 1) {
    const i = keepScratch[k]!;
    outTransforms.set(transforms.subarray(i * 16, i * 16 + 16), k * 16);
    if (outColors !== undefined && colors !== undefined) outColors.set(colors.subarray(i * 4, i * 4 + 4), k * 4);
  }
  return { transforms: outTransforms, ...(outColors ? { colors: outColors } : {}), count: kept, total };
}
