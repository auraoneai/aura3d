import { Box3 } from "../Box3.js";
import { Matrix3 } from "../Matrix3.js";
import { Matrix4 } from "../Matrix4.js";
import { Plane } from "../Plane.js";
import { Ray } from "../Ray.js";
import { Sphere } from "../Sphere.js";
import { Vector3 } from "../Vector3.js";

const FRAME_TOLERANCE = 1e-10;
const TRANSFORM_TOLERANCE = Number.EPSILON * 32;
const DEFAULT_EPSILON = 1e-12;

type Axes = [Vector3, Vector3, Vector3];

function finiteVector(v: Vector3, label: string): void {
  if (![v.x, v.y, v.z].every(Number.isFinite)) {
    throw new RangeError(`${label} must have finite components`);
  }
}

function finiteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} exceeds the finite numeric range`);
  return value;
}

function nonnegativeTolerance(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("epsilon must be finite and nonnegative");
  }
}

function unitAxes(rotation: Matrix3): Axes {
  const axes = rotation.extractBasis();
  const lengths = axes.map((axis) => Math.hypot(axis.x, axis.y, axis.z));
  if (lengths.some((length) => !Number.isFinite(length) || Math.abs(length - 1) > FRAME_TOLERANCE)) {
    throw new RangeError("rotation must have unit-length axes");
  }
  const normalized: Axes = [
    axes[0].divideScalar(lengths[0]),
    axes[1].divideScalar(lengths[1]),
    axes[2].divideScalar(lengths[2]),
  ];
  if (Math.abs(normalized[0].dot(normalized[1])) > FRAME_TOLERANCE ||
      Math.abs(normalized[1].dot(normalized[2])) > FRAME_TOLERANCE ||
      Math.abs(normalized[2].dot(normalized[0])) > FRAME_TOLERANCE) {
    throw new RangeError("rotation axes must be orthogonal");
  }
  // Work with an actual orthonormal frame even when the supplied columns
  // differ by a few floating-point ulps. Preserve handedness of reflections.
  const first = normalized[0];
  const second = normalized[1].subtract(first.multiplyScalar(normalized[1].dot(first))).normalize();
  let third = first.cross(second).normalize();
  if (third.dot(normalized[2]) < 0) third = third.negate();
  return [first, second, third];
}

function extentAlong(axis: Vector3, basis: Axes, halfSize: Vector3): number {
  return Math.abs(axis.dot(basis[0])) * halfSize.x +
    Math.abs(axis.dot(basis[1])) * halfSize.y +
    Math.abs(axis.dot(basis[2])) * halfSize.z;
}

function makeFrame(axes: Axes): Matrix3 {
  return new Matrix3().set(
    axes[0].x, axes[1].x, axes[2].x,
    axes[0].y, axes[1].y, axes[2].y,
    axes[0].z, axes[1].z, axes[2].z,
  );
}

function transformedDirection(axis: Vector3, matrix: Matrix4): Vector3 {
  const e = matrix.elements;
  return new Vector3(
    e[0] * axis.x + e[4] * axis.y + e[8] * axis.z,
    e[1] * axis.x + e[5] * axis.y + e[9] * axis.z,
    e[2] * axis.x + e[6] * axis.y + e[10] * axis.z,
  );
}

/** Complete an orthonormal frame where zero-length box dimensions are unconstrained. */
function completeFrame(directions: Axes, active: [boolean, boolean, boolean]): Axes {
  const axes: Array<Vector3 | undefined> = directions.map((direction, index) => {
    if (!active[index]) return undefined;
    return direction.divideScalar(Math.hypot(direction.x, direction.y, direction.z));
  });
  const indices = [0, 1, 2].filter((index) => active[index]);
  if (indices.length === 0) {
    // A point has no constrained directions. Preserve the transformed frame
    // when it remains orthogonal, otherwise choose a well-defined frame.
    const lengths = directions.map((direction) => Math.hypot(direction.x, direction.y, direction.z));
    if (lengths.every((length) => Number.isFinite(length) && length > 0)) {
      const candidate = directions.map((direction, i) => direction.divideScalar(lengths[i])) as Axes;
      if (Math.abs(candidate[0].dot(candidate[1])) <= FRAME_TOLERANCE &&
          Math.abs(candidate[1].dot(candidate[2])) <= FRAME_TOLERANCE &&
          Math.abs(candidate[2].dot(candidate[0])) <= FRAME_TOLERANCE) return candidate;
    }
    return [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
  }
  for (let i = 0; i < indices.length; i++) {
    for (let j = i + 1; j < indices.length; j++) {
      if (Math.abs(axes[indices[i]]!.dot(axes[indices[j]]!)) > TRANSFORM_TOLERANCE) {
        throw new RangeError("transform shears the box; an oriented box cannot represent the result");
      }
    }
  }
  if (indices.length === 1) {
    const first = indices[0];
    const second = (first + 1) % 3;
    const third = (first + 2) % 3;
    const base = axes[first]!;
    const preferred = directions[second];
    const preferredLength = Math.hypot(preferred.x, preferred.y, preferred.z);
    let perpendicular = new Vector3();
    if (Number.isFinite(preferredLength) && preferredLength > 0) {
      const unitPreferred = preferred.divideScalar(preferredLength);
      perpendicular = unitPreferred.subtract(base.multiplyScalar(unitPreferred.dot(base)));
    }
    if (Math.hypot(perpendicular.x, perpendicular.y, perpendicular.z) <= FRAME_TOLERANCE) {
      const candidates = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
      candidates.sort((a, b) => Math.abs(a.dot(base)) - Math.abs(b.dot(base)));
      perpendicular = candidates[0].subtract(base.multiplyScalar(candidates[0].dot(base)));
    }
    axes[second] = perpendicular.normalize();
    axes[third] = base.cross(axes[second]!).normalize();
    if (axes[third]!.dot(directions[third]) < 0) axes[third] = axes[third]!.negate();
  } else if (indices.length === 2) {
    const missing = [0, 1, 2].find((index) => !active[index])!;
    const first = (missing + 1) % 3;
    const second = (missing + 2) % 3;
    axes[missing] = axes[first]!.cross(axes[second]!).normalize();
    if (axes[missing]!.dot(directions[missing]) < 0) axes[missing] = axes[missing]!.negate();
  }
  return axes as Axes;
}

/**
 * A closed oriented box. `center` defaults to the origin, `halfSize` to zero,
 * and `rotation` to the identity. Rotation columns give the local axes, which
 * must be orthonormal within 1e-10; reflected frames are allowed. Accepted
 * frames are orthonormalized for queries, so that tolerance is an approximation
 * of the supplied axes. Constructor arguments are retained by reference. The fields are readonly in TypeScript,
 * and `set`, `copy`, `clone` and `applyMatrix4` return new values. `clone` and
 * `copy` clone the component objects; `set` retains its new arguments.
 *
 * Bounds include their faces, edges and corners. To account for floating-point
 * error, point and sphere tests allow eight machine epsilons at the local
 * scale; plane tests use eight machine epsilons at the projection scale.
 * `intersectsOBB` uses an absolute world-distance margin, default 1e-12;
 * passing zero disables that margin. `equals` compares components with an
 * absolute tolerance, also defaulting to 1e-12. Equal geometry represented
 * with different axes or axis ordering need not compare equal.
 *
 * `intersectRay` returns the first forward surface hit, or the exit surface
 * when the origin is inside. A stationary ray returns its origin only if it
 * lies in the box. Empty spheres do not intersect; an empty Box3 does not
 * intersect and cannot be converted with `fromBox3`.
 *
 * Non-finite values, arithmetic overflow, negative half lengths and invalid
 * frames throw RangeError. Transforms must be finite affine matrices. Exactly
 * parallel computed dimensions may collapse together; other transformed
 * dimensions must remain orthogonal within 32 machine epsilons. General shear
 * is rejected. These angular tolerances produce errors proportional to box
 * size. Degenerate inputs may have their unused axes reoriented.
 */
export class OBB {
  constructor(
    readonly center: Vector3 = new Vector3(),
    readonly halfSize: Vector3 = new Vector3(),
    readonly rotation: Matrix3 = new Matrix3(),
  ) {
    finiteVector(center, "center");
    finiteVector(halfSize, "halfSize");
    if (halfSize.x < 0 || halfSize.y < 0 || halfSize.z < 0) {
      throw new RangeError("halfSize must be nonnegative");
    }
    unitAxes(rotation);
  }

  set(center: Vector3, halfSize: Vector3, rotation: Matrix3): OBB {
    return new OBB(center, halfSize, rotation);
  }

  clone(): OBB {
    return new OBB(this.center.clone(), this.halfSize.clone(), this.rotation.clone());
  }

  copy(obb: OBB): OBB {
    return obb.clone();
  }

  getSize(): Vector3 {
    const size = this.halfSize.multiplyScalar(2);
    finiteVector(size, "box size");
    return size;
  }

  static fromBox3(box3: Box3): OBB {
    if (box3.isEmpty()) throw new RangeError("an empty Box3 cannot be represented by an OBB");
    finiteVector(box3.min, "box minimum");
    finiteVector(box3.max, "box maximum");
    const endpoints = [[box3.min.x, box3.max.x], [box3.min.y, box3.max.y], [box3.min.z, box3.max.z]];
    const center: number[] = [];
    const halfSize: number[] = [];
    for (const [min, max] of endpoints) {
      const span = max - min;
      // Taking halves first can lose a subnormal point; taking the difference
      // first can overflow for endpoints on opposite sides of zero.
      center.push(Number.isFinite(span) ? min + span / 2 : min / 2 + max / 2);
      halfSize.push(Number.isFinite(span) ? span / 2 : max / 2 - min / 2);
    }
    return new OBB(new Vector3(center[0], center[1], center[2]), new Vector3(halfSize[0], halfSize[1], halfSize[2]));
  }

  clampPoint(point: Vector3): Vector3 {
    finiteVector(point, "point");
    const axes = unitAxes(this.rotation);
    const relative = point.subtract(this.center);
    finiteVector(relative, "point displacement");
    const half = [this.halfSize.x, this.halfSize.y, this.halfSize.z];
    let result = this.center.clone();
    for (let i = 0; i < 3; i++) {
      const coordinate = Math.max(-half[i], Math.min(half[i], finiteNumber(relative.dot(axes[i]), "point projection")));
      result = result.addScaled(axes[i], coordinate);
    }
    finiteVector(result, "clamped point");
    return result;
  }

  containsPoint(point: Vector3): boolean {
    finiteVector(point, "point");
    const axes = unitAxes(this.rotation);
    const relative = point.subtract(this.center);
    finiteVector(relative, "point displacement");
    const half = [this.halfSize.x, this.halfSize.y, this.halfSize.z];
    return axes.every((axis, i) => Math.abs(finiteNumber(relative.dot(axis), "point projection")) <= half[i] + Number.EPSILON * 8 * Math.max(1, half[i]));
  }

  intersectsBox3(box3: Box3): boolean {
    return !box3.isEmpty() && this.intersectsOBB(OBB.fromBox3(box3));
  }

  intersectsSphere(sphere: Sphere): boolean {
    if (!Number.isFinite(sphere.radius)) throw new RangeError("sphere radius must be finite");
    if (sphere.radius < 0) return false;
    finiteVector(sphere.center, "sphere center");
    const nearest = this.clampPoint(sphere.center);
    const distance = Math.hypot(nearest.x - sphere.center.x, nearest.y - sphere.center.y, nearest.z - sphere.center.z);
    return finiteNumber(distance, "sphere distance") <= sphere.radius + Number.EPSILON * 8 * Math.max(1, sphere.radius);
  }

  /** Test face normals and pairwise edge cross products as separating axes. */
  intersectsOBB(obb: OBB, epsilon = DEFAULT_EPSILON): boolean {
    nonnegativeTolerance(epsilon);
    const first = unitAxes(this.rotation);
    const second = unitAxes(obb.rotation);
    const separation = obb.center.subtract(this.center);
    finiteVector(separation, "center displacement");
    const axes = [...first, ...second];
    for (const a of first) for (const b of second) axes.push(a.cross(b));
    for (const axis of axes) {
      const length = Math.hypot(axis.x, axis.y, axis.z);
      if (length === 0) continue;
      const distance = Math.abs(finiteNumber(separation.dot(axis), "center projection"));
      const radius = finiteNumber(extentAlong(axis, first, this.halfSize) + extentAlong(axis, second, obb.halfSize), "projected radius");
      if (distance > radius + epsilon * length) return false;
    }
    return true;
  }

  intersectsPlane(plane: Plane): boolean {
    finiteVector(plane.normal, "plane normal");
    if (!Number.isFinite(plane.constant)) throw new RangeError("plane constant must be finite");
    const distance = Math.abs(finiteNumber(plane.distanceToPoint(this.center), "plane distance"));
    const radius = finiteNumber(extentAlong(plane.normal, unitAxes(this.rotation), this.halfSize), "plane projection");
    return distance <= radius + Number.EPSILON * 8 * Math.max(distance, radius);
  }

  /** Return the first forward surface hit, or the exit when the origin is inside. */
  intersectRay(ray: Ray): Vector3 | undefined {
    finiteVector(ray.origin, "ray origin");
    finiteVector(ray.direction, "ray direction");
    const relative = ray.origin.subtract(this.center);
    finiteVector(relative, "ray displacement");
    const axes = unitAxes(this.rotation);
    const half = [this.halfSize.x, this.halfSize.y, this.halfSize.z];
    let enter = -Infinity;
    let exit = Infinity;
    for (let i = 0; i < 3; i++) {
      let origin = finiteNumber(relative.dot(axes[i]), "ray origin projection");
      let direction = finiteNumber(ray.direction.dot(axes[i]), "ray direction projection");
      const coordinateTolerance = Number.EPSILON * 8 * Math.max(1, half[i], Math.abs(origin));
      const directionError = Number.EPSILON * 8 * (
        Math.abs(ray.direction.x * axes[i].x) + Math.abs(ray.direction.y * axes[i].y) + Math.abs(ray.direction.z * axes[i].z)
      );
      // Cancellation in a dot product can turn a ray running along a face
      // into a spurious outward ray. Treat a direction within that error bound
      // as parallel only while the origin is also numerically on the face.
      if (Math.abs(Math.abs(origin) - half[i]) <= coordinateTolerance && Math.abs(direction) <= directionError) {
        origin = Math.sign(origin) * half[i];
        direction = 0;
      } else {
        if (origin > half[i] && origin - half[i] <= coordinateTolerance) origin = half[i];
        if (origin < -half[i] && -half[i] - origin <= coordinateTolerance) origin = -half[i];
      }
      if (direction === 0) {
        if (origin < -half[i] || origin > half[i]) return undefined;
        continue;
      }
      const t0 = (-half[i] - origin) / direction;
      const t1 = (half[i] - origin) / direction;
      enter = Math.max(enter, Math.min(t0, t1));
      exit = Math.min(exit, Math.max(t0, t1));
      // A ray grazing an edge can round the two computed times in opposite
      // directions. Only reject a gap larger than the arithmetic error scale.
      const timeTolerance = Number.EPSILON * 16 * Math.max(1, Math.abs(enter), Math.abs(exit));
      if (enter > exit && (!Number.isFinite(enter) || !Number.isFinite(exit) || enter - exit > timeTolerance)) return undefined;
    }
    if (exit < 0) return undefined;
    if (enter === -Infinity && exit === Infinity) return ray.origin.clone();
    const t = enter > exit ? enter + (exit - enter) / 2 : enter >= 0 ? enter : exit;
    finiteNumber(t, "ray intersection parameter");
    const point = ray.origin.addScaled(ray.direction, t);
    finiteVector(point, "ray intersection");
    return point;
  }

  intersectsRay(ray: Ray): boolean {
    return this.intersectRay(ray) !== undefined;
  }

  equals(obb: OBB, epsilon = DEFAULT_EPSILON): boolean {
    nonnegativeTolerance(epsilon);
    return this.center.equals(obb.center, epsilon) && this.halfSize.equals(obb.halfSize, epsilon) &&
      this.rotation.elements.every((value, i) => Math.abs(value - obb.rotation.elements[i]) <= epsilon);
  }

  applyMatrix4(matrix: Matrix4): OBB {
    const e = matrix.elements;
    if (!e.every(Number.isFinite) || e[3] !== 0 || e[7] !== 0 || e[11] !== 0 || e[15] !== 1) {
      throw new RangeError("transform must be a finite affine matrix");
    }
    const axes = unitAxes(this.rotation);
    const directions = axes.map((axis) => transformedDirection(axis, matrix)) as Axes;
    const lengths = directions.map((direction) => Math.hypot(direction.x, direction.y, direction.z));
    const half = [this.halfSize.x, this.halfSize.y, this.halfSize.z];
    const scaledHalf = lengths.map((length, i) => length * half[i]);
    if (scaledHalf.some((length) => !Number.isFinite(length))) {
      throw new RangeError("transformed halfSize must be finite");
    }
    const active = scaledHalf.map((length) => length > 0) as [boolean, boolean, boolean];
    // Singular matrices can map two dimensions onto the same line. Their
    // symmetric intervals then add, so the image is still an oriented box.
    for (let i = 0; i < 3; i++) {
      if (!active[i]) continue;
      const current = directions[i].divideScalar(lengths[i]);
      for (let j = 0; j < i; j++) {
        if (!active[j]) continue;
        const previous = directions[j].divideScalar(lengths[j]);
        const cross = current.cross(previous);
        if (cross.x === 0 && cross.y === 0 && cross.z === 0) {
          scaledHalf[j] = finiteNumber(scaledHalf[j] + scaledHalf[i], "collapsed halfSize");
          scaledHalf[i] = 0;
          active[i] = false;
          break;
        }
      }
    }
    const frame = completeFrame(directions, active);
    return new OBB(matrix.transformPoint(this.center), new Vector3(...scaledHalf as [number, number, number]), makeFrame(frame));
  }
}
