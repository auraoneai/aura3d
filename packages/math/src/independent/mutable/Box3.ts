import { Box3 as ImmutableBox3 } from "../../Box3.js";
import { Vector3 as ImmutableVector3 } from "../../Vector3.js";
import type { Matrix4 } from "./Matrix4.js";
import type { Sphere } from "./Sphere.js";
import { Vector3, type Vector3Like } from "./Vector3.js";

export interface Box3Like {
  readonly min: Vector3Like;
  readonly max: Vector3Like;
}

export interface TriangleLike {
  readonly a: Vector3Like;
  readonly b: Vector3Like;
  readonly c: Vector3Like;
}

export interface PositionAttributeLike {
  readonly count: number;
  getX(index: number): number;
  getY(index: number): number;
  getZ(index: number): number;
}

export interface Box3ObjectLike {
  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
  readonly matrixWorld: Matrix4;
  readonly children: readonly Box3ObjectLike[];
  readonly geometry?: {
    boundingBox: Box3 | null;
    getAttribute(name: string): PositionAttributeLike | undefined;
    computeBoundingBox(): void;
  };
  readonly boundingBox?: Box3 | null;
  readonly isMesh?: boolean;
  readonly isInstancedMesh?: boolean;
  computeBoundingBox?(): void;
  getVertexPosition?(index: number, target: Vector3): Vector3;
}

/** An axis-aligned box. A reversed interval on any axis represents an empty box. */
export class Box3 {
  readonly isBox3 = true;
  min: Vector3;
  max: Vector3;

  constructor(
    min: Vector3 = new Vector3(Infinity, Infinity, Infinity),
    max: Vector3 = new Vector3(-Infinity, -Infinity, -Infinity)
  ) {
    this.min = min;
    this.max = max;
  }

  fromImmutable(box: Box3Like): this { return this.copy(box); }

  toImmutable(): ImmutableBox3 {
    return new ImmutableBox3(
      new ImmutableVector3(this.min.x, this.min.y, this.min.z),
      new ImmutableVector3(this.max.x, this.max.y, this.max.z)
    );
  }

  set(min: Vector3Like, max: Vector3Like): this {
    const minX = min.x, minY = min.y, minZ = min.z;
    const maxX = max.x, maxY = max.y, maxZ = max.z;
    setBounds(this, minX, minY, minZ, maxX, maxY, maxZ);
    return this;
  }

  setFromArray(array: ArrayLike<number>): this {
    const bounds = new Box3();
    for (let i = 0; i + 2 < array.length; i += 3) {
      expandCoordinates(bounds, array[i]!, array[i + 1]!, array[i + 2]!);
    }
    return this.copy(bounds);
  }

  setFromBufferAttribute(attribute: PositionAttributeLike): this {
    const bounds = new Box3();
    for (let i = 0; i < attribute.count; i += 1) {
      expandCoordinates(bounds, attribute.getX(i), attribute.getY(i), attribute.getZ(i));
    }
    return this.copy(bounds);
  }

  setFromPoints(points: readonly Vector3Like[]): this {
    // Build separately so a point may safely alias min or max.
    const bounds = new Box3();
    for (const point of points) expandCoordinates(bounds, point.x, point.y, point.z);
    return this.copy(bounds);
  }

  setFromCenterAndSize(center: Vector3Like, size: Vector3Like): this {
    const x = center.x, y = center.y, z = center.z;
    const halfX = size.x / 2, halfY = size.y / 2, halfZ = size.z / 2;
    setBounds(this, x - halfX, y - halfY, z - halfZ, x + halfX, y + halfY, z + halfZ);
    return this;
  }

  setFromObject(object: Box3ObjectLike, precise = false): this {
    const bounds = new Box3().expandByObject(object, precise);
    return this.copy(bounds);
  }

  clone(): this {
    const Constructor = this.constructor as new (min?: Vector3, max?: Vector3) => this;
    return new Constructor(
      new Vector3(this.min.x, this.min.y, this.min.z),
      new Vector3(this.max.x, this.max.y, this.max.z)
    );
  }

  copy(box: Box3Like): this { return this.set(box.min, box.max); }

  makeEmpty(): this {
    setBounds(this, Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity);
    return this;
  }

  isEmpty(): boolean {
    return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
  }

  getCenter(target: Vector3): Vector3 {
    if (this.isEmpty()) return target.set(0, 0, 0);
    const x = intervalCenter(this.min.x, this.max.x);
    const y = intervalCenter(this.min.y, this.max.y);
    const z = intervalCenter(this.min.z, this.max.z);
    return target.set(x, y, z);
  }

  getSize(target: Vector3): Vector3 {
    if (this.isEmpty()) return target.set(0, 0, 0);
    const x = this.max.x - this.min.x, y = this.max.y - this.min.y, z = this.max.z - this.min.z;
    return target.set(x, y, z);
  }

  expandByPoint(point: Vector3Like): this {
    expandCoordinates(this, point.x, point.y, point.z);
    return this;
  }

  expandByVector(vector: Vector3Like): this {
    if (this.isEmpty()) return this;
    const x = vector.x, y = vector.y, z = vector.z;
    const minX = this.min.x - x, minY = this.min.y - y, minZ = this.min.z - z;
    const maxX = this.max.x + x, maxY = this.max.y + y, maxZ = this.max.z + z;
    setBounds(this, minX, minY, minZ, maxX, maxY, maxZ);
    return this;
  }

  expandByScalar(scalar: number): this {
    return this.expandByVector({ x: scalar, y: scalar, z: scalar });
  }

  expandByObject(object: Box3ObjectLike, precise = false): this {
    object.updateWorldMatrix(true, false);
    const geometry = object.geometry;
    const positions = precise && !object.isInstancedMesh ? geometry?.getAttribute("position") : undefined;
    if (positions) {
      const vertex = new Vector3();
      const bounds = new Box3();
      for (let i = 0; i < positions.count; i += 1) {
        const position = object.isMesh && object.getVertexPosition
          ? object.getVertexPosition(i, vertex)
          : vertex.set(positions.getX(i), positions.getY(i), positions.getZ(i));
        const [x, y, z] = transformPoint(position.x, position.y, position.z, object.matrixWorld.elements);
        expandCoordinates(bounds, x, y, z);
      }
      this.union(bounds);
    } else {
      let box: Box3Like | null | undefined;
      if (object.boundingBox !== undefined) {
        if (object.boundingBox === null) object.computeBoundingBox?.();
        box = object.boundingBox;
      }
      if (!box && geometry) {
        if (geometry.boundingBox === null) geometry.computeBoundingBox();
        box = geometry.boundingBox;
      }
      if (box) this.union(new Box3().copy(box).applyMatrix4(object.matrixWorld));
    }
    for (const child of object.children) this.expandByObject(child, precise);
    return this;
  }

  containsPoint(point: Vector3Like): boolean {
    return point.x >= this.min.x && point.x <= this.max.x
      && point.y >= this.min.y && point.y <= this.max.y
      && point.z >= this.min.z && point.z <= this.max.z;
  }

  containsBox(box: Box3Like): boolean {
    if (isEmptyBox(box)) return true;
    if (this.isEmpty()) return false;
    return box.min.x >= this.min.x && box.max.x <= this.max.x
      && box.min.y >= this.min.y && box.max.y <= this.max.y
      && box.min.z >= this.min.z && box.max.z <= this.max.z;
  }

  getParameter(point: Vector3Like, target: Vector3): Vector3 {
    const x = (point.x - this.min.x) / (this.max.x - this.min.x);
    const y = (point.y - this.min.y) / (this.max.y - this.min.y);
    const z = (point.z - this.min.z) / (this.max.z - this.min.z);
    return target.set(x, y, z);
  }

  intersectsBox(box: Box3Like): boolean {
    if (this.isEmpty() || isEmptyBox(box)) return false;
    return box.max.x >= this.min.x && box.min.x <= this.max.x
      && box.max.y >= this.min.y && box.min.y <= this.max.y
      && box.max.z >= this.min.z && box.min.z <= this.max.z;
  }

  intersectsSphere(sphere: { readonly center: Vector3Like; readonly radius: number }): boolean {
    if (this.isEmpty() || sphere.radius < 0) return false;
    const { x, y, z } = sphere.center;
    const dx = x - clamp(x, this.min.x, this.max.x);
    const dy = y - clamp(y, this.min.y, this.max.y);
    const dz = z - clamp(z, this.min.z, this.max.z);
    return Math.hypot(dx, dy, dz) <= sphere.radius;
  }

  intersectsPlane(plane: { readonly normal: Vector3Like; readonly constant: number }): boolean {
    if (this.isEmpty()) return false;
    const { x, y, z } = plane.normal;
    if (![x, y, z, plane.constant].every(Number.isFinite)) return false;
    const low = planeExpressionSign(
      x, y, z, plane.constant,
      x >= 0 ? this.min.x : this.max.x,
      y >= 0 ? this.min.y : this.max.y,
      z >= 0 ? this.min.z : this.max.z
    );
    const high = planeExpressionSign(
      x, y, z, plane.constant,
      x >= 0 ? this.max.x : this.min.x,
      y >= 0 ? this.max.y : this.min.y,
      z >= 0 ? this.max.z : this.min.z
    );
    return low <= 0 && high >= 0;
  }

  intersectsTriangle(triangle: TriangleLike): boolean {
    if (this.isEmpty()) return false;
    if (![this.min.x, this.min.y, this.min.z, this.max.x, this.max.y, this.max.z].every(Number.isFinite)) {
      return intersectsTriangleUnbounded(this, triangle);
    }
    const cx = this.min.x / 2 + this.max.x / 2;
    const cy = this.min.y / 2 + this.max.y / 2;
    const cz = this.min.z / 2 + this.max.z / 2;
    const hx = this.max.x / 2 - this.min.x / 2;
    const hy = this.max.y / 2 - this.min.y / 2;
    const hz = this.max.z / 2 - this.min.z / 2;
    const a = [triangle.a.x - cx, triangle.a.y - cy, triangle.a.z - cz] as const;
    const b = [triangle.b.x - cx, triangle.b.y - cy, triangle.b.z - cz] as const;
    const c = [triangle.c.x - cx, triangle.c.y - cy, triangle.c.z - cz] as const;

    const overlap = (x: number, y: number, z: number): boolean => {
      const ap = a[0] * x + a[1] * y + a[2] * z;
      const bp = b[0] * x + b[1] * y + b[2] * z;
      const cp = c[0] * x + c[1] * y + c[2] * z;
      const radius = hx * Math.abs(x) + hy * Math.abs(y) + hz * Math.abs(z);
      return Math.min(ap, bp, cp) <= radius && Math.max(ap, bp, cp) >= -radius;
    };

    if (!overlap(1, 0, 0) || !overlap(0, 1, 0) || !overlap(0, 0, 1)) return false;
    const edges = [
      [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      [c[0] - b[0], c[1] - b[1], c[2] - b[2]],
      [a[0] - c[0], a[1] - c[1], a[2] - c[2]]
    ] as const;
    for (const [x, y, z] of edges) {
      if (!overlap(0, z, -y) || !overlap(-z, 0, x) || !overlap(y, -x, 0)) return false;
    }
    const e = edges[0], f = edges[1];
    return overlap(e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]);
  }

  clampPoint(point: Vector3Like, target: Vector3): Vector3 {
    const x = clamp(point.x, this.min.x, this.max.x);
    const y = clamp(point.y, this.min.y, this.max.y);
    const z = clamp(point.z, this.min.z, this.max.z);
    return target.set(x, y, z);
  }

  distanceToPoint(point: Vector3): number {
    if (this.isEmpty()) return Infinity;
    const dx = point.x - clamp(point.x, this.min.x, this.max.x);
    const dy = point.y - clamp(point.y, this.min.y, this.max.y);
    const dz = point.z - clamp(point.z, this.min.z, this.max.z);
    return Math.hypot(dx, dy, dz);
  }

  getBoundingSphere(target: Sphere): Sphere {
    if (this.isEmpty()) {
      target.center.set(0, 0, 0);
      target.radius = -1;
      return target;
    }
    const x = intervalCenter(this.min.x, this.max.x);
    const y = intervalCenter(this.min.y, this.max.y);
    const z = intervalCenter(this.min.z, this.max.z);
    const radius = [this.min.x, this.min.y, this.min.z, this.max.x, this.max.y, this.max.z].every(Number.isFinite)
      ? Math.hypot(
          this.max.x / 2 - this.min.x / 2,
          this.max.y / 2 - this.min.y / 2,
          this.max.z / 2 - this.min.z / 2
        )
      : Infinity;
    target.center.set(x, y, z);
    target.radius = radius;
    return target;
  }

  intersect(box: Box3Like): this {
    const minX = Math.max(this.min.x, box.min.x), minY = Math.max(this.min.y, box.min.y), minZ = Math.max(this.min.z, box.min.z);
    const maxX = Math.min(this.max.x, box.max.x), maxY = Math.min(this.max.y, box.max.y), maxZ = Math.min(this.max.z, box.max.z);
    if (minX > maxX || minY > maxY || minZ > maxZ) return this.makeEmpty();
    setBounds(this, minX, minY, minZ, maxX, maxY, maxZ);
    return this;
  }

  union(box: Box3Like): this {
    if (isEmptyBox(box)) return this;
    if (this.isEmpty()) return this.copy(box);
    const minX = Math.min(this.min.x, box.min.x), minY = Math.min(this.min.y, box.min.y), minZ = Math.min(this.min.z, box.min.z);
    const maxX = Math.max(this.max.x, box.max.x), maxY = Math.max(this.max.y, box.max.y), maxZ = Math.max(this.max.z, box.max.z);
    setBounds(this, minX, minY, minZ, maxX, maxY, maxZ);
    return this;
  }

  applyMatrix4(matrix: { readonly elements: ArrayLike<number> }): this {
    if (this.isEmpty()) return this;
    const minX = this.min.x, minY = this.min.y, minZ = this.min.z;
    const maxX = this.max.x, maxY = this.max.y, maxZ = this.max.z;
    const elements = matrix.elements;
    // A projective pole anywhere in the box can send points arbitrarily far
    // away; corner projections alone are not then a conservative bound.
    // Infinite input bounds are also conservatively retained as unbounded.
    if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) {
      return makeUnbounded(this);
    }
    let lowW = Infinity, highW = -Infinity;
    for (const x of [minX, maxX]) for (const y of [minY, maxY]) for (const z of [minZ, maxZ]) {
      const w = elements[3]! * x + elements[7]! * y + elements[11]! * z + elements[15]!;
      if (Number.isNaN(w)) return makeUnbounded(this);
      lowW = Math.min(lowW, w);
      highW = Math.max(highW, w);
    }
    if (lowW <= 0 && highW >= 0) return makeUnbounded(this);
    let lowX = Infinity, lowY = Infinity, lowZ = Infinity;
    let highX = -Infinity, highY = -Infinity, highZ = -Infinity;
    for (const x of [minX, maxX]) for (const y of [minY, maxY]) for (const z of [minZ, maxZ]) {
      const [tx, ty, tz] = transformPoint(x, y, z, elements);
      if (Number.isNaN(tx) || Number.isNaN(ty) || Number.isNaN(tz)) return makeUnbounded(this);
      lowX = Math.min(lowX, tx); lowY = Math.min(lowY, ty); lowZ = Math.min(lowZ, tz);
      highX = Math.max(highX, tx); highY = Math.max(highY, ty); highZ = Math.max(highZ, tz);
    }
    setBounds(this, lowX, lowY, lowZ, highX, highY, highZ);
    return this;
  }

  translate(offset: Vector3Like): this {
    const x = offset.x, y = offset.y, z = offset.z;
    const minX = this.min.x + x, minY = this.min.y + y, minZ = this.min.z + z;
    const maxX = this.max.x + x, maxY = this.max.y + y, maxZ = this.max.z + z;
    setBounds(this, minX, minY, minZ, maxX, maxY, maxZ);
    return this;
  }

  equals(box: Box3Like): boolean {
    return this.min.x === box.min.x && this.min.y === box.min.y && this.min.z === box.min.z
      && this.max.x === box.max.x && this.max.y === box.max.y && this.max.z === box.max.z;
  }

  toJSON(): { min: number[]; max: number[] } {
    return { min: [this.min.x, this.min.y, this.min.z], max: [this.max.x, this.max.y, this.max.z] };
  }

  fromJSON(json: { min: ArrayLike<number>; max: ArrayLike<number> }): this {
    const minX = json.min[0]!, minY = json.min[1]!, minZ = json.min[2]!;
    const maxX = json.max[0]!, maxY = json.max[1]!, maxZ = json.max[2]!;
    setBounds(this, minX, minY, minZ, maxX, maxY, maxZ);
    return this;
  }
}

function isEmptyBox(box: Box3Like): boolean {
  return box.max.x < box.min.x || box.max.y < box.min.y || box.max.z < box.min.z;
}

function makeUnbounded<T extends Box3>(box: T): T {
  setBounds(box, -Infinity, -Infinity, -Infinity, Infinity, Infinity, Infinity);
  return box;
}

function expandCoordinates(box: Box3, x: number, y: number, z: number): void {
  if (box.isEmpty()) {
    setBounds(box, x, y, z, x, y, z);
    return;
  }
  const minX = Math.min(box.min.x, x), minY = Math.min(box.min.y, y), minZ = Math.min(box.min.z, z);
  const maxX = Math.max(box.max.x, x), maxY = Math.max(box.max.y, y), maxZ = Math.max(box.max.z, z);
  setBounds(box, minX, minY, minZ, maxX, maxY, maxZ);
}

function setBounds(box: Box3, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
  // A single vector cannot hold two different corners. Preserve the supplied
  // minimum reference and detach the maximum only when it has to differ.
  if (box.min === box.max && (!Object.is(minX, maxX) || !Object.is(minY, maxY) || !Object.is(minZ, maxZ))) {
    box.max = new Vector3(maxX, maxY, maxZ);
  }
  box.min.set(minX, minY, minZ);
  box.max.set(maxX, maxY, maxZ);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function intervalCenter(min: number, max: number): number {
  if (Number.isFinite(min)) return Number.isFinite(max) ? min / 2 + max / 2 : min;
  return Number.isFinite(max) ? max : 0;
}

const binaryFloatView = new DataView(new ArrayBuffer(8));

/** Returns the exact sign of nx*x + ny*y + nz*z + constant. */
function planeExpressionSign(nx: number, ny: number, nz: number, constant: number, x: number, y: number, z: number): number {
  const coefficients = [nx, ny, nz];
  const coordinates = [x, y, z];
  const terms = [0, 0, 0, constant];
  let infiniteSign = 0;
  for (let i = 0; i < 3; i += 1) {
    const coefficient = coefficients[i]!;
    if (coefficient === 0) continue;
    const coordinate = coordinates[i]!;
    if (Number.isNaN(coordinate)) return NaN;
    if (!Number.isFinite(coordinate)) {
      const sign = Math.sign(coefficient) * Math.sign(coordinate);
      if (infiniteSign !== 0 && infiniteSign !== sign) return NaN;
      infiniteSign = sign;
    } else {
      terms[i] = coefficient * coordinate;
    }
  }
  if (infiniteSign !== 0) return infiniteSign;

  // A generous floating-point error bound makes the common case inexpensive.
  // Close cancellation, overflows and subnormal products take the exact path.
  const sum = terms[0]! + terms[1]! + terms[2]! + terms[3]!;
  const maxTerm = Math.max(...terms.map(Math.abs));
  const error = maxTerm * (16 * Number.EPSILON) + 4 * Number.MIN_VALUE;
  if (Number.isFinite(sum) && Number.isFinite(error) && Math.abs(sum) > error) return Math.sign(sum);

  const parts: Array<{ mantissa: bigint; exponent: number }> = [];
  for (let i = 0; i < 3; i += 1) {
    const coefficient = coefficients[i]!, coordinate = coordinates[i]!;
    if (coefficient === 0 || coordinate === 0) continue;
    const a = binaryFloatParts(coefficient), b = binaryFloatParts(coordinate);
    parts.push({ mantissa: a.mantissa * b.mantissa, exponent: a.exponent + b.exponent });
  }
  if (constant !== 0) parts.push(binaryFloatParts(constant));
  if (parts.length === 0) return 0;
  const minExponent = Math.min(...parts.map(part => part.exponent));
  let exact = 0n;
  for (const part of parts) exact += part.mantissa << BigInt(part.exponent - minExponent);
  return exact < 0n ? -1 : exact > 0n ? 1 : 0;
}

/** Each finite double is an integer mantissa times an integral power of two. */
function binaryFloatParts(value: number): { mantissa: bigint; exponent: number } {
  binaryFloatView.setFloat64(0, value, false);
  const high = binaryFloatView.getUint32(0, false);
  const low = binaryFloatView.getUint32(4, false);
  const biasedExponent = (high >>> 20) & 0x7ff;
  let mantissa = (BigInt(high & 0xfffff) << 32n) | BigInt(low);
  if (biasedExponent !== 0) mantissa |= 1n << 52n;
  if ((high >>> 31) !== 0) mantissa = -mantissa;
  return { mantissa, exponent: biasedExponent === 0 ? -1074 : biasedExponent - 1075 };
}

function intersectsTriangleUnbounded(box: Box3, triangle: TriangleLike): boolean {
  const { a, b, c } = triangle;
  const overlap = (x: number, y: number, z: number): boolean => {
    const ap = a.x * x + a.y * y + a.z * z;
    const bp = b.x * x + b.y * y + b.z * z;
    const cp = c.x * x + c.y * y + c.z * z;
    let low = 0, high = 0;
    // Zero times an infinite endpoint is NaN, even though that coordinate
    // contributes nothing to the support interval on this axis.
    if (x !== 0) {
      low += (x > 0 ? box.min.x : box.max.x) * x;
      high += (x > 0 ? box.max.x : box.min.x) * x;
    }
    if (y !== 0) {
      low += (y > 0 ? box.min.y : box.max.y) * y;
      high += (y > 0 ? box.max.y : box.min.y) * y;
    }
    if (z !== 0) {
      low += (z > 0 ? box.min.z : box.max.z) * z;
      high += (z > 0 ? box.max.z : box.min.z) * z;
    }
    return Math.min(ap, bp, cp) <= high && Math.max(ap, bp, cp) >= low;
  };

  if (!overlap(1, 0, 0) || !overlap(0, 1, 0) || !overlap(0, 0, 1)) return false;
  const edges = [
    [b.x - a.x, b.y - a.y, b.z - a.z],
    [c.x - b.x, c.y - b.y, c.z - b.z],
    [a.x - c.x, a.y - c.y, a.z - c.z]
  ] as const;
  for (const [x, y, z] of edges) {
    if (!overlap(0, z, -y) || !overlap(-z, 0, x) || !overlap(y, -x, 0)) return false;
  }
  const e = edges[0], f = edges[1];
  return overlap(e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]);
}

function transformPoint(x: number, y: number, z: number, e: ArrayLike<number>): [number, number, number] {
  const w = 1 / (e[3]! * x + e[7]! * y + e[11]! * z + e[15]!);
  return [
    (e[0]! * x + e[4]! * y + e[8]! * z + e[12]!) * w,
    (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!) * w,
    (e[2]! * x + e[6]! * y + e[10]! * z + e[14]!) * w
  ];
}
