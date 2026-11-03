import { Matrix4 as ImmutableMatrix4 } from "../../Matrix4.js";

interface ElementsLike {
  readonly elements: ArrayLike<number>;
}

interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface Vec3Target extends Vec3Like {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): unknown;
  setFromMatrixColumn(m: Matrix4, index: number): unknown;
}

interface QuaternionLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

interface QuaternionTarget extends QuaternionLike {
  identity(): unknown;
  setFromRotationMatrix(m: Matrix4): unknown;
}

interface EulerLike extends Vec3Like {
  readonly order: string;
}

/** The normalized depth interval used after the perspective divide. */
export type ProjectionDepthRange = "minus-one-to-one" | "zero-to-one";

/** Numeric identifiers retained by the mutable math interface. */
export const WebGLCoordinateSystem = 2000;
export const WebGPUCoordinateSystem = 2001;

/**
 * Resolve an interface identifier to the corresponding clip-space depth interval.
 * OpenGL ES 3.0 §2.18 uses -w <= z <= w; WebGPU §23.2.4 uses 0 <= z <= w.
 * https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf
 * https://www.w3.org/TR/webgpu/#primitive-clipping
 */
export function projectionDepthRange(coordinateSystem: number): ProjectionDepthRange {
  if (coordinateSystem === WebGLCoordinateSystem) return "minus-one-to-one";
  if (coordinateSystem === WebGPUCoordinateSystem) return "zero-to-one";
  throw new RangeError(`Unsupported projection coordinate system: ${coordinateSystem}`);
}

// Form the span and midpoint ratios without overflowing when opposite, large
// finite bounds are supplied. The half-scaled path is only needed on overflow,
// preserving precision for subnormal and nearly coincident finite bounds.
function projectedAxis(low: number, high: number, scale: number): [number, number] {
  const span = high - low;
  const sum = high + low;
  const halfSpan = Number.isFinite(span) ? span / 2 : high / 2 - low / 2;
  const factor = Number.isFinite(span) ? 2 * (scale / span) : scale / halfSpan;
  const offset = Number.isFinite(sum) && Number.isFinite(span)
    ? sum / span
    : (high / 2 + low / 2) / halfSpan;
  return [factor, offset];
}

/** A column-major 4×4 matrix acting on column vectors. */
export class Matrix4 {
  readonly isMatrix4 = true;
  elements: number[];

  constructor(
    n11 = 1, n12 = 0, n13 = 0, n14 = 0,
    n21 = 0, n22 = 1, n23 = 0, n24 = 0,
    n31 = 0, n32 = 0, n33 = 1, n34 = 0,
    n41 = 0, n42 = 0, n43 = 0, n44 = 1,
  ) {
    this.elements = [n11, n21, n31, n41, n12, n22, n32, n42, n13, n23, n33, n43, n14, n24, n34, n44];
  }

  fromImmutable(m: ElementsLike): this {
    return this.copy(m);
  }

  toImmutable(): ImmutableMatrix4 {
    const e = this.elements;
    return new ImmutableMatrix4([
      e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7],
      e[8], e[9], e[10], e[11], e[12], e[13], e[14], e[15],
    ]);
  }

  set(
    n11: number, n12: number, n13: number, n14: number,
    n21: number, n22: number, n23: number, n24: number,
    n31: number, n32: number, n33: number, n34: number,
    n41: number, n42: number, n43: number, n44: number,
  ): this {
    const e = this.elements;
    e[0] = n11; e[4] = n12; e[8] = n13; e[12] = n14;
    e[1] = n21; e[5] = n22; e[9] = n23; e[13] = n24;
    e[2] = n31; e[6] = n32; e[10] = n33; e[14] = n34;
    e[3] = n41; e[7] = n42; e[11] = n43; e[15] = n44;
    return this;
  }

  identity(): this {
    return this.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }

  clone(): Matrix4 {
    return new Matrix4().copy(this);
  }

  copy(m: ElementsLike): this {
    return this.fromArray(m.elements);
  }

  copyPosition(m: ElementsLike): this {
    const e = m.elements;
    const x = e[12], y = e[13], z = e[14];
    this.elements[12] = x; this.elements[13] = y; this.elements[14] = z;
    return this;
  }

  setFromMatrix3(m: ElementsLike): this {
    const e = m.elements;
    return this.set(e[0], e[3], e[6], 0, e[1], e[4], e[7], 0, e[2], e[5], e[8], 0, 0, 0, 0, 1);
  }

  extractBasis(xAxis: Vec3Target, yAxis: Vec3Target, zAxis: Vec3Target): this {
    const snapshot = this.clone();
    xAxis.setFromMatrixColumn(snapshot, 0);
    yAxis.setFromMatrixColumn(snapshot, 1);
    zAxis.setFromMatrixColumn(snapshot, 2);
    return this;
  }

  makeBasis(xAxis: Vec3Like, yAxis: Vec3Like, zAxis: Vec3Like): this {
    return this.set(
      xAxis.x, yAxis.x, zAxis.x, 0,
      xAxis.y, yAxis.y, zAxis.y, 0,
      xAxis.z, yAxis.z, zAxis.z, 0,
      0, 0, 0, 1,
    );
  }

  /** Normalizes each spatial column; zero-length columns remain zero. */
  extractRotation(m: Matrix4): this {
    const e = m.elements.slice(0, 16);
    const sx = Math.hypot(e[0], e[1], e[2]);
    const sy = Math.hypot(e[4], e[5], e[6]);
    const sz = Math.hypot(e[8], e[9], e[10]);
    return this.set(
      sx ? e[0] / sx : 0, sy ? e[4] / sy : 0, sz ? e[8] / sz : 0, 0,
      sx ? e[1] / sx : 0, sy ? e[5] / sy : 0, sz ? e[9] / sz : 0, 0,
      sx ? e[2] / sx : 0, sy ? e[6] / sy : 0, sz ? e[10] / sz : 0, 0,
      0, 0, 0, 1,
    );
  }

  /** Euler rotations are composed in the named axis order. */
  makeRotationFromEuler(euler: EulerLike): this {
    const angles: Record<string, number> = { X: euler.x, Y: euler.y, Z: euler.z };
    if (!["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"].includes(euler.order)) {
      throw new RangeError(`Unsupported Euler order: ${euler.order}`);
    }
    let x = 0, y = 0, z = 0, w = 1;
    for (const axis of euler.order) {
      const half = angles[axis] / 2;
      const s = Math.sin(half), c = Math.cos(half);
      const ax = axis === "X" ? s : 0;
      const ay = axis === "Y" ? s : 0;
      const az = axis === "Z" ? s : 0;
      const nextX = w * ax + x * c + y * az - z * ay;
      const nextY = w * ay - x * az + y * c + z * ax;
      const nextZ = w * az + x * ay - y * ax + z * c;
      const nextW = w * c - x * ax - y * ay - z * az;
      x = nextX; y = nextY; z = nextZ; w = nextW;
    }
    return this.makeRotationFromQuaternion({ x, y, z, w });
  }

  /** The quaternion is expected to be unit length. */
  makeRotationFromQuaternion(q: QuaternionLike): this {
    const x = q.x, y = q.y, z = q.z, w = q.w;
    const xx = x * x, yy = y * y, zz = z * z;
    const xy = x * y, xz = x * z, yz = y * z;
    const wx = w * x, wy = w * y, wz = w * z;
    return this.set(
      1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy), 0,
      2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx), 0,
      2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy), 0,
      0, 0, 0, 1,
    );
  }

  /** Set the orientation so local +Z points from target to eye. */
  lookAt(eye: Vec3Like, target: Vec3Like, up: Vec3Like): this {
    let zx = eye.x - target.x, zy = eye.y - target.y, zz = eye.z - target.z;
    const zLength = Math.hypot(zx, zy, zz);
    if (zLength === 0) { zx = 0; zy = 0; zz = 1; }
    else { zx /= zLength; zy /= zLength; zz /= zLength; }
    let xx = up.y * zz - up.z * zy;
    let xy = up.z * zx - up.x * zz;
    let xz = up.x * zy - up.y * zx;
    let xLength = Math.hypot(xx, xy, xz);
    if (xLength === 0) {
      // Choose a well-separated fallback up vector when the supplied one
      // cannot determine a basis (zero or parallel to the viewing direction).
      const ux = Math.abs(zy) < 0.9 ? 0 : 1;
      const uy = ux === 0 ? 1 : 0;
      xx = uy * zz; xy = -ux * zz; xz = ux * zy - uy * zx;
      xLength = Math.hypot(xx, xy, xz);
    }
    xx /= xLength; xy /= xLength; xz /= xLength;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    const e = this.elements;
    e[0] = xx; e[1] = xy; e[2] = xz;
    e[4] = yx; e[5] = yy; e[6] = yz;
    e[8] = zx; e[9] = zy; e[10] = zz;
    return this;
  }

  multiply(m: ElementsLike): this {
    return this.multiplyMatrices(this, m);
  }

  premultiply(m: ElementsLike): this {
    return this.multiplyMatrices(m, this);
  }

  multiplyMatrices(a: ElementsLike, b: ElementsLike): this {
    const left = Array.from(a.elements).slice(0, 16);
    const right = Array.from(b.elements).slice(0, 16);
    const out = this.elements;
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += left[k * 4 + row] * right[col * 4 + k];
        out[col * 4 + row] = sum;
      }
    }
    return this;
  }

  multiplyScalar(s: number): this {
    for (let i = 0; i < 16; i++) this.elements[i] *= s;
    return this;
  }

  determinant(): number {
    const e = this.elements;
    let determinant = 0;
    for (let col = 0; col < 4; col++) {
      const minor: number[] = [];
      for (let row = 1; row < 4; row++) {
        for (let c = 0; c < 4; c++) if (c !== col) minor.push(e[c * 4 + row]);
      }
      const d = minor[0] * (minor[4] * minor[8] - minor[5] * minor[7])
        - minor[1] * (minor[3] * minor[8] - minor[5] * minor[6])
        + minor[2] * (minor[3] * minor[7] - minor[4] * minor[6]);
      determinant += (col % 2 === 0 ? 1 : -1) * e[col * 4] * d;
    }
    return determinant;
  }

  /** Determinant of the upper-left linear 3×3, for an affine transform. */
  determinantAffine(): number {
    const e = this.elements;
    return e[0] * (e[5] * e[10] - e[9] * e[6])
      - e[4] * (e[1] * e[10] - e[9] * e[2])
      + e[8] * (e[1] * e[6] - e[5] * e[2]);
  }

  transpose(): this {
    const e = this.elements;
    for (let row = 0; row < 4; row++) {
      for (let col = row + 1; col < 4; col++) {
        const a = col * 4 + row, b = row * 4 + col;
        [e[a], e[b]] = [e[b], e[a]];
      }
    }
    return this;
  }

  setPosition(x: number | Vec3Like, y = 0, z = 0): this {
    const px = typeof x === "number" ? x : x.x;
    const py = typeof x === "number" ? y : x.y;
    const pz = typeof x === "number" ? z : x.z;
    this.elements[12] = px; this.elements[13] = py; this.elements[14] = pz;
    return this;
  }

  /** Use pivoted elimination; singular matrices are replaced by zeros. */
  invert(): this {
    const e = this.elements;
    const rows = Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => c < 4 ? e[c * 4 + r] : Number(c - 4 === r)),
    );
    for (let col = 0; col < 4; col++) {
      let pivotRow = col;
      for (let row = col + 1; row < 4; row++) {
        if (Math.abs(rows[row][col]) > Math.abs(rows[pivotRow][col])) pivotRow = row;
      }
      if (rows[pivotRow][col] === 0) {
        return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
      [rows[col], rows[pivotRow]] = [rows[pivotRow], rows[col]];
      const pivot = rows[col][col];
      for (let c = 0; c < 8; c++) rows[col][c] /= pivot;
      for (let row = 0; row < 4; row++) {
        if (row === col) continue;
        const factor = rows[row][col];
        for (let c = 0; c < 8; c++) rows[row][c] -= factor * rows[col][c];
      }
    }
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) e[col * 4 + row] = rows[row][col + 4];
    }
    return this;
  }

  /** Scale the local axes, including the projective fourth row. */
  scale(v: Vec3Like): this {
    const x = v.x, y = v.y, z = v.z;
    for (let row = 0; row < 4; row++) {
      this.elements[row] *= x;
      this.elements[4 + row] *= y;
      this.elements[8 + row] *= z;
    }
    return this;
  }

  getMaxScaleOnAxis(): number {
    const e = this.elements;
    return Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
  }

  makeTranslation(x: number | Vec3Like, y = 0, z = 0): this {
    const tx = typeof x === "number" ? x : x.x;
    const ty = typeof x === "number" ? y : x.y;
    const tz = typeof x === "number" ? z : x.z;
    return this.set(1, 0, 0, tx, 0, 1, 0, ty, 0, 0, 1, tz, 0, 0, 0, 1);
  }

  makeRotationX(theta: number): this {
    const c = Math.cos(theta), s = Math.sin(theta);
    return this.set(1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1);
  }

  makeRotationY(theta: number): this {
    const c = Math.cos(theta), s = Math.sin(theta);
    return this.set(c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1);
  }

  makeRotationZ(theta: number): this {
    const c = Math.cos(theta), s = Math.sin(theta);
    return this.set(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }

  /** Rodrigues rotation around a unit axis. */
  makeRotationAxis(axis: Vec3Like, angle: number): this {
    const x = axis.x, y = axis.y, z = axis.z;
    const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    return this.set(
      t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0,
      t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0,
      t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0,
      0, 0, 0, 1,
    );
  }

  makeScale(x: number, y: number, z: number): this {
    return this.set(x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1);
  }

  /** Each coefficient names the output axis followed by the input axis. */
  makeShear(xy: number, xz: number, yx: number, yz: number, zx: number, zy: number): this {
    return this.set(1, xy, xz, 0, yx, 1, yz, 0, zx, zy, 1, 0, 0, 0, 0, 1);
  }

  compose(position: Vec3Like, quaternion: QuaternionLike, scale: Vec3Like): this {
    const px = position.x, py = position.y, pz = position.z;
    const sx = scale.x, sy = scale.y, sz = scale.z;
    const q = { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
    this.makeRotationFromQuaternion(q);
    this.scale({ x: sx, y: sy, z: sz });
    return this.setPosition(px, py, pz);
  }

  /**
   * Decompose a translation, rotation, and axis scale. A reflection is
   * assigned to X. A zero scale leaves rotation underdetermined, so returns
   * the identity quaternion instead of producing non-finite components.
   */
  decompose(position: Vec3Target, quaternion: QuaternionTarget, scale: Vec3Target): this {
    const e = this.elements.slice(0, 16);
    let sx = Math.hypot(e[0], e[1], e[2]);
    const sy = Math.hypot(e[4], e[5], e[6]);
    const sz = Math.hypot(e[8], e[9], e[10]);
    if (this.determinantAffine() < 0) sx = -sx;
    const rotation = sx !== 0 && sy !== 0 && sz !== 0 ? new Matrix4().set(
      e[0] / sx, e[4] / sy, e[8] / sz, 0,
      e[1] / sx, e[5] / sy, e[9] / sz, 0,
      e[2] / sx, e[6] / sy, e[10] / sz, 0,
      0, 0, 0, 1,
    ) : null;
    position.set(e[12], e[13], e[14]);
    if (rotation) quaternion.setFromRotationMatrix(rotation);
    else quaternion.identity();
    scale.set(sx, sy, sz);
    return this;
  }

  /**
   * Builds a right-handed perspective projection: the camera looks down -Z,
   * and near/far are positive distances. The depth range is explicit.
   */
  makePerspectiveForDepthRange(
    left: number, right: number, top: number, bottom: number,
    near: number, far: number, depthRange: ProjectionDepthRange, reversedDepth = false,
  ): this {
    if (![left, right, top, bottom, near].every(Number.isFinite) || right === left || top === bottom
      || near <= 0 || !(far > near) || (far !== Infinity && !Number.isFinite(far))) {
      throw new RangeError("Perspective bounds must be finite and nondegenerate, with 0 < near < far");
    }
    if (depthRange !== "minus-one-to-one" && depthRange !== "zero-to-one") {
      throw new RangeError("Unsupported projection depth range");
    }
    const low = depthRange === "zero-to-one" ? 0 : -1;
    const nearDepth = reversedDepth ? 1 : low;
    const farDepth = reversedDepth ? low : 1;
    // With w = -z, solve (-a * near + b) / near = nearDepth and
    // (-a * far + b) / far = farDepth. The quotient-first form avoids
    // overflowing near * far when the final coefficient is representable.
    const depthDifference = nearDepth - farDepth;
    const a = far === Infinity ? -farDepth : depthDifference * (near / (far - near)) - farDepth;
    const b = far === Infinity ? depthDifference * near : depthDifference * near * (far / (far - near));
    const [xScale, xOffset] = projectedAxis(left, right, near);
    const [yScale, yOffset] = projectedAxis(bottom, top, near);
    return this.set(
      xScale, 0, xOffset, 0,
      0, yScale, yOffset, 0,
      0, 0, a, b,
      0, 0, -1, 0,
    );
  }

  /** Builds a perspective projection for a numeric clip-space identifier. */
  makePerspective(
    left: number, right: number, top: number, bottom: number,
    near: number, far: number, coordinateSystem: number = WebGLCoordinateSystem, reversedDepth = false,
  ): this {
    return this.makePerspectiveForDepthRange(
      left, right, top, bottom, near, far, projectionDepthRange(coordinateSystem), reversedDepth,
    );
  }

  /** Builds a right-handed orthographic projection with an explicit depth interval. */
  makeOrthographicForDepthRange(
    left: number, right: number, top: number, bottom: number,
    near: number, far: number, depthRange: ProjectionDepthRange, reversedDepth = false,
  ): this {
    if (![left, right, top, bottom, near, far].every(Number.isFinite) || right === left || top === bottom || far <= near) {
      throw new RangeError("Orthographic bounds must be finite and nondegenerate, with near < far");
    }
    if (depthRange !== "minus-one-to-one" && depthRange !== "zero-to-one") {
      throw new RangeError("Unsupported projection depth range");
    }
    const low = depthRange === "zero-to-one" ? 0 : -1;
    const nearDepth = reversedDepth ? 1 : low;
    const farDepth = reversedDepth ? low : 1;
    const [xScale, xOffset] = projectedAxis(left, right, 1);
    const [yScale, yOffset] = projectedAxis(bottom, top, 1);
    const span = far - near;
    const numerator = nearDepth * far - farDepth * near;
    const halfSpan = Number.isFinite(span) ? span / 2 : far / 2 - near / 2;
    const zScale = Number.isFinite(span) ? (nearDepth - farDepth) / span : (nearDepth - farDepth) / 2 / halfSpan;
    const zOffset = Number.isFinite(numerator) && Number.isFinite(span)
      ? numerator / span
      : (nearDepth * (far / 2) - farDepth * (near / 2)) / halfSpan;
    return this.set(
      xScale, 0, 0, -xOffset,
      0, yScale, 0, -yOffset,
      0, 0, zScale, zOffset,
      0, 0, 0, 1,
    );
  }

  /** Builds an orthographic projection for a numeric clip-space identifier. */
  makeOrthographic(
    left: number, right: number, top: number, bottom: number,
    near: number, far: number, coordinateSystem: number = WebGLCoordinateSystem, reversedDepth = false,
  ): this {
    return this.makeOrthographicForDepthRange(
      left, right, top, bottom, near, far, projectionDepthRange(coordinateSystem), reversedDepth,
    );
  }

  equals(matrix: ElementsLike): boolean {
    const e = matrix.elements;
    for (let i = 0; i < 16; i++) if (this.elements[i] !== e[i]) return false;
    return true;
  }

  fromArray(array: ArrayLike<number>, offset = 0): this {
    const copy = Array.from({ length: 16 }, (_, i) => array[offset + i]);
    for (let i = 0; i < 16; i++) this.elements[i] = copy[i];
    return this;
  }

  toArray(array: number[] = [], offset = 0): number[] {
    const copy = this.elements.slice(0, 16);
    for (let i = 0; i < 16; i++) array[offset + i] = copy[i];
    return array;
  }
}
