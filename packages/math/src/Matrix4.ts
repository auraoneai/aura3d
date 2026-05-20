import { Quaternion } from "./Quaternion.js";
import { Vector3 } from "./Vector3.js";
import { Vector4 } from "./Vector4.js";

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

  static perspective(fovYRadians: number, aspect: number, near: number, far: number): Matrix4 {
    if (![fovYRadians, aspect, near, far].every(Number.isFinite) || fovYRadians <= 0 || aspect <= 0 || near <= 0 || far <= near) {
      throw new RangeError("Invalid perspective projection parameters.");
    }
    const f = 1 / Math.tan(fovYRadians / 2);
    const nf = 1 / (near - far);
    return new Matrix4([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  static orthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): Matrix4 {
    if (![left, right, bottom, top, near, far].every(Number.isFinite) || left === right || bottom === top || near === far) {
      throw new RangeError("Invalid orthographic projection parameters.");
    }
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    return new Matrix4([
      -2 * lr, 0, 0, 0,
      0, -2 * bt, 0, 0,
      0, 0, 2 * nf, 0,
      (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1
    ]);
  }

  static lookAt(eye: Vector3, target: Vector3, up: Vector3): Matrix4 {
    const z = eye.subtract(target).normalize();
    if (z.lengthSquared() === 0) throw new RangeError("Look-at eye and target must not be identical.");

    let x = up.cross(z).normalize();
    if (x.lengthSquared() === 0) {
      const fallbackUp = Math.abs(up.z) === 1 ? Vector3.up : Vector3.forward;
      x = fallbackUp.cross(z).normalize();
    }
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
    if (Math.abs(det) < 1e-12) throw new RangeError("Matrix4 is singular.");
    return new Matrix4(inv.map((value) => value / det) as unknown as Matrix4["elements"]);
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
}
