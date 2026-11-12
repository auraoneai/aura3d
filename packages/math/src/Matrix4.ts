import { Quaternion } from "./Quaternion.js";
import { Vector3 } from "./Vector3.js";
import { Vector4 } from "./Vector4.js";

/** NDC depth interval used by a projection. The view looks down its -Z axis. */
export type ProjectionClipRange = "minus-one-to-one" | "zero-to-one";
export type ProjectionDepthMode = "standard" | "reversed" | "logarithmic";

/**
 * Logarithmic depth still uses the standard projection; the renderer must also
 * write and reconstruct logarithmic fragment depth. Merely selecting this
 * matrix does not enable that pipeline.
 */
export interface ProjectionOptions {
  clipRange?: ProjectionClipRange;
  mode?: ProjectionDepthMode;
}

function depthEndpoints(options: ProjectionOptions): readonly [number, number] {
  const clipRange = options.clipRange ?? "minus-one-to-one";
  const mode = options.mode ?? "standard";
  if (clipRange !== "minus-one-to-one" && clipRange !== "zero-to-one") {
    throw new RangeError("Invalid projection clip range.");
  }
  if (mode !== "standard" && mode !== "reversed" && mode !== "logarithmic") {
    throw new RangeError("Invalid projection depth mode.");
  }
  const low = clipRange === "zero-to-one" ? 0 : -1;
  return mode === "reversed" ? [1, low] : [low, 1];
}

export class Matrix4 {
  readonly elements: readonly [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number
  ];

  constructor(elements?: Matrix4["elements"]) {
    this.elements = elements ? [...elements] as Matrix4["elements"] : [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
  }

  static identity(): Matrix4 {
    return new Matrix4();
  }

  static translation(v: Vector3): Matrix4 {
    return new Matrix4([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      v.x, v.y, v.z, 1
    ]);
  }

  static scaling(v: Vector3): Matrix4 {
    return new Matrix4([
      v.x, 0, 0, 0,
      0, v.y, 0, 0,
      0, 0, v.z, 0,
      0, 0, 0, 1
    ]);
  }

  static rotation(q: Quaternion): Matrix4 {
    const n = q.normalize();
    const x2 = n.x + n.x;
    const y2 = n.y + n.y;
    const z2 = n.z + n.z;
    const xx = n.x * x2;
    const xy = n.x * y2;
    const xz = n.x * z2;
    const yy = n.y * y2;
    const yz = n.y * z2;
    const zz = n.z * z2;
    const wx = n.w * x2;
    const wy = n.w * y2;
    const wz = n.w * z2;
    return new Matrix4([
      1 - (yy + zz), xy + wz, xz - wy, 0,
      xy - wz, 1 - (xx + zz), yz + wx, 0,
      xz + wy, yz - wx, 1 - (xx + yy), 0,
      0, 0, 0, 1
    ]);
  }

  static compose(position: Vector3, rotation: Quaternion, scale: Vector3): Matrix4 {
    return Matrix4.translation(position).multiply(Matrix4.rotation(rotation)).multiply(Matrix4.scaling(scale));
  }

  static perspective(fovYRadians: number, aspect: number, near: number, far: number, options: ProjectionOptions = {}): Matrix4 {
    if (![fovYRadians, aspect, near].every(Number.isFinite) || fovYRadians <= 0 || fovYRadians >= Math.PI || aspect <= 0 || near <= 0) {
      throw new RangeError("Invalid perspective projection parameters.");
    }
    const top = near * Math.tan(fovYRadians / 2);
    const right = top * aspect;
    return Matrix4.frustum(-right, right, -top, top, near, far, options);
  }

  /** Perspective projection of a possibly asymmetric near-plane rectangle. */
  static frustum(left: number, right: number, bottom: number, top: number, near: number, far: number, options: ProjectionOptions = {}): Matrix4 {
    if (![left, right, bottom, top, near].every(Number.isFinite) || left >= right || bottom >= top || near <= 0 ||
        !(far === Infinity || (Number.isFinite(far) && far > near))) {
      throw new RangeError("Invalid perspective projection parameters.");
    }
    const [nearDepth, farDepth] = depthEndpoints(options);
    if (far === Infinity && options.mode === "logarithmic") {
      throw new RangeError("Logarithmic projection requires a finite far plane.");
    }
    // Solve z_ndc = -A + B / distance for the declared endpoint values.
    // Ratios avoid overflowing near * far for large but finite depth ranges.
    const ratio = far === Infinity ? 0 : near / far;
    const a = (nearDepth * ratio - farDepth) / (1 - ratio);
    const b = (nearDepth - farDepth) * near / (1 - ratio);
    const width = right - left;
    const height = top - bottom;
    return new Matrix4([
      2 * near / width, 0, 0, 0,
      0, 2 * near / height, 0, 0,
      (right + left) / width, (top + bottom) / height, a, -1,
      0, 0, b, 0
    ]);
  }

  static orthographic(left: number, right: number, bottom: number, top: number, near: number, far: number, options: ProjectionOptions = {}): Matrix4 {
    if (![left, right, bottom, top, near, far].every(Number.isFinite) || left === right || bottom === top || far <= near) {
      throw new RangeError("Invalid orthographic projection parameters.");
    }
    const [nearDepth, farDepth] = depthEndpoints(options);
    if (options.mode === "logarithmic" && near <= 0) {
      throw new RangeError("Logarithmic projection requires a positive near plane.");
    }
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const depthScale = (nearDepth - farDepth) / (far - near);
    return new Matrix4([
      -2 * lr, 0, 0, 0,
      0, -2 * bt, 0, 0,
      0, 0, depthScale, 0,
      (left + right) * lr, (top + bottom) * bt, nearDepth + depthScale * near, 1
    ]);
  }

  static lookAt(eye: Vector3, target: Vector3, up: Vector3): Matrix4 {
    if (
      !Number.isFinite(eye.x) || !Number.isFinite(eye.y) || !Number.isFinite(eye.z) ||
      !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z) ||
      !Number.isFinite(up.x) || !Number.isFinite(up.y) || !Number.isFinite(up.z)
    ) {
      throw new RangeError("Look-at eye, target, and up vectors must be finite.");
    }
    const forward = eye.subtract(target);
    const forwardLenSq = forward.lengthSquared();
    if (!Number.isFinite(forwardLenSq) || forwardLenSq < 1e-12) {
      throw new RangeError("Look-at eye and target must not be identical.");
    }
    const z = forward.multiplyScalar(1 / Math.sqrt(forwardLenSq));

    let rightRaw = up.lengthSquared() < 1e-12 ? Vector3.zero : up.cross(z);
    let rightLenSq = rightRaw.lengthSquared();
    if (!Number.isFinite(rightLenSq) || rightLenSq < 1e-12) {
      const fallbackUp = Math.abs(z.y) > 0.98 ? new Vector3(0, 0, 1) : Vector3.up;
      rightRaw = fallbackUp.cross(z);
      rightLenSq = rightRaw.lengthSquared();
    }
    const x = rightRaw.multiplyScalar(1 / Math.sqrt(rightLenSq));
    const y = z.cross(x).normalize();

    return new Matrix4([
      x.x, y.x, z.x, 0,
      x.y, y.y, z.y, 0,
      x.z, y.z, z.z, 0,
      -x.dot(eye), -y.dot(eye), -z.dot(eye), 1
    ]);
  }

  multiply(other: Matrix4): Matrix4 {
    const a = this.elements;
    const b = other.elements;
    const out = new Array<number>(16);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        out[col * 4 + row] =
          a[0 * 4 + row]! * b[col * 4 + 0]! +
          a[1 * 4 + row]! * b[col * 4 + 1]! +
          a[2 * 4 + row]! * b[col * 4 + 2]! +
          a[3 * 4 + row]! * b[col * 4 + 3]!;
      }
    }
    return new Matrix4(out as unknown as Matrix4["elements"]);
  }

  transformPoint(v: Vector3): Vector3 {
    const m = this.elements;
    const x = v.x;
    const y = v.y;
    const z = v.z;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const iw = w === 0 ? 1 : 1 / w;
    return new Vector3(
      (m[0] * x + m[4] * y + m[8] * z + m[12]) * iw,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) * iw,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) * iw
    );
  }

  transformVector4(v: Vector4): Vector4 {
    const m = this.elements;
    return new Vector4(
      m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12] * v.w,
      m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13] * v.w,
      m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14] * v.w,
      m[3] * v.x + m[7] * v.y + m[11] * v.z + m[15] * v.w
    );
  }

  transpose(): Matrix4 {
    const m = this.elements;
    return new Matrix4([
      m[0], m[4], m[8], m[12],
      m[1], m[5], m[9], m[13],
      m[2], m[6], m[10], m[14],
      m[3], m[7], m[11], m[15]
    ]);
  }

  determinant(): number {
    const m = this.elements;
    const m00 = m[0], m01 = m[4], m02 = m[8], m03 = m[12];
    const m10 = m[1], m11 = m[5], m12 = m[9], m13 = m[13];
    const m20 = m[2], m21 = m[6], m22 = m[10], m23 = m[14];
    const m30 = m[3], m31 = m[7], m32 = m[11], m33 = m[15];
    return (
      m03 * m12 * m21 * m30 - m02 * m13 * m21 * m30 -
      m03 * m11 * m22 * m30 + m01 * m13 * m22 * m30 +
      m02 * m11 * m23 * m30 - m01 * m12 * m23 * m30 -
      m03 * m12 * m20 * m31 + m02 * m13 * m20 * m31 +
      m03 * m10 * m22 * m31 - m00 * m13 * m22 * m31 -
      m02 * m10 * m23 * m31 + m00 * m12 * m23 * m31 +
      m03 * m11 * m20 * m32 - m01 * m13 * m20 * m32 -
      m03 * m10 * m21 * m32 + m00 * m13 * m21 * m32 +
      m01 * m10 * m23 * m32 - m00 * m11 * m23 * m32 -
      m02 * m11 * m20 * m33 + m01 * m12 * m20 * m33 +
      m02 * m10 * m21 * m33 - m00 * m12 * m21 * m33 -
      m01 * m10 * m22 * m33 + m00 * m11 * m22 * m33
    );
  }

  inverse(): Matrix4 {
    const m = this.elements;
    const inv = new Array<number>(16);

    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];

    const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    // An absolute epsilon incorrectly rejects valid small-scale transforms and
    // projections with a very near clipping plane. A zero/non-finite
    // determinant or a non-finite result is not invertible in this format.
    if (det === 0 || !Number.isFinite(det)) throw new RangeError("Matrix4 is singular.");
    const result = inv.map((value) => value / det);
    if (!result.every(Number.isFinite)) throw new RangeError("Matrix4 inverse is not finite.");
    return new Matrix4(result as unknown as Matrix4["elements"]);
  }

  decompose(): { position: Vector3; rotation: Quaternion; scale: Vector3 } {
    const m = this.elements;
    const position = new Vector3(m[12], m[13], m[14]);
    const sx = new Vector3(m[0], m[1], m[2]).length();
    const sy = new Vector3(m[4], m[5], m[6]).length();
    const sz = new Vector3(m[8], m[9], m[10]).length();
    if (sx === 0 || sy === 0 || sz === 0) throw new RangeError("Cannot decompose matrix with zero scale.");

    const det = this.determinant();
    const scale = new Vector3(det < 0 ? -sx : sx, sy, sz);
    const rotationMatrix = new Matrix4([
      m[0] / scale.x, m[1] / scale.x, m[2] / scale.x, 0,
      m[4] / scale.y, m[5] / scale.y, m[6] / scale.y, 0,
      m[8] / scale.z, m[9] / scale.z, m[10] / scale.z, 0,
      0, 0, 0, 1
    ]);

    return { position, rotation: Quaternion.fromRotationMatrix(rotationMatrix), scale };
  }

  getTranslation(): Vector3 {
    const m = this.elements;
    return new Vector3(m[12], m[13], m[14]);
  }

  /** three.js `getMaxScaleOnAxis` — sqrt of the largest column length squared. */
  maxScaleOnAxis(): number {
    const m = this.elements;
    const scaleXSq = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
    const scaleYSq = m[4] * m[4] + m[5] * m[5] + m[6] * m[6];
    const scaleZSq = m[8] * m[8] + m[9] * m[9] + m[10] * m[10];
    return Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq));
  }

  equals(matrix: Matrix4): boolean {
    const a = this.elements;
    const b = matrix.elements;
    for (let i = 0; i < 16; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}
