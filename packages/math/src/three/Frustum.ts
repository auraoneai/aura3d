import { Frustum as ImmutableFrustum } from "../Frustum.js";
import { WebGLCoordinateSystem, WebGPUCoordinateSystem } from "./Matrix4.js";
import { Plane } from "./Plane.js";
import { Sphere } from "./Sphere.js";
import { Vector2 } from "./Vector2.js";
import { Vector3 } from "./Vector3.js";
import type { Vector3Like } from "./Vector3.js";
import type { Box3Like } from "./Box3.js";
import type { PlaneLike } from "./Plane.js";

/** Anything with six `planes`, including the immutable `@aura3d/math` Frustum. */
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

const _sphere = new Sphere();
const _defaultSpriteCenter = new Vector2(0.5, 0.5);
const _vector = new Vector3();

/**
 * Mutable three.js-compatible view frustum. Plane order matches three:
 * `[right, left, bottom, top, far, near]`. Every modifier mutates `this` and
 * returns `this`, exactly like three r185 `Frustum`.
 */
export class Frustum {
  planes: [Plane, Plane, Plane, Plane, Plane, Plane];

  constructor(
    p0: Plane = new Plane(),
    p1: Plane = new Plane(),
    p2: Plane = new Plane(),
    p3: Plane = new Plane(),
    p4: Plane = new Plane(),
    p5: Plane = new Plane()
  ) {
    this.planes = [p0, p1, p2, p3, p4, p5];
  }

  /** Copy an immutable `@aura3d/math` Frustum (or any six-plane source) into this frustum. */
  fromImmutable(frustum: FrustumLike): this {
    return this.copy(frustum);
  }

  /** Snapshot as an immutable `@aura3d/math` Frustum (its planes are normalized on construction). */
  toImmutable(): ImmutableFrustum {
    const [p0, p1, p2, p3, p4, p5] = this.planes.map((plane) => plane.toImmutable()) as [
      ReturnType<Plane["toImmutable"]>, ReturnType<Plane["toImmutable"]>, ReturnType<Plane["toImmutable"]>,
      ReturnType<Plane["toImmutable"]>, ReturnType<Plane["toImmutable"]>, ReturnType<Plane["toImmutable"]>
    ];
    return new ImmutableFrustum([p0, p1, p2, p3, p4, p5]);
  }

  set(p0: PlaneLike, p1: PlaneLike, p2: PlaneLike, p3: PlaneLike, p4: PlaneLike, p5: PlaneLike): this {
    const planes = this.planes;

    planes[0].copy(p0);
    planes[1].copy(p1);
    planes[2].copy(p2);
    planes[3].copy(p3);
    planes[4].copy(p4);
    planes[5].copy(p5);

    return this;
  }

  copy(frustum: FrustumLike): this {
    const planes = this.planes;

    for (let i = 0; i < 6; i += 1) {
      planes[i]!.copy(frustum.planes[i]!);
    }

    return this;
  }

  setFromProjectionMatrix(
    m: { readonly elements: ArrayLike<number> },
    coordinateSystem: number = WebGLCoordinateSystem,
    reversedDepth = false
  ): this {
    const planes = this.planes;
    const me = m.elements;
    const me0 = me[0]!, me1 = me[1]!, me2 = me[2]!, me3 = me[3]!;
    const me4 = me[4]!, me5 = me[5]!, me6 = me[6]!, me7 = me[7]!;
    const me8 = me[8]!, me9 = me[9]!, me10 = me[10]!, me11 = me[11]!;
    const me12 = me[12]!, me13 = me[13]!, me14 = me[14]!, me15 = me[15]!;

    planes[0].setComponents(me3 - me0, me7 - me4, me11 - me8, me15 - me12).normalize();
    planes[1].setComponents(me3 + me0, me7 + me4, me11 + me8, me15 + me12).normalize();
    planes[2].setComponents(me3 + me1, me7 + me5, me11 + me9, me15 + me13).normalize();
    planes[3].setComponents(me3 - me1, me7 - me5, me11 - me9, me15 - me13).normalize();

    if (reversedDepth) {
      planes[4].setComponents(me2, me6, me10, me14).normalize(); // far
      planes[5].setComponents(me3 - me2, me7 - me6, me11 - me10, me15 - me14).normalize(); // near
    } else {
      planes[4].setComponents(me3 - me2, me7 - me6, me11 - me10, me15 - me14).normalize(); // far

      if (coordinateSystem === WebGLCoordinateSystem) {
        planes[5].setComponents(me3 + me2, me7 + me6, me11 + me10, me15 + me14).normalize(); // near
      } else if (coordinateSystem === WebGPUCoordinateSystem) {
        planes[5].setComponents(me2, me6, me10, me14).normalize(); // near
      } else {
        throw new Error(`THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: ${coordinateSystem}`);
      }
    }

    return this;
  }

  intersectsObject(object: MeshLike): boolean {
    if (object.boundingSphere !== undefined) {
      if (object.boundingSphere === null) object.computeBoundingSphere?.();

      _sphere.copy(object.boundingSphere!).applyMatrix4(object.matrixWorld);
    } else {
      const geometry = object.geometry!;

      if (geometry.boundingSphere === null) geometry.computeBoundingSphere();

      _sphere.copy(geometry.boundingSphere!).applyMatrix4(object.matrixWorld);
    }

    return this.intersectsSphere(_sphere);
  }

  intersectsSprite(sprite: SpriteLike): boolean {
    _sphere.center.set(0, 0, 0);
    const offset = _defaultSpriteCenter.distanceTo(sprite.center);
    _sphere.radius = 0.7071067811865476 + offset;
    _sphere.applyMatrix4(sprite.matrixWorld);

    return this.intersectsSphere(_sphere);
  }

  intersectsSphere(sphere: { readonly center: Vector3Like; readonly radius: number }): boolean {
    const planes = this.planes;
    const center = sphere.center;
    const negRadius = -sphere.radius;

    for (let i = 0; i < 6; i += 1) {
      const distance = planes[i]!.distanceToPoint(center);

      if (distance < negRadius) {
        return false;
      }
    }

    return true;
  }

  intersectsBox(box: Box3Like): boolean {
    const planes = this.planes;

    for (let i = 0; i < 6; i += 1) {
      const plane = planes[i]!;

      // corner at max distance

      _vector.x = plane.normal.x > 0 ? box.max.x : box.min.x;
      _vector.y = plane.normal.y > 0 ? box.max.y : box.min.y;
      _vector.z = plane.normal.z > 0 ? box.max.z : box.min.z;

      if (plane.distanceToPoint(_vector) < 0) {
        return false;
      }
    }

    return true;
  }

  containsPoint(point: Vector3Like): boolean {
    const planes = this.planes;

    for (let i = 0; i < 6; i += 1) {
      if (planes[i]!.distanceToPoint(point) < 0) {
        return false;
      }
    }

    return true;
  }

  clone(): this {
    return new (this.constructor as new () => this)().copy(this);
  }
}
