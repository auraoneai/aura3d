import { Vector3 as ImmutableVector3 } from "../../Vector3.js";

export interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BufferAttributeLike3 {
  getX(index: number): number;
  getY(index: number): number;
  getZ(index: number): number;
}

interface ElementsLike {
  readonly elements: ArrayLike<number>;
}

interface EulerLike extends Vector3Like {
  readonly order: string;
}

export interface ProjectionCameraLike {
  readonly matrixWorld: ElementsLike;
  readonly matrixWorldInverse: ElementsLike;
  readonly projectionMatrix: ElementsLike;
  readonly projectionMatrixInverse: ElementsLike;
}

// Scaling first preserves directions when squared magnitudes would underflow
// or overflow, including finite vectors whose true length exceeds MAX_VALUE.
function unitComponents(x: number, y: number, z: number): [number, number, number] | undefined {
  const scale = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
  if (scale === 0) return undefined;
  const sx = x / scale, sy = y / scale, sz = z / scale;
  const length = Math.hypot(sx, sy, sz);
  return [sx / length, sy / length, sz / length];
}

/**
 * Mutable Cartesian vector. Matrices use column-major storage and column
 * vectors. Quaternion and axis-angle rotation inputs are assumed to be unit
 * rotations, and reflection expects a unit normal. Camera projection uses
 * homogeneous division. The zero vector stays zero when normalized or
 * projected onto a zero axis; the angle to a zero vector is π/2.
 */
export class Vector3 {
  readonly isVector3 = true;

  constructor(public x = 0, public y = 0, public z = 0) {}

  fromImmutable(v: Vector3Like): this { return this.copy(v); }
  toImmutable(): ImmutableVector3 { return new ImmutableVector3(this.x, this.y, this.z); }

  set(x: number, y: number, z = this.z): this {
    this.x = x; this.y = y; this.z = z;
    return this;
  }

  setScalar(scalar: number): this { return this.set(scalar, scalar, scalar); }
  setX(x: number): this { this.x = x; return this; }
  setY(y: number): this { this.y = y; return this; }
  setZ(z: number): this { this.z = z; return this; }

  setComponent(index: number, value: number): this {
    switch (index) {
      case 0: this.x = value; break;
      case 1: this.y = value; break;
      case 2: this.z = value; break;
      default: throw new RangeError(`Vector3 component index out of range: ${index}`);
    }
    return this;
  }

  getComponent(index: number): number {
    switch (index) {
      case 0: return this.x;
      case 1: return this.y;
      case 2: return this.z;
      default: throw new RangeError(`Vector3 component index out of range: ${index}`);
    }
  }

  clone(): this {
    const VectorType = this.constructor as new (x: number, y: number, z: number) => this;
    return new VectorType(this.x, this.y, this.z);
  }

  copy(v: Vector3Like): this { return this.set(v.x, v.y, v.z); }
  add(v: Vector3Like): this { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
  addScalar(s: number): this { return this.set(this.x + s, this.y + s, this.z + s); }
  addVectors(a: Vector3Like, b: Vector3Like): this { return this.set(a.x + b.x, a.y + b.y, a.z + b.z); }
  addScaledVector(v: Vector3Like, s: number): this { return this.set(this.x + s * v.x, this.y + s * v.y, this.z + s * v.z); }
  sub(v: Vector3Like): this { return this.set(this.x - v.x, this.y - v.y, this.z - v.z); }
  subScalar(s: number): this { return this.set(this.x - s, this.y - s, this.z - s); }
  subVectors(a: Vector3Like, b: Vector3Like): this { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); }
  multiply(v: Vector3Like): this { return this.set(this.x * v.x, this.y * v.y, this.z * v.z); }
  multiplyScalar(scalar: number): this { return this.set(this.x * scalar, this.y * scalar, this.z * scalar); }
  multiplyVectors(a: Vector3Like, b: Vector3Like): this { return this.set(a.x * b.x, a.y * b.y, a.z * b.z); }

  applyEuler(euler: EulerLike): this {
    const { x, y, z, order } = euler;
    if (!["XYZ", "YXZ", "ZXY", "ZYX", "YZX", "XZY"].includes(order)) {
      throw new RangeError(`Invalid Euler order: ${order}`);
    }
    // R(order[0]) R(order[1]) R(order[2]) acts right-to-left.
    for (let i = 2; i >= 0; i--) {
      const axis = order[i];
      const angle = axis === "X" ? x : axis === "Y" ? y : z;
      const c = Math.cos(angle), s = Math.sin(angle);
      const vx = this.x, vy = this.y, vz = this.z;
      if (axis === "X") this.set(vx, c * vy - s * vz, s * vy + c * vz);
      else if (axis === "Y") this.set(c * vx + s * vz, vy, -s * vx + c * vz);
      else this.set(c * vx - s * vy, s * vx + c * vy, vz);
    }
    return this;
  }

  applyAxisAngle(axis: Vector3Like, angle: number): this {
    const half = angle / 2, sin = Math.sin(half);
    return this.applyQuaternion({ x: axis.x * sin, y: axis.y * sin, z: axis.z * sin, w: Math.cos(half) });
  }

  applyMatrix3(m: ElementsLike): this {
    const e = m.elements, { x, y, z } = this;
    return this.set(e[0] * x + e[3] * y + e[6] * z,
      e[1] * x + e[4] * y + e[7] * z,
      e[2] * x + e[5] * y + e[8] * z);
  }

  applyNormalMatrix(m: ElementsLike): this { return this.applyMatrix3(m).normalize(); }

  applyMatrix4(m: ElementsLike): this {
    const e = m.elements, { x, y, z } = this;
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    return this.set((e[0] * x + e[4] * y + e[8] * z + e[12]) / w,
      (e[1] * x + e[5] * y + e[9] * z + e[13]) / w,
      (e[2] * x + e[6] * y + e[10] * z + e[14]) / w);
  }

  applyQuaternion(q: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }): this {
    const { x, y, z } = this;
    const { x: qx, y: qy, z: qz, w: qw } = q;
    // Compute q * (0, v) * conjugate(q); unit q preserves lengths.
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    return this.set(ix * qw - iw * qx - iy * qz + iz * qy,
      iy * qw - iw * qy - iz * qx + ix * qz,
      iz * qw - iw * qz - ix * qy + iy * qx);
  }

  project(camera: ProjectionCameraLike): this {
    return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  }

  unproject(camera: ProjectionCameraLike): this {
    return this.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
  }

  transformDirection(m: ElementsLike): this {
    const e = m.elements, { x, y, z } = this;
    return this.set(e[0] * x + e[4] * y + e[8] * z,
      e[1] * x + e[5] * y + e[9] * z,
      e[2] * x + e[6] * y + e[10] * z).normalize();
  }

  divide(v: Vector3Like): this { return this.set(this.x / v.x, this.y / v.y, this.z / v.z); }
  divideScalar(scalar: number): this { return this.multiplyScalar(1 / scalar); }
  min(v: Vector3Like): this { return this.set(Math.min(this.x, v.x), Math.min(this.y, v.y), Math.min(this.z, v.z)); }
  max(v: Vector3Like): this { return this.set(Math.max(this.x, v.x), Math.max(this.y, v.y), Math.max(this.z, v.z)); }
  clamp(min: Vector3Like, max: Vector3Like): this {
    return this.set(Math.max(min.x, Math.min(max.x, this.x)),
      Math.max(min.y, Math.min(max.y, this.y)), Math.max(min.z, Math.min(max.z, this.z)));
  }
  clampScalar(minVal: number, maxVal: number): this {
    return this.set(Math.max(minVal, Math.min(maxVal, this.x)),
      Math.max(minVal, Math.min(maxVal, this.y)), Math.max(minVal, Math.min(maxVal, this.z)));
  }
  clampLength(min: number, max: number): this {
    const length = this.length();
    const clamped = Math.max(min, Math.min(max, length));
    return length === 0 || length === clamped ? this : this.normalize().multiplyScalar(clamped);
  }
  floor(): this { return this.set(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)); }
  ceil(): this { return this.set(Math.ceil(this.x), Math.ceil(this.y), Math.ceil(this.z)); }
  round(): this { return this.set(Math.round(this.x), Math.round(this.y), Math.round(this.z)); }
  roundToZero(): this { return this.set(Math.trunc(this.x), Math.trunc(this.y), Math.trunc(this.z)); }
  negate(): this { return this.set(-this.x, -this.y, -this.z); }
  dot(v: Vector3Like): number { return this.x * v.x + this.y * v.y + this.z * v.z; }
  lengthSq(): number { return this.dot(this); }
  length(): number { return Math.hypot(this.x, this.y, this.z); }
  manhattanLength(): number { return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z); }
  normalize(): this {
    const unit = unitComponents(this.x, this.y, this.z);
    return unit ? this.set(unit[0], unit[1], unit[2]) : this;
  }
  setLength(length: number): this { return this.normalize().multiplyScalar(length); }
  lerp(v: Vector3Like, alpha: number): this {
    return this.set(this.x + (v.x - this.x) * alpha, this.y + (v.y - this.y) * alpha,
      this.z + (v.z - this.z) * alpha);
  }
  lerpVectors(v1: Vector3Like, v2: Vector3Like, alpha: number): this {
    return this.set(v1.x + (v2.x - v1.x) * alpha, v1.y + (v2.y - v1.y) * alpha,
      v1.z + (v2.z - v1.z) * alpha);
  }
  cross(v: Vector3Like): this { return this.crossVectors(this, v); }
  crossVectors(a: Vector3Like, b: Vector3Like): this {
    const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
    return this.set(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  }
  projectOnVector(v: Vector3Like): this {
    const unit = unitComponents(v.x, v.y, v.z);
    if (!unit) return this.setScalar(0);
    const factor = this.x * unit[0] + this.y * unit[1] + this.z * unit[2];
    return this.set(unit[0] * factor, unit[1] * factor, unit[2] * factor);
  }
  projectOnPlane(planeNormal: Vector3Like): this {
    const unit = unitComponents(planeNormal.x, planeNormal.y, planeNormal.z);
    if (!unit) return this;
    const factor = this.x * unit[0] + this.y * unit[1] + this.z * unit[2];
    return this.set(this.x - unit[0] * factor, this.y - unit[1] * factor,
      this.z - unit[2] * factor);
  }
  reflect(normal: Vector3Like): this {
    const factor = 2 * this.dot(normal);
    return this.set(this.x - factor * normal.x, this.y - factor * normal.y, this.z - factor * normal.z);
  }
  angleTo(v: Vector3Like): number {
    const a = unitComponents(this.x, this.y, this.z), b = unitComponents(v.x, v.y, v.z);
    if (!a || !b) return Math.PI / 2;
    return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  }
  distanceTo(v: Vector3Like): number { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  distanceToSquared(v: Vector3Like): number {
    return (this.x - v.x) ** 2 + (this.y - v.y) ** 2 + (this.z - v.z) ** 2;
  }
  manhattanDistanceTo(v: Vector3Like): number {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z);
  }

  setFromSpherical(s: { readonly radius: number; readonly phi: number; readonly theta: number }): this {
    return this.setFromSphericalCoords(s.radius, s.phi, s.theta);
  }
  setFromSphericalCoords(radius: number, phi: number, theta: number): this {
    const horizontal = radius * Math.sin(phi);
    return this.set(horizontal * Math.sin(theta), radius * Math.cos(phi), horizontal * Math.cos(theta));
  }
  setFromCylindrical(c: { readonly radius: number; readonly theta: number; readonly y: number }): this {
    return this.setFromCylindricalCoords(c.radius, c.theta, c.y);
  }
  setFromCylindricalCoords(radius: number, theta: number, y: number): this {
    return this.set(radius * Math.sin(theta), y, radius * Math.cos(theta));
  }
  setFromMatrixPosition(m: ElementsLike): this { return this.set(m.elements[12], m.elements[13], m.elements[14]); }
  setFromMatrixScale(m: ElementsLike): this {
    const e = m.elements;
    return this.set(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
  }
  setFromMatrixColumn(m: ElementsLike, index: number): this { return this.fromArray(m.elements, index * 4); }
  setFromMatrix3Column(m: ElementsLike, index: number): this { return this.fromArray(m.elements, index * 3); }
  setFromEuler(e: Vector3Like): this { return this.copy(e); }
  setFromColor(c: { readonly r: number; readonly g: number; readonly b: number }): this { return this.set(c.r, c.g, c.b); }
  equals(v: Vector3Like): boolean { return this.x === v.x && this.y === v.y && this.z === v.z; }
  fromArray(array: ArrayLike<number>, offset = 0): this { return this.set(array[offset], array[offset + 1], array[offset + 2]); }
  toArray(array: number[] = [], offset = 0): number[] {
    array[offset] = this.x; array[offset + 1] = this.y; array[offset + 2] = this.z;
    return array;
  }
  fromBufferAttribute(attribute: BufferAttributeLike3, index: number): this {
    return this.set(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
  }
  random(): this { return this.set(Math.random(), Math.random(), Math.random()); }
  randomDirection(): this {
    const z = 2 * Math.random() - 1, angle = 2 * Math.PI * Math.random();
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    return this.set(radius * Math.cos(angle), radius * Math.sin(angle), z);
  }
  *[Symbol.iterator](): Generator<number, void, undefined> {
    yield this.x; yield this.y; yield this.z;
  }
}
