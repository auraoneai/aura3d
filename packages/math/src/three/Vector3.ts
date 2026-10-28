import { clamp } from "../MathUtils.js";
import { Vector3 as ImmutableVector3 } from "../Vector3.js";
import { Quaternion } from "./Quaternion.js";
import type { Euler } from "./Euler.js";

/** Anything with the `{ x, y, z }` shape, including the immutable `@aura3d/math` Vector3. */
export interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Minimal buffer-attribute shape three's `fromBufferAttribute` reads. */
export interface BufferAttributeLike3 {
  getX(index: number): number;
  getY(index: number): number;
  getZ(index: number): number;
}

interface ElementsLike {
  readonly elements: ArrayLike<number>;
}

/** The camera fields `project` / `unproject` read (three's `Camera`). */
export interface ProjectionCameraLike {
  readonly matrixWorld: ElementsLike;
  readonly matrixWorldInverse: ElementsLike;
  readonly projectionMatrix: ElementsLike;
  readonly projectionMatrixInverse: ElementsLike;
}

/**
 * Mutable three.js-compatible 3-D vector. Every modifier mutates `this` and
 * returns `this`, exactly like three r185 `Vector3`. Use `fromImmutable` and
 * `toImmutable` to cross into the immutable `@aura3d/math` Vector3.
 */
export class Vector3 {
  declare readonly isVector3: true;

  x: number;
  y: number;
  z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /** Copy the components of an immutable `@aura3d/math` Vector3 (or any `{x, y, z}`) into this vector. */
  fromImmutable(v: Vector3Like): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  /** Snapshot as an immutable `@aura3d/math` Vector3 (throws on non-finite components, like that class). */
  toImmutable(): ImmutableVector3 {
    return new ImmutableVector3(this.x, this.y, this.z);
  }

  set(x: number, y: number, z?: number): this {
    if (z === undefined) z = this.z; // sprite.scale.set(x, y)
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  setScalar(scalar: number): this {
    this.x = scalar;
    this.y = scalar;
    this.z = scalar;
    return this;
  }

  setX(x: number): this {
    this.x = x;
    return this;
  }

  setY(y: number): this {
    this.y = y;
    return this;
  }

  setZ(z: number): this {
    this.z = z;
    return this;
  }

  setComponent(index: number, value: number): this {
    switch (index) {
      case 0: this.x = value; break;
      case 1: this.y = value; break;
      case 2: this.z = value; break;
      default: throw new Error(`THREE.Vector3: index is out of range: ${index}`);
    }
    return this;
  }

  getComponent(index: number): number {
    switch (index) {
      case 0: return this.x;
      case 1: return this.y;
      case 2: return this.z;
      default: throw new Error(`THREE.Vector3: index is out of range: ${index}`);
    }
  }

  clone(): this {
    return new (this.constructor as new (x: number, y: number, z: number) => this)(this.x, this.y, this.z);
  }

  copy(v: Vector3Like): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  add(v: Vector3Like): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  addScalar(s: number): this {
    this.x += s;
    this.y += s;
    this.z += s;
    return this;
  }

  addVectors(a: Vector3Like, b: Vector3Like): this {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    return this;
  }

  addScaledVector(v: Vector3Like, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }

  sub(v: Vector3Like): this {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  subScalar(s: number): this {
    this.x -= s;
    this.y -= s;
    this.z -= s;
    return this;
  }

  subVectors(a: Vector3Like, b: Vector3Like): this {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }

  multiply(v: Vector3Like): this {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    return this;
  }

  multiplyScalar(scalar: number): this {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }

  multiplyVectors(a: Vector3Like, b: Vector3Like): this {
    this.x = a.x * b.x;
    this.y = a.y * b.y;
    this.z = a.z * b.z;
    return this;
  }

  applyEuler(euler: Euler): this {
    return this.applyQuaternion(_quaternion.setFromEuler(euler));
  }

  applyAxisAngle(axis: Vector3Like, angle: number): this {
    return this.applyQuaternion(_quaternion.setFromAxisAngle(axis, angle));
  }

  applyMatrix3(m: ElementsLike): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const e = m.elements;
    this.x = e[0]! * x + e[3]! * y + e[6]! * z;
    this.y = e[1]! * x + e[4]! * y + e[7]! * z;
    this.z = e[2]! * x + e[5]! * y + e[8]! * z;
    return this;
  }

  applyNormalMatrix(m: ElementsLike): this {
    return this.applyMatrix3(m).normalize();
  }

  applyMatrix4(m: ElementsLike): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const e = m.elements;
    const w = 1 / (e[3]! * x + e[7]! * y + e[11]! * z + e[15]!);
    this.x = (e[0]! * x + e[4]! * y + e[8]! * z + e[12]!) * w;
    this.y = (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!) * w;
    this.z = (e[2]! * x + e[6]! * y + e[10]! * z + e[14]!) * w;
    return this;
  }

  applyQuaternion(q: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }): this {
    const vx = this.x;
    const vy = this.y;
    const vz = this.z;
    const qx = q.x;
    const qy = q.y;
    const qz = q.z;
    const qw = q.w;
    // t = 2 * cross(q.xyz, v)
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    // v + q.w * t + cross(q.xyz, t)
    this.x = vx + qw * tx + qy * tz - qz * ty;
    this.y = vy + qw * ty + qz * tx - qx * tz;
    this.z = vz + qw * tz + qx * ty - qy * tx;
    return this;
  }

  project(camera: ProjectionCameraLike): this {
    return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  }

  unproject(camera: ProjectionCameraLike): this {
    return this.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
  }

  transformDirection(m: ElementsLike): this {
    // input: THREE.Matrix4 affine matrix; vector does not have to be a unit vector
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const e = m.elements;
    this.x = e[0]! * x + e[4]! * y + e[8]! * z;
    this.y = e[1]! * x + e[5]! * y + e[9]! * z;
    this.z = e[2]! * x + e[6]! * y + e[10]! * z;
    return this.normalize();
  }

  divide(v: Vector3Like): this {
    this.x /= v.x;
    this.y /= v.y;
    this.z /= v.z;
    return this;
  }

  divideScalar(scalar: number): this {
    return this.multiplyScalar(1 / scalar);
  }

  min(v: Vector3Like): this {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    this.z = Math.min(this.z, v.z);
    return this;
  }

  max(v: Vector3Like): this {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    this.z = Math.max(this.z, v.z);
    return this;
  }

  clamp(min: Vector3Like, max: Vector3Like): this {
    this.x = clamp(this.x, min.x, max.x);
    this.y = clamp(this.y, min.y, max.y);
    this.z = clamp(this.z, min.z, max.z);
    return this;
  }

  clampScalar(minVal: number, maxVal: number): this {
    this.x = clamp(this.x, minVal, maxVal);
    this.y = clamp(this.y, minVal, maxVal);
    this.z = clamp(this.z, minVal, maxVal);
    return this;
  }

  clampLength(min: number, max: number): this {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(clamp(length, min, max));
  }

  floor(): this {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    this.z = Math.floor(this.z);
    return this;
  }

  ceil(): this {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    this.z = Math.ceil(this.z);
    return this;
  }

  round(): this {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    this.z = Math.round(this.z);
    return this;
  }

  roundToZero(): this {
    this.x = Math.trunc(this.x);
    this.y = Math.trunc(this.y);
    this.z = Math.trunc(this.z);
    return this;
  }

  negate(): this {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  dot(v: Vector3Like): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  manhattanLength(): number {
    return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z);
  }

  normalize(): this {
    return this.divideScalar(this.length() || 1);
  }

  setLength(length: number): this {
    return this.normalize().multiplyScalar(length);
  }

  lerp(v: Vector3Like, alpha: number): this {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    return this;
  }

  lerpVectors(v1: Vector3Like, v2: Vector3Like, alpha: number): this {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    this.z = v1.z + (v2.z - v1.z) * alpha;
    return this;
  }

  cross(v: Vector3Like): this {
    return this.crossVectors(this, v);
  }

  crossVectors(a: Vector3Like, b: Vector3Like): this {
    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    const bx = b.x;
    const by = b.y;
    const bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }

  projectOnVector(v: Vector3): this {
    const denominator = v.lengthSq();
    if (denominator === 0) return this.set(0, 0, 0);
    const scalar = v.dot(this) / denominator;
    return this.copy(v).multiplyScalar(scalar);
  }

  projectOnPlane(planeNormal: Vector3): this {
    _vector.copy(this).projectOnVector(planeNormal);
    return this.sub(_vector);
  }

  reflect(normal: Vector3Like): this {
    // reflect incident vector off plane orthogonal to normal; normal is assumed to have unit length
    return this.sub(_vector.copy(normal).multiplyScalar(2 * this.dot(normal)));
  }

  angleTo(v: Vector3): number {
    const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());
    if (denominator === 0) return Math.PI / 2;
    const theta = this.dot(v) / denominator;
    // clamp, to handle numerical problems
    return Math.acos(clamp(theta, -1, 1));
  }

  distanceTo(v: Vector3Like): number {
    return Math.sqrt(this.distanceToSquared(v));
  }

  distanceToSquared(v: Vector3Like): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }

  manhattanDistanceTo(v: Vector3Like): number {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z);
  }

  setFromSpherical(s: { readonly radius: number; readonly phi: number; readonly theta: number }): this {
    return this.setFromSphericalCoords(s.radius, s.phi, s.theta);
  }

  setFromSphericalCoords(radius: number, phi: number, theta: number): this {
    const sinPhiRadius = Math.sin(phi) * radius;
    this.x = sinPhiRadius * Math.sin(theta);
    this.y = Math.cos(phi) * radius;
    this.z = sinPhiRadius * Math.cos(theta);
    return this;
  }

  setFromCylindrical(c: { readonly radius: number; readonly theta: number; readonly y: number }): this {
    return this.setFromCylindricalCoords(c.radius, c.theta, c.y);
  }

  setFromCylindricalCoords(radius: number, theta: number, y: number): this {
    this.x = radius * Math.sin(theta);
    this.y = y;
    this.z = radius * Math.cos(theta);
    return this;
  }

  setFromMatrixPosition(m: ElementsLike): this {
    const e = m.elements;
    this.x = e[12]!;
    this.y = e[13]!;
    this.z = e[14]!;
    return this;
  }

  setFromMatrixScale(m: ElementsLike): this {
    const sx = this.setFromMatrixColumn(m, 0).length();
    const sy = this.setFromMatrixColumn(m, 1).length();
    const sz = this.setFromMatrixColumn(m, 2).length();
    this.x = sx;
    this.y = sy;
    this.z = sz;
    return this;
  }

  setFromMatrixColumn(m: ElementsLike, index: number): this {
    return this.fromArray(m.elements, index * 4);
  }

  setFromMatrix3Column(m: ElementsLike, index: number): this {
    return this.fromArray(m.elements, index * 3);
  }

  setFromEuler(e: { readonly x: number; readonly y: number; readonly z: number }): this {
    this.x = e.x;
    this.y = e.y;
    this.z = e.z;
    return this;
  }

  setFromColor(c: { readonly r: number; readonly g: number; readonly b: number }): this {
    this.x = c.r;
    this.y = c.g;
    this.z = c.b;
    return this;
  }

  equals(v: Vector3Like): boolean {
    return v.x === this.x && v.y === this.y && v.z === this.z;
  }

  fromArray(array: ArrayLike<number>, offset = 0): this {
    this.x = array[offset]!;
    this.y = array[offset + 1]!;
    this.z = array[offset + 2]!;
    return this;
  }

  toArray(array: number[] = [], offset = 0): number[] {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    return array;
  }

  fromBufferAttribute(attribute: BufferAttributeLike3, index: number): this {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);
    return this;
  }

  random(): this {
    this.x = Math.random();
    this.y = Math.random();
    this.z = Math.random();
    return this;
  }

  randomDirection(): this {
    // https://mathworld.wolfram.com/SpherePointPicking.html
    const theta = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const c = Math.sqrt(1 - u * u);
    this.x = c * Math.cos(theta);
    this.y = u;
    this.z = c * Math.sin(theta);
    return this;
  }

  *[Symbol.iterator](): Generator<number, void, undefined> {
    yield this.x;
    yield this.y;
    yield this.z;
  }
}

(Vector3.prototype as { isVector3: boolean }).isVector3 = true;

const _vector = new Vector3();
const _quaternion = new Quaternion();
