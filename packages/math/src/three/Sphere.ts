import { Sphere as ImmutableSphere } from "../Sphere.js";
import { Box3 } from "./Box3.js";
import { Vector3 } from "./Vector3.js";
import type { Vector3Like } from "./Vector3.js";

/** Anything with a `center` and `radius`, including the immutable `@aura3d/math` Sphere. */
export interface SphereLike {
  readonly center: Vector3Like;
  readonly radius: number;
}

interface PlaneLike {
  distanceToPoint(point: Vector3): number;
}

const _box = new Box3();
const _v1 = new Vector3();
const _v2 = new Vector3();

/**
 * Mutable three.js-compatible bounding sphere (`radius = -1` is the empty
 * sentinel). Every modifier mutates `this` and returns `this`, exactly like
 * three r185 `Sphere`.
 */
export class Sphere {
  declare readonly isSphere: true;

  center: Vector3;
  radius: number;

  constructor(center: Vector3 = new Vector3(), radius = -1) {
    this.center = center;
    this.radius = radius;
  }

  /** Copy an immutable `@aura3d/math` Sphere (or any `{center, radius}`) into this sphere. */
  fromImmutable(sphere: SphereLike): this {
    this.center.copy(sphere.center);
    this.radius = sphere.radius;
    return this;
  }

  /** Snapshot as an immutable `@aura3d/math` Sphere (throws on a non-finite radius, like that class). */
  toImmutable(): ImmutableSphere {
    return new ImmutableSphere(this.center.toImmutable(), this.radius);
  }

  set(center: Vector3Like, radius: number): this {
    this.center.copy(center);
    this.radius = radius;
    return this;
  }

  setFromPoints(points: readonly Vector3[], optionalCenter?: Vector3Like): this {
    const center = this.center;

    if (optionalCenter !== undefined) {
      center.copy(optionalCenter);
    } else {
      _box.setFromPoints(points).getCenter(center);
    }

    let maxRadiusSq = 0;

    for (let i = 0, il = points.length; i < il; i += 1) {
      maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(points[i]!));
    }

    this.radius = Math.sqrt(maxRadiusSq);

    return this;
  }

  copy(sphere: SphereLike): this {
    this.center.copy(sphere.center);
    this.radius = sphere.radius;
    return this;
  }

  isEmpty(): boolean {
    return this.radius < 0;
  }

  makeEmpty(): this {
    this.center.set(0, 0, 0);
    this.radius = -1;
    return this;
  }

  containsPoint(point: Vector3): boolean {
    return point.distanceToSquared(this.center) <= this.radius * this.radius;
  }

  distanceToPoint(point: Vector3): number {
    return point.distanceTo(this.center) - this.radius;
  }

  intersectsSphere(sphere: SphereLike): boolean {
    const radiusSum = this.radius + sphere.radius;
    return _distanceSq(sphere.center, this.center) <= radiusSum * radiusSum;
  }

  intersectsBox(box: Box3): boolean {
    return box.intersectsSphere(this);
  }

  intersectsPlane(plane: PlaneLike): boolean {
    return Math.abs(plane.distanceToPoint(this.center)) <= this.radius;
  }

  clampPoint(point: Vector3, target: Vector3): Vector3 {
    const deltaLengthSq = this.center.distanceToSquared(point);

    target.copy(point);

    if (deltaLengthSq > this.radius * this.radius) {
      target.sub(this.center).normalize();
      target.multiplyScalar(this.radius).add(this.center);
    }

    return target;
  }

  getBoundingBox(target: Box3): Box3 {
    if (this.isEmpty()) {
      // Empty sphere produces empty bounding box
      target.makeEmpty();
      return target;
    }

    target.set(this.center, this.center);
    target.expandByScalar(this.radius);

    return target;
  }

  applyMatrix4(matrix: { readonly elements: ArrayLike<number>; getMaxScaleOnAxis(): number }): this {
    this.center.applyMatrix4(matrix);
    this.radius = this.radius * matrix.getMaxScaleOnAxis();

    return this;
  }

  translate(offset: Vector3Like): this {
    this.center.add(offset);

    return this;
  }

  expandByPoint(point: Vector3Like): this {
    if (this.isEmpty()) {
      this.center.copy(point);

      this.radius = 0;

      return this;
    }

    _v1.subVectors(point, this.center);

    const lengthSq = _v1.lengthSq();

    if (lengthSq > this.radius * this.radius) {
      // calculate the minimal sphere

      const length = Math.sqrt(lengthSq);

      const delta = (length - this.radius) * 0.5;

      this.center.addScaledVector(_v1, delta / length);

      this.radius += delta;
    }

    return this;
  }

  union(sphere: Sphere): this {
    if (sphere.isEmpty()) {
      return this;
    }

    if (this.isEmpty()) {
      this.copy(sphere);

      return this;
    }

    if (this.center.equals(sphere.center) === true) {
      this.radius = Math.max(this.radius, sphere.radius);
    } else {
      _v2.subVectors(sphere.center, this.center).setLength(sphere.radius);

      this.expandByPoint(_v1.copy(sphere.center).add(_v2));

      this.expandByPoint(_v1.copy(sphere.center).sub(_v2));
    }

    return this;
  }

  equals(sphere: SphereLike): boolean {
    return this.center.equals(sphere.center) && sphere.radius === this.radius;
  }

  clone(): this {
    return new (this.constructor as new () => this)().copy(this);
  }

  toJSON(): { radius: number; center: number[] } {
    return {
      radius: this.radius,
      center: this.center.toArray()
    };
  }

  fromJSON(json: { radius: number; center: ArrayLike<number> }): this {
    this.radius = json.radius;
    this.center.fromArray(json.center);
    return this;
  }
}

(Sphere.prototype as { isSphere: boolean }).isSphere = true;

function _distanceSq(a: Vector3Like, b: Vector3Like): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}
