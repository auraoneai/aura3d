import { Frustum as ImmutableFrustum } from "../../Frustum.js";
import { Plane as ImmutablePlane } from "../../Plane.js";
import { Vector3 as ImmutableVector3 } from "../../Vector3.js";
import { Plane, type PlaneLike } from "./Plane.js";
import { Vector3, type Vector3Like } from "./Vector3.js";
import type { Vector2 } from "./Vector2.js";
import type { Box3Like } from "./Box3.js";
import type { Sphere } from "./Sphere.js";
import { projectionDepthRange, WebGLCoordinateSystem } from "./Matrix4.js";

export interface FrustumLike {
  readonly planes: readonly PlaneLike[];
}

interface MeshLike {
  readonly matrixWorld: { readonly elements: ArrayLike<number>; getMaxScaleOnAxis(): number };
  readonly boundingSphere?: Sphere | null;
  computeBoundingSphere?(): void;
  readonly geometry?: { boundingSphere: Sphere | null; computeBoundingSphere(): void };
}

interface SpriteLike {
  readonly center: Vector2;
  readonly matrixWorld: { readonly elements: ArrayLike<number>; getMaxScaleOnAxis(): number };
}

// Evaluate n·p + c after positive coefficient rescaling. If accumulation
// overflows, rescale the point too and return that scale for radius tests.
function evaluateHalfSpace(plane: PlaneLike, point: Vector3Like): { offset: number; pointScale: number; normalLength: number } {
  const n = plane.normal, constant = plane.constant;
  if (constant === Infinity || constant === -Infinity) return { offset: constant, pointScale: 1, normalLength: 0 };
  const coefficientScale = Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z), Math.abs(constant));
  if (coefficientScale === 0) return { offset: 0, pointScale: 1, normalLength: 0 };
  const x = n.x / coefficientScale, y = n.y / coefficientScale, z = n.z / coefficientScale;
  const c = constant / coefficientScale;
  const normalLength = Math.hypot(x, y, z);
  const multiply = (coefficient: number, value: number): number => coefficient === 0 ? 0 : coefficient * value;
  const offset = multiply(x, point.x) + multiply(y, point.y) + multiply(z, point.z) + c;
  if (Number.isFinite(offset)) return { offset, pointScale: 1, normalLength };
  const pointScale = Math.max(1, Math.abs(point.x), Math.abs(point.y), Math.abs(point.z));
  if (!Number.isFinite(pointScale)) return { offset, pointScale: 1, normalLength };
  const scaledOffset = multiply(x, point.x / pointScale) + multiply(y, point.y / pointScale) + multiply(z, point.z / pointScale) + c / pointScale;
  return { offset: scaledOffset, pointScale, normalLength };
}

// Bound the largest singular value via the row sums of A^T A. Unlike a
// maximum column length, this also encloses spheres under affine shear.
function conservativeScale(matrix: MeshLike["matrixWorld"]): number | null {
  const e = matrix.elements;
  if (e[3] !== 0 || e[7] !== 0 || e[11] !== 0 || !Number.isFinite(e[15]) || e[15] === 0) return null;
  const values = [e[0]!, e[1]!, e[2]!, e[4]!, e[5]!, e[6]!, e[8]!, e[9]!, e[10]!];
  const scale = Math.max(...values.map(Math.abs));
  if (!Number.isFinite(scale)) return null;
  if (scale === 0) return 0;
  const [a, b, c, d, f, g, h, j, k] = values.map(value => value / scale) as [number, number, number, number, number, number, number, number, number];
  const aa = a * a + b * b + c * c, dd = d * d + f * f + g * g, hh = h * h + j * j + k * k;
  const ad = Math.abs(a * d + b * f + c * g), ah = Math.abs(a * h + b * j + c * k), dh = Math.abs(d * h + f * j + g * k);
  const bound = scale * Math.sqrt(Math.max(aa + ad + ah, dd + ad + dh, hh + ah + dh)) / Math.abs(e[15]!);
  return Math.max(bound, Math.abs(matrix.getMaxScaleOnAxis()) / Math.abs(e[15]!));
}

/** A convex volume represented by six inward-facing half-spaces. */
export class Frustum {
  planes: [Plane, Plane, Plane, Plane, Plane, Plane];

  constructor(p0 = new Plane(), p1 = new Plane(), p2 = new Plane(), p3 = new Plane(), p4 = new Plane(), p5 = new Plane()) {
    this.planes = [p0, p1, p2, p3, p4, p5];
  }

  fromImmutable(frustum: FrustumLike): this { return this.copy(frustum); }

  toImmutable(): ImmutableFrustum {
    const convert = (plane: Plane): ImmutablePlane => {
      const n = plane.normal;
      // The immutable plane constructor requires a nonzero normal. Infinite
      // constants preserve a constant half-space for finite query points.
      if (n.x === 0 && n.y === 0 && n.z === 0) {
        return new ImmutablePlane(new ImmutableVector3(1, 0, 0), plane.constant < 0 ? -Infinity : Infinity);
      }
      // Normalize before constructing the immutable plane so very small or
      // very large finite normals do not underflow or overflow its length.
      const scale = Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z));
      const x = n.x / scale, y = n.y / scale, z = n.z / scale;
      const length = Math.hypot(x, y, z);
      const constant = (plane.constant / length) / scale;
      if (Number.isFinite(plane.constant) && !Number.isFinite(constant)) {
        throw new RangeError("Plane offset cannot be represented by an immutable normalized plane");
      }
      return new ImmutablePlane(new ImmutableVector3(x / length, y / length, z / length), constant);
    };
    const p = this.planes;
    const far = p[4];
    const infiniteFar = far.normal.x === 0 && far.normal.y === 0 && far.normal.z === 0 && far.constant >= 0;
    return new ImmutableFrustum([convert(p[0]), convert(p[1]), convert(p[2]), convert(p[3]), convert(far), convert(p[5])], infiniteFar);
  }

  set(p0: PlaneLike, p1: PlaneLike, p2: PlaneLike, p3: PlaneLike, p4: PlaneLike, p5: PlaneLike): this {
    const values = [p0, p1, p2, p3, p4, p5].map(({ normal, constant }) => [normal.x, normal.y, normal.z, constant] as const);
    for (let i = 0; i < 6; i++) {
      const [x, y, z, c] = values[i]!;
      this.planes[i]!.setComponents(x, y, z, c);
    }
    return this;
  }

  copy(frustum: FrustumLike): this {
    const p = frustum.planes;
    if (p.length < 6) throw new RangeError("A frustum requires six planes");
    // An immutable infinite-far frustum may retain any placeholder at index 4;
    // its metadata, rather than that inactive plane, determines the volume.
    const far = "infiniteFar" in frustum && frustum.infiniteFar === true
      ? { normal: { x: 0, y: 0, z: 0 }, constant: 1 }
      : p[4]!;
    return this.set(p[0]!, p[1]!, p[2]!, p[3]!, far, p[5]!);
  }

  /** Extract inward-facing planes using a numeric clip-space identifier. */
  setFromProjectionMatrix(
    m: { readonly elements: ArrayLike<number> },
    coordinateSystem: number = WebGLCoordinateSystem,
    reversedDepth = false,
  ): this {
    return this.setFromProjectionMatrixDepthRange(m, projectionDepthRange(coordinateSystem), reversedDepth);
  }

  /** Extract planes from column-major clip transform, with an explicit clip-space z range. */
  setFromProjectionMatrixDepthRange(m: { readonly elements: ArrayLike<number> }, depthRange: "minus-one-to-one" | "zero-to-one", reversedDepth = false): this {
    if (depthRange !== "minus-one-to-one" && depthRange !== "zero-to-one") throw new RangeError("Unknown clip-space depth range");
    const e = m.elements;
    const elements = Array.from({ length: 16 }, (_, i) => e[i]!);
    const scale = Math.max(...elements.map(Math.abs));
    if (!Number.isFinite(scale)) throw new RangeError("Projection matrix must have sixteen finite elements");
    // Positive homogeneous rescaling leaves every clipping inequality intact.
    const divisor = scale || 1;
    const rowX = [e[0]! / divisor, e[4]! / divisor, e[8]! / divisor, e[12]! / divisor];
    const rowY = [e[1]! / divisor, e[5]! / divisor, e[9]! / divisor, e[13]! / divisor];
    const rowZ = [e[2]! / divisor, e[6]! / divisor, e[10]! / divisor, e[14]! / divisor];
    const rowW = [e[3]! / divisor, e[7]! / divisor, e[11]! / divisor, e[15]! / divisor];
    const combine = (a: number[], b: number[], sign: number): number[] => a.map((v, i) => v + sign * b[i]!);
    const highZ = combine(rowW, rowZ, -1);
    const lowZ = depthRange === "minus-one-to-one" ? combine(rowW, rowZ, 1) : rowZ;
    const coefficients = [
      combine(rowW, rowX, -1), combine(rowW, rowX, 1),
      combine(rowW, rowY, 1), combine(rowW, rowY, -1),
      reversedDepth ? lowZ : highZ, reversedDepth ? highZ : lowZ,
    ];
    for (let i = 0; i < 6; i++) {
      const [x, y, z, constant] = coefficients[i]!;
      const length = Math.hypot(x!, y!, z!);
      // A constant half-space is meaningful for an infinite clipping plane.
      const normalizer = length === 0 ? 1 : length;
      const normalizedConstant = constant! / normalizer;
      if (Number.isFinite(normalizedConstant)) this.planes[i]!.setComponents(x! / normalizer, y! / normalizer, z! / normalizer, normalizedConstant);
      else this.planes[i]!.setComponents(x!, y!, z!, constant!);
    }
    return this;
  }

  intersectsObject(object: MeshLike): boolean {
    let sphere = object.boundingSphere;
    if (sphere == null && object.computeBoundingSphere) {
      object.computeBoundingSphere();
      sphere = object.boundingSphere;
    }
    if (sphere == null && object.geometry) {
      if (object.geometry.boundingSphere === null) object.geometry.computeBoundingSphere();
      sphere = object.geometry.boundingSphere;
    }
    // With no computable bound the object cannot safely be culled.
    if (sphere == null) return true;
    if (sphere.radius < 0) return false;
    const scale = conservativeScale(object.matrixWorld);
    if (scale === null) return true;
    const center = new Vector3(sphere.center.x, sphere.center.y, sphere.center.z).applyMatrix4(object.matrixWorld);
    return this.intersectsSphere({ center, radius: sphere.radius * scale });
  }

  intersectsSprite(sprite: SpriteLike): boolean {
    // A unit quad is anchored at center; its local bounding circle has this center.
    const scale = conservativeScale(sprite.matrixWorld);
    if (scale === null) return true;
    const center = new Vector3(0.5 - sprite.center.x, 0.5 - sprite.center.y, 0).applyMatrix4(sprite.matrixWorld);
    return this.intersectsSphere({ center, radius: Math.SQRT1_2 * scale });
  }

  intersectsSphere(sphere: { readonly center: Vector3Like; readonly radius: number }): boolean {
    if (sphere.radius < 0) return false;
    for (const plane of this.planes) {
      const { offset, pointScale, normalLength } = evaluateHalfSpace(plane, sphere.center);
      if (offset < 0 && (normalLength === 0 || -offset / normalLength > sphere.radius / pointScale)) return false;
    }
    return true;
  }

  intersectsBox(box: Box3Like): boolean {
    if (box.min.x > box.max.x || box.min.y > box.max.y || box.min.z > box.max.z) return false;
    for (const plane of this.planes) {
      const n = plane.normal;
      const x = n.x >= 0 ? box.max.x : box.min.x;
      const y = n.y >= 0 ? box.max.y : box.min.y;
      const z = n.z >= 0 ? box.max.z : box.min.z;
      if (evaluateHalfSpace(plane, { x, y, z }).offset < 0) return false;
    }
    return true;
  }

  containsPoint(point: Vector3Like): boolean {
    return this.planes.every(plane => evaluateHalfSpace(plane, point).offset >= 0);
  }

  clone(): this { return new (this.constructor as new () => this)().copy(this); }
}
