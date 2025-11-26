/**
 * Spring bone chain data for physics-based secondary motion.
 * Stores bone chain configuration, physics parameters, and collision data.
 * @module animation/SpringBoneChain
 */

import { Vector3 } from '../math/Vector3';

/**
 * Sphere collider for spring bone collision.
 */
export interface SphereCollider {
  /** Collider center position (world space) */
  center: Vector3;
  /** Collider radius */
  radius: number;
  /** Bone to attach collider to (optional) */
  attachedBone?: string;
}

/**
 * Capsule collider for spring bone collision.
 */
export interface CapsuleCollider {
  /** Start position (world space) */
  start: Vector3;
  /** End position (world space) */
  end: Vector3;
  /** Collider radius */
  radius: number;
  /** Start bone to attach to (optional) */
  attachedBoneStart?: string;
  /** End bone to attach to (optional) */
  attachedBoneEnd?: string;
}

/**
 * Configuration for spring bone chain.
 */
export interface SpringBoneChainConfig {
  /** Chain name/ID */
  name: string;
  /** Root bone name */
  rootBone: string;
  /** Bone chain (excluding root) */
  bones: string[];
  /** Stiffness (spring force) */
  stiffness?: number;
  /** Damping (drag/friction) */
  damping?: number;
  /** Gravity force */
  gravity?: Vector3;
  /** Wind force */
  wind?: Vector3;
  /** Collision radius for bones */
  collisionRadius?: number;
  /** Sphere colliders */
  sphereColliders?: SphereCollider[];
  /** Capsule colliders */
  capsuleColliders?: CapsuleCollider[];
  /** Inertia (resistance to rotation changes) */
  inertia?: number;
  /** Blend weight [0-1] */
  weight?: number;
}

/**
 * Spring bone chain with physics parameters and collision data.
 * Represents a chain of bones that follow physics-based secondary motion.
 *
 * @example
 * ```typescript
 * const chain = new SpringBoneChain({
 *   name: 'ponytail',
 *   rootBone: 'head',
 *   bones: ['hair_1', 'hair_2', 'hair_3'],
 *   stiffness: 0.5,
 *   damping: 0.3,
 *   gravity: new Vector3(0, -9.8, 0),
 *   collisionRadius: 0.05,
 *   sphereColliders: [
 *     { center: new Vector3(0, 0.5, 0), radius: 0.15, attachedBone: 'head' }
 *   ]
 * });
 * ```
 */
export class SpringBoneChain {
  /** Chain name/ID */
  readonly name: string;

  /** Root bone name */
  readonly rootBone: string;

  /** Bone chain names */
  readonly bones: string[];

  /** Spring stiffness [0-1] */
  stiffness: number;

  /** Damping factor [0-1] */
  damping: number;

  /** Gravity force */
  gravity: Vector3;

  /** Wind force */
  wind: Vector3;

  /** Collision radius */
  collisionRadius: number;

  /** Sphere colliders */
  sphereColliders: SphereCollider[];

  /** Capsule colliders */
  capsuleColliders: CapsuleCollider[];

  /** Inertia factor */
  inertia: number;

  /** Blend weight */
  weight: number;

  /** Bone indices (cached) */
  private boneIndices: number[] = [];

  /** Root bone index */
  private rootIndex: number = -1;

  /** Current positions (Verlet) */
  private currentPositions: Vector3[] = [];

  /** Previous positions (Verlet) */
  private previousPositions: Vector3[] = [];

  /** Bone lengths */
  private boneLengths: number[] = [];

  /** Is initialized */
  private initialized: boolean = false;

  /**
   * Creates a new spring bone chain.
   *
   * @param config - Chain configuration
   */
  constructor(config: SpringBoneChainConfig) {
    this.name = config.name;
    this.rootBone = config.rootBone;
    this.bones = [...config.bones];
    this.stiffness = config.stiffness ?? 0.5;
    this.damping = config.damping ?? 0.3;
    this.gravity = config.gravity ?? new Vector3(0, -9.8, 0);
    this.wind = config.wind ?? Vector3.zero();
    this.collisionRadius = config.collisionRadius ?? 0.05;
    this.sphereColliders = config.sphereColliders ?? [];
    this.capsuleColliders = config.capsuleColliders ?? [];
    this.inertia = config.inertia ?? 0.5;
    this.weight = config.weight ?? 1.0;
  }

  /**
   * Gets bone indices.
   *
   * @returns Bone indices array
   */
  getBoneIndices(): number[] {
    return this.boneIndices;
  }

  /**
   * Gets root bone index.
   *
   * @returns Root index
   */
  getRootIndex(): number {
    return this.rootIndex;
  }

  /**
   * Gets current positions.
   *
   * @returns Current positions array
   */
  getCurrentPositions(): Vector3[] {
    return this.currentPositions;
  }

  /**
   * Gets previous positions.
   *
   * @returns Previous positions array
   */
  getPreviousPositions(): Vector3[] {
    return this.previousPositions;
  }

  /**
   * Gets bone lengths.
   *
   * @returns Bone lengths array
   */
  getBoneLengths(): number[] {
    return this.boneLengths;
  }

  /**
   * Checks if chain is initialized.
   *
   * @returns True if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Sets bone indices.
   *
   * @param indices - Bone indices
   */
  setBoneIndices(indices: number[]): void {
    this.boneIndices = indices;
  }

  /**
   * Sets root bone index.
   *
   * @param index - Root index
   */
  setRootIndex(index: number): void {
    this.rootIndex = index;
  }

  /**
   * Sets current positions.
   *
   * @param positions - Current positions
   */
  setCurrentPositions(positions: Vector3[]): void {
    this.currentPositions = positions;
  }

  /**
   * Sets previous positions.
   *
   * @param positions - Previous positions
   */
  setPreviousPositions(positions: Vector3[]): void {
    this.previousPositions = positions;
  }

  /**
   * Sets bone lengths.
   *
   * @param lengths - Bone lengths
   */
  setBoneLengths(lengths: number[]): void {
    this.boneLengths = lengths;
  }

  /**
   * Sets initialized state.
   *
   * @param initialized - Initialized state
   */
  setInitialized(initialized: boolean): void {
    this.initialized = initialized;
  }

  /**
   * Allocates arrays for Verlet integration.
   *
   * @param count - Number of bones
   */
  allocateArrays(count: number): void {
    this.currentPositions = new Array(count);
    this.previousPositions = new Array(count);
    this.boneLengths = new Array(count - 1);

    for (let i = 0; i < count; i++) {
      this.currentPositions[i] = Vector3.zero();
      this.previousPositions[i] = Vector3.zero();
    }
  }

  /**
   * Sets the blend weight.
   *
   * @param weight - Weight [0-1]
   */
  setWeight(weight: number): void {
    this.weight = Math.max(0, Math.min(1, weight));
  }

  /**
   * Gets the blend weight.
   *
   * @returns Current weight
   */
  getWeight(): number {
    return this.weight;
  }

  /**
   * Adds a sphere collider.
   *
   * @param collider - Sphere collider
   */
  addSphereCollider(collider: SphereCollider): void {
    this.sphereColliders.push(collider);
  }

  /**
   * Adds a capsule collider.
   *
   * @param collider - Capsule collider
   */
  addCapsuleCollider(collider: CapsuleCollider): void {
    this.capsuleColliders.push(collider);
  }

  /**
   * Removes all colliders.
   */
  clearColliders(): void {
    this.sphereColliders = [];
    this.capsuleColliders = [];
  }

  /**
   * Clones this chain.
   *
   * @returns Cloned chain
   */
  clone(): SpringBoneChain {
    return new SpringBoneChain({
      name: this.name,
      rootBone: this.rootBone,
      bones: [...this.bones],
      stiffness: this.stiffness,
      damping: this.damping,
      gravity: this.gravity.clone(),
      wind: this.wind.clone(),
      collisionRadius: this.collisionRadius,
      sphereColliders: this.sphereColliders.map(c => ({
        center: c.center.clone(),
        radius: c.radius,
        attachedBone: c.attachedBone
      })),
      capsuleColliders: this.capsuleColliders.map(c => ({
        start: c.start.clone(),
        end: c.end.clone(),
        radius: c.radius,
        attachedBoneStart: c.attachedBoneStart,
        attachedBoneEnd: c.attachedBoneEnd
      })),
      inertia: this.inertia,
      weight: this.weight
    });
  }
}
