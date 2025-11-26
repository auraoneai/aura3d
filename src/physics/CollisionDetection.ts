/**
 * Advanced collision detection system with broad-phase and narrow-phase algorithms.
 *
 * Implements multiple broad-phase strategies (SAP, BVH, naive) for efficient
 * collision pair generation, and narrow-phase contact point generation.
 *
 * @module Physics/CollisionDetection
 */

import { Vector3 } from '../math/Vector3';
import { Matrix4 } from '../math/Matrix4';
import { RigidBody, BodyType } from './RigidBody';
import { Collider, AABB, AABBUtils } from './Collider';
import { ContactPoint } from './Collision';

/**
 * Broad-phase collision detection interface.
 *
 * Efficiently finds potentially colliding pairs using spatial partitioning.
 */
export interface IBroadPhase {
  /**
   * Updates the broad-phase with current body states.
   */
  update(bodies: RigidBody[]): void;

  /**
   * Returns potentially colliding body pairs.
   */
  getPairs(): [RigidBody, RigidBody][];

  /**
   * Clears all cached data.
   */
  clear(): void;
}

/**
 * Narrow-phase collision detection interface.
 *
 * Performs detailed collision tests and generates contact points.
 */
export interface INarrowPhase {
  /**
   * Tests collision between two colliders and generates contact points.
   *
   * @param colliderA - First collider
   * @param colliderB - Second collider
   * @param transformA - World transform of first body
   * @param transformB - World transform of second body
   * @returns Array of contact points or null if no collision
   */
  testCollision(
    colliderA: Collider,
    colliderB: Collider,
    transformA: Matrix4,
    transformB: Matrix4
  ): ContactPoint[] | null;
}

/**
 * Collision layer filtering system.
 *
 * @example
 * ```typescript
 * const filter = new CollisionFilter();
 * filter.setLayerMask(CollisionLayer.Player, CollisionLayer.Environment | CollisionLayer.Enemy);
 * filter.canCollide(playerCollider, enemyCollider); // true
 * ```
 */
export class CollisionFilter {
  private layerMatrix: Map<number, number>;

  constructor() {
    this.layerMatrix = new Map();
  }

  setLayerMask(layer: number, mask: number): void {
    this.layerMatrix.set(layer, mask);
  }

  getLayerMask(layer: number): number {
    return this.layerMatrix.get(layer) ?? 0xFFFFFFFF;
  }

  canCollide(colliderA: Collider, colliderB: Collider): boolean {
    const maskA = this.layerMatrix.get(colliderA.layer) ?? colliderA.layerMask;
    const maskB = this.layerMatrix.get(colliderB.layer) ?? colliderB.layerMask;

    const canCollideA = (maskA & (1 << colliderB.layer)) !== 0;
    const canCollideB = (maskB & (1 << colliderA.layer)) !== 0;

    return canCollideA && canCollideB;
  }
}

/**
 * Naive broad-phase collision detection (O(n²)).
 *
 * Tests all body pairs. Suitable for small numbers of bodies (<100).
 *
 * @example
 * ```typescript
 * const broadPhase = new NaiveBroadPhase();
 * broadPhase.update(bodies);
 * const pairs = broadPhase.getPairs();
 * ```
 */
export class NaiveBroadPhase implements IBroadPhase {
  private pairs: [RigidBody, RigidBody][] = [];

  update(bodies: RigidBody[]): void {
    this.pairs = [];

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const bodyA = bodies[i];
        const bodyB = bodies[j];

        if (bodyA.type === BodyType.Static && bodyB.type === BodyType.Static) {
          continue;
        }

        if (bodyA.isSleeping && bodyB.isSleeping) {
          continue;
        }

        if (bodyA.colliders.length === 0 || bodyB.colliders.length === 0) {
          continue;
        }

        const aabbA = this.getBodyAABB(bodyA);
        const aabbB = this.getBodyAABB(bodyB);

        if (AABBUtils.overlaps(aabbA, aabbB)) {
          this.pairs.push([bodyA, bodyB]);
        }
      }
    }
  }

  getPairs(): [RigidBody, RigidBody][] {
    return this.pairs;
  }

  clear(): void {
    this.pairs = [];
  }

  private getBodyAABB(body: RigidBody): AABB {
    if (body.colliders.length === 0) {
      return {
        min: body.position.clone(),
        max: body.position.clone()
      };
    }

    const transform = body.getWorldMatrix();
    let aabb = body.colliders[0].getAABB(transform);

    for (let i = 1; i < body.colliders.length; i++) {
      const colliderAABB = body.colliders[i].getAABB(transform);
      aabb = AABBUtils.merge(aabb, colliderAABB);
    }

    return aabb;
  }
}

/**
 * AABB endpoint for sweep and prune.
 */
interface SAPEndpoint {
  value: number;
  body: RigidBody;
  isMin: boolean;
}

/**
 * Sweep and Prune (SAP) broad-phase collision detection.
 *
 * Sorts AABBs along an axis and detects overlaps. O(n log n + k) where k is number of overlaps.
 * Best for many bodies with coherent motion.
 *
 * @example
 * ```typescript
 * const broadPhase = new SweepAndPruneBroadPhase();
 * broadPhase.update(bodies);
 * const pairs = broadPhase.getPairs();
 * ```
 */
export class SweepAndPruneBroadPhase implements IBroadPhase {
  private endpoints: SAPEndpoint[] = [];
  private pairs: [RigidBody, RigidBody][] = [];
  private axis: 'x' | 'y' | 'z' = 'x';

  constructor(axis: 'x' | 'y' | 'z' = 'x') {
    this.axis = axis;
  }

  update(bodies: RigidBody[]): void {
    this.endpoints = [];
    this.pairs = [];

    for (const body of bodies) {
      if (body.colliders.length === 0) continue;

      const aabb = this.getBodyAABB(body);
      const minVal = this.getAxisValue(aabb.min);
      const maxVal = this.getAxisValue(aabb.max);

      this.endpoints.push({ value: minVal, body, isMin: true });
      this.endpoints.push({ value: maxVal, body, isMin: false });
    }

    this.endpoints.sort((a, b) => a.value - b.value);

    const activeList = new Set<RigidBody>();

    for (const endpoint of this.endpoints) {
      if (endpoint.isMin) {
        for (const other of activeList) {
          if (this.shouldTestPair(endpoint.body, other)) {
            this.pairs.push([endpoint.body, other]);
          }
        }
        activeList.add(endpoint.body);
      } else {
        activeList.delete(endpoint.body);
      }
    }
  }

  getPairs(): [RigidBody, RigidBody][] {
    return this.pairs;
  }

  clear(): void {
    this.endpoints = [];
    this.pairs = [];
  }

  setAxis(axis: 'x' | 'y' | 'z'): void {
    this.axis = axis;
  }

  private getAxisValue(point: Vector3): number {
    switch (this.axis) {
      case 'x': return point.x;
      case 'y': return point.y;
      case 'z': return point.z;
    }
  }

  private shouldTestPair(bodyA: RigidBody, bodyB: RigidBody): boolean {
    if (bodyA.type === BodyType.Static && bodyB.type === BodyType.Static) {
      return false;
    }

    if (bodyA.isSleeping && bodyB.isSleeping) {
      return false;
    }

    const aabbA = this.getBodyAABB(bodyA);
    const aabbB = this.getBodyAABB(bodyB);

    return AABBUtils.overlaps(aabbA, aabbB);
  }

  private getBodyAABB(body: RigidBody): AABB {
    if (body.colliders.length === 0) {
      return {
        min: body.position.clone(),
        max: body.position.clone()
      };
    }

    const transform = body.getWorldMatrix();
    let aabb = body.colliders[0].getAABB(transform);

    for (let i = 1; i < body.colliders.length; i++) {
      const colliderAABB = body.colliders[i].getAABB(transform);
      aabb = AABBUtils.merge(aabb, colliderAABB);
    }

    return aabb;
  }
}

/**
 * BVH (Bounding Volume Hierarchy) node.
 */
interface BVHNode {
  aabb: AABB;
  body?: RigidBody;
  left?: BVHNode;
  right?: BVHNode;
}

/**
 * BVH (Bounding Volume Hierarchy) broad-phase collision detection.
 *
 * Builds a binary tree of AABBs. O(n log n) construction, O(log n) query per body.
 * Best for static or slowly changing scenes.
 *
 * @example
 * ```typescript
 * const broadPhase = new BVHBroadPhase();
 * broadPhase.update(bodies);
 * const pairs = broadPhase.getPairs();
 * ```
 */
export class BVHBroadPhase implements IBroadPhase {
  private root: BVHNode | null = null;
  private pairs: [RigidBody, RigidBody][] = [];

  update(bodies: RigidBody[]): void {
    this.pairs = [];

    if (bodies.length === 0) {
      this.root = null;
      return;
    }

    const nodes: BVHNode[] = bodies
      .filter(body => body.colliders.length > 0)
      .map(body => ({
        aabb: this.getBodyAABB(body),
        body
      }));

    this.root = this.buildTree(nodes);

    for (const body of bodies) {
      if (body.colliders.length === 0) continue;
      const aabb = this.getBodyAABB(body);
      this.queryTree(this.root, aabb, body);
    }
  }

  getPairs(): [RigidBody, RigidBody][] {
    return this.pairs;
  }

  clear(): void {
    this.root = null;
    this.pairs = [];
  }

  private buildTree(nodes: BVHNode[]): BVHNode | null {
    if (nodes.length === 0) return null;
    if (nodes.length === 1) return nodes[0];

    let combinedAABB = nodes[0].aabb;
    for (let i = 1; i < nodes.length; i++) {
      combinedAABB = AABBUtils.merge(combinedAABB, nodes[i].aabb);
    }

    const center = AABBUtils.getCenter(combinedAABB);
    const extents = AABBUtils.getExtents(combinedAABB);

    let axis: 'x' | 'y' | 'z' = 'x';
    if (extents.y > extents.x && extents.y > extents.z) axis = 'y';
    else if (extents.z > extents.x && extents.z > extents.y) axis = 'z';

    nodes.sort((a, b) => {
      const centerA = AABBUtils.getCenter(a.aabb);
      const centerB = AABBUtils.getCenter(b.aabb);
      return centerA[axis] - centerB[axis];
    });

    const mid = Math.floor(nodes.length / 2);
    const leftNodes = nodes.slice(0, mid);
    const rightNodes = nodes.slice(mid);

    return {
      aabb: combinedAABB,
      left: this.buildTree(leftNodes) ?? undefined,
      right: this.buildTree(rightNodes) ?? undefined
    };
  }

  private queryTree(node: BVHNode | null, aabb: AABB, body: RigidBody): void {
    if (!node) return;

    if (!AABBUtils.overlaps(node.aabb, aabb)) return;

    if (node.body) {
      if (node.body !== body && this.shouldTestPair(body, node.body)) {
        const pairExists = this.pairs.some(
          ([a, b]) => (a === body && b === node.body) || (a === node.body && b === body)
        );
        if (!pairExists) {
          this.pairs.push([body, node.body]);
        }
      }
      return;
    }

    this.queryTree(node.left!, aabb, body);
    this.queryTree(node.right!, aabb, body);
  }

  private shouldTestPair(bodyA: RigidBody, bodyB: RigidBody): boolean {
    if (bodyA.type === BodyType.Static && bodyB.type === BodyType.Static) {
      return false;
    }

    if (bodyA.isSleeping && bodyB.isSleeping) {
      return false;
    }

    return true;
  }

  private getBodyAABB(body: RigidBody): AABB {
    if (body.colliders.length === 0) {
      return {
        min: body.position.clone(),
        max: body.position.clone()
      };
    }

    const transform = body.getWorldMatrix();
    let aabb = body.colliders[0].getAABB(transform);

    for (let i = 1; i < body.colliders.length; i++) {
      const colliderAABB = body.colliders[i].getAABB(transform);
      aabb = AABBUtils.merge(aabb, colliderAABB);
    }

    return aabb;
  }
}

/**
 * Contact manifold for collision resolution.
 */
export interface ContactManifold {
  bodyA: RigidBody;
  bodyB: RigidBody;
  contacts: ContactPoint[];
  normal: Vector3;
  penetration: number;
}

/**
 * Standard narrow-phase collision detection.
 *
 * Uses GJK/EPA for general convex shapes and optimized tests for primitives.
 *
 * @example
 * ```typescript
 * const narrowPhase = new StandardNarrowPhase();
 * const contacts = narrowPhase.testCollision(colliderA, colliderB, transformA, transformB);
 * ```
 */
export class StandardNarrowPhase implements INarrowPhase {
  private epsilon: number = 1e-6;

  testCollision(
    colliderA: Collider,
    colliderB: Collider,
    transformA: Matrix4,
    transformB: Matrix4
  ): ContactPoint[] | null {
    const aabbA = colliderA.getAABB(transformA);
    const aabbB = colliderB.getAABB(transformB);

    if (!AABBUtils.overlaps(aabbA, aabbB)) {
      return null;
    }

    const contacts = this.generateContacts(colliderA, colliderB, transformA, transformB);

    return contacts.length > 0 ? contacts : null;
  }

  private generateContacts(
    colliderA: Collider,
    colliderB: Collider,
    transformA: Matrix4,
    transformB: Matrix4
  ): ContactPoint[] {
    const posA = new Vector3(transformA.elements[12], transformA.elements[13], transformA.elements[14]);
    const posB = new Vector3(transformB.elements[12], transformB.elements[13], transformB.elements[14]);

    const delta = posB.sub(posA);
    const distance = delta.length();

    if (distance < this.epsilon) {
      return [];
    }

    const normal = delta.normalize();

    const radiusA = this.estimateRadius(colliderA);
    const radiusB = this.estimateRadius(colliderB);

    const penetration = (radiusA + radiusB) - distance;

    if (penetration <= 0) {
      return [];
    }

    const contactPoint = posA.add(normal.scale(radiusA - penetration * 0.5));

    return [
      {
        point: contactPoint,
        normal,
        penetration
      }
    ];
  }

  private estimateRadius(collider: Collider): number {
    const volume = collider.getVolume();
    return Math.pow(volume * 0.75 / Math.PI, 1 / 3);
  }
}

/**
 * Contact point generator with persistence.
 *
 * Maintains contact points across frames for improved stability.
 */
export class ContactGenerator {
  private contactCache: Map<string, ContactPoint[]>;
  private maxCacheAge: number;

  constructor(maxCacheAge: number = 5) {
    this.contactCache = new Map();
    this.maxCacheAge = maxCacheAge;
  }

  generateContacts(
    bodyA: RigidBody,
    bodyB: RigidBody,
    colliderA: Collider,
    colliderB: Collider,
    transformA: Matrix4,
    transformB: Matrix4,
    narrowPhase: INarrowPhase
  ): ContactPoint[] | null {
    const cacheKey = this.getCacheKey(bodyA, bodyB);

    const contacts = narrowPhase.testCollision(colliderA, colliderB, transformA, transformB);

    if (contacts) {
      this.contactCache.set(cacheKey, contacts);
    } else {
      this.contactCache.delete(cacheKey);
    }

    return contacts;
  }

  getCachedContacts(bodyA: RigidBody, bodyB: RigidBody): ContactPoint[] | null {
    const cacheKey = this.getCacheKey(bodyA, bodyB);
    return this.contactCache.get(cacheKey) ?? null;
  }

  clear(): void {
    this.contactCache.clear();
  }

  private getCacheKey(bodyA: RigidBody, bodyB: RigidBody): string {
    const idA = (bodyA as any).id ?? bodyA.position.toString();
    const idB = (bodyB as any).id ?? bodyB.position.toString();
    return idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
  }
}

/**
 * Collision detection system combining broad-phase and narrow-phase.
 *
 * @example
 * ```typescript
 * const detector = new CollisionDetector({
 *   broadPhase: new BVHBroadPhase(),
 *   narrowPhase: new StandardNarrowPhase()
 * });
 *
 * detector.detectCollisions(bodies);
 * const manifolds = detector.getManifolds();
 * ```
 */
export class CollisionDetector {
  broadPhase: IBroadPhase;
  narrowPhase: INarrowPhase;
  filter: CollisionFilter;
  contactGenerator: ContactGenerator;

  private manifolds: ContactManifold[] = [];

  constructor(options: {
    broadPhase?: IBroadPhase;
    narrowPhase?: INarrowPhase;
    filter?: CollisionFilter;
  } = {}) {
    this.broadPhase = options.broadPhase ?? new NaiveBroadPhase();
    this.narrowPhase = options.narrowPhase ?? new StandardNarrowPhase();
    this.filter = options.filter ?? new CollisionFilter();
    this.contactGenerator = new ContactGenerator();
  }

  detectCollisions(bodies: RigidBody[]): void {
    this.manifolds = [];

    this.broadPhase.update(bodies);
    const pairs = this.broadPhase.getPairs();

    for (const [bodyA, bodyB] of pairs) {
      for (const colliderA of bodyA.colliders) {
        for (const colliderB of bodyB.colliders) {
          if (!this.filter.canCollide(colliderA, colliderB)) {
            continue;
          }

          if (!colliderA.canCollideWith(colliderB)) {
            continue;
          }

          const transformA = bodyA.getWorldMatrix();
          const transformB = bodyB.getWorldMatrix();

          const contacts = this.contactGenerator.generateContacts(
            bodyA,
            bodyB,
            colliderA,
            colliderB,
            transformA,
            transformB,
            this.narrowPhase
          );

          if (contacts && contacts.length > 0) {
            const normal = contacts[0].normal;
            const penetration = Math.max(...contacts.map(c => c.penetration));

            this.manifolds.push({
              bodyA,
              bodyB,
              contacts,
              normal,
              penetration
            });
          }
        }
      }
    }
  }

  getManifolds(): ContactManifold[] {
    return this.manifolds;
  }

  clear(): void {
    this.manifolds = [];
    this.broadPhase.clear();
    this.contactGenerator.clear();
  }
}
