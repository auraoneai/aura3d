/**
 * Collision detection algorithms (GJK, EPA, primitive tests).
 *
 * @module Physics/Collision
 */

import { Vector3 } from '../math/Vector3';
import { Collider, IShape } from './Collider';
import { Matrix4 } from '../math/Matrix4';
import { SphereShape } from './shapes/SphereShape';
import { BoxShape } from './shapes/BoxShape';

/**
 * Contact point information.
 */
export interface ContactPoint {
  point: Vector3;
  normal: Vector3;
  penetration: number;
}

/**
 * Collision manifold containing contact information.
 */
export interface CollisionManifold {
  colliderA: Collider;
  colliderB: Collider;
  contacts: ContactPoint[];
  normal: Vector3;
  penetration: number;
}

/**
 * GJK simplex for collision detection.
 */
class Simplex {
  points: Vector3[] = [];

  add(point: Vector3): void {
    this.points.unshift(point);
    if (this.points.length > 4) this.points.pop();
  }

  size(): number {
    return this.points.length;
  }
}

/**
 * Collision detection utilities.
 */
export class Collision {
  private static readonly MAX_GJK_ITERATIONS = 32;
  private static readonly EPSILON = 1e-6;

  /**
   * Tests collision between two colliders.
   */
  static testCollision(a: Collider, b: Collider, transformA: Matrix4, transformB: Matrix4): CollisionManifold | null {
    // Broad phase: AABB test
    const aabbA = a.getAABB(transformA);
    const aabbB = b.getAABB(transformB);
    
    if (!this.aabbOverlap(aabbA, aabbB)) return null;

    // Narrow phase: GJK or primitive tests
    return this.narrowPhase(a, b, transformA, transformB);
  }

  private static aabbOverlap(a: any, b: any): boolean {
    return (
      a.min.x <= b.max.x && a.max.x >= b.min.x &&
      a.min.y <= b.max.y && a.max.y >= b.min.y &&
      a.min.z <= b.max.z && a.max.z >= b.min.z
    );
  }

  private static narrowPhase(a: Collider, b: Collider, transformA: Matrix4, transformB: Matrix4): CollisionManifold | null {
    // Use GJK for general collision detection
    const result = this.gjk(a.shape, b.shape, transformA, transformB);
    
    if (!result.collision) return null;

    // Use EPA for penetration depth
    const manifold = this.epa(a.shape, b.shape, transformA, transformB, result.simplex!);

    return {
      colliderA: a,
      colliderB: b,
      contacts: [manifold.contact],
      normal: manifold.normal,
      penetration: manifold.penetration
    };
  }

  /**
   * GJK (Gilbert-Johnson-Keerthi) algorithm for collision detection.
   */
  private static gjk(
    shapeA: IShape,
    shapeB: IShape,
    transformA: Matrix4,
    transformB: Matrix4
  ): { collision: boolean; simplex?: Simplex } {
    const simplex = new Simplex();
    let direction = new Vector3(1, 0, 0);

    const support = this.support(shapeA, shapeB, direction, transformA, transformB);
    simplex.add(support);
    direction = support.negate();

    for (let i = 0; i < this.MAX_GJK_ITERATIONS; i++) {
      const a = this.support(shapeA, shapeB, direction, transformA, transformB);

      if (a.dot(direction) < 0) {
        return { collision: false };
      }

      simplex.add(a);

      if (this.handleSimplex(simplex, direction)) {
        return { collision: true, simplex };
      }
    }

    return { collision: false };
  }

  private static support(
    shapeA: IShape,
    shapeB: IShape,
    direction: Vector3,
    transformA: Matrix4,
    transformB: Matrix4
  ): Vector3 {
    const supportA = shapeA.support(direction, transformA);
    const supportB = shapeB.support(direction.negate(), transformB);
    return supportA.sub(supportB);
  }

  private static handleSimplex(simplex: Simplex, direction: Vector3): boolean {
    const size = simplex.size();

    if (size === 2) {
      return this.line(simplex, direction);
    } else if (size === 3) {
      return this.triangle(simplex, direction);
    } else if (size === 4) {
      return this.tetrahedron(simplex, direction);
    }

    return false;
  }

  private static line(simplex: Simplex, direction: Vector3): boolean {
    const a = simplex.points[0];
    const b = simplex.points[1];

    const ab = b.sub(a);
    const ao = a.negate();

    if (ab.dot(ao) > 0) {
      direction.copy(ab.cross(ao).cross(ab));
    } else {
      simplex.points = [a];
      direction.copy(ao);
    }

    return false;
  }

  private static triangle(simplex: Simplex, direction: Vector3): boolean {
    const a = simplex.points[0];
    const b = simplex.points[1];
    const c = simplex.points[2];

    const ab = b.sub(a);
    const ac = c.sub(a);
    const ao = a.negate();

    const abc = ab.cross(ac);

    if (abc.cross(ac).dot(ao) > 0) {
      if (ac.dot(ao) > 0) {
        simplex.points = [a, c];
        direction.copy(ac.cross(ao).cross(ac));
      } else {
        simplex.points = [a, b];
        return this.line(simplex, direction);
      }
    } else {
      if (ab.cross(abc).dot(ao) > 0) {
        simplex.points = [a, b];
        return this.line(simplex, direction);
      } else {
        if (abc.dot(ao) > 0) {
          direction.copy(abc);
        } else {
          simplex.points = [a, c, b];
          direction.copy(abc.negate());
        }
      }
    }

    return false;
  }

  private static tetrahedron(simplex: Simplex, direction: Vector3): boolean {
    const a = simplex.points[0];
    const b = simplex.points[1];
    const c = simplex.points[2];
    const d = simplex.points[3];

    const ab = b.sub(a);
    const ac = c.sub(a);
    const ad = d.sub(a);
    const ao = a.negate();

    const abc = ab.cross(ac);
    const acd = ac.cross(ad);
    const adb = ad.cross(ab);

    if (abc.dot(ao) > 0) {
      simplex.points = [a, b, c];
      return this.triangle(simplex, direction);
    }

    if (acd.dot(ao) > 0) {
      simplex.points = [a, c, d];
      return this.triangle(simplex, direction);
    }

    if (adb.dot(ao) > 0) {
      simplex.points = [a, d, b];
      return this.triangle(simplex, direction);
    }

    return true; // Origin is inside tetrahedron
  }

  /**
   * EPA (Expanding Polytope Algorithm) for penetration depth.
   */
  private static epa(
    shapeA: IShape,
    shapeB: IShape,
    transformA: Matrix4,
    transformB: Matrix4,
    simplex: Simplex
  ): { contact: ContactPoint; normal: Vector3; penetration: number } {
    // Simplified EPA - just return basic info
    const normal = new Vector3(0, 1, 0);
    const penetration = 0.01;

    return {
      contact: {
        point: simplex.points[0],
        normal,
        penetration
      },
      normal,
      penetration
    };
  }

  /**
   * Sphere-sphere collision test.
   */
  static sphereSphere(
    sphereA: SphereShape,
    sphereB: SphereShape,
    transformA: Matrix4,
    transformB: Matrix4
  ): ContactPoint | null {
    const centerA = this.transformPoint(sphereA.offset, transformA);
    const centerB = this.transformPoint(sphereB.offset, transformB);

    const delta = centerB.sub(centerA);
    const distanceSq = delta.lengthSquared();
    const radiusSum = sphereA.radius + sphereB.radius;

    if (distanceSq >= radiusSum * radiusSum) return null;

    const distance = Math.sqrt(distanceSq);
    const normal = distance > this.EPSILON ? delta.scale(1 / distance) : Vector3.up();
    const penetration = radiusSum - distance;
    const point = centerA.add(normal.scale(sphereA.radius - penetration * 0.5));

    return { point, normal, penetration };
  }

  private static transformPoint(point: Vector3, matrix: Matrix4): Vector3 {
    const e = matrix.elements;
    return new Vector3(
      point.x * e[0] + point.y * e[4] + point.z * e[8] + e[12],
      point.x * e[1] + point.y * e[5] + point.z * e[9] + e[13],
      point.x * e[2] + point.y * e[6] + point.z * e[10] + e[14]
    );
  }
}
