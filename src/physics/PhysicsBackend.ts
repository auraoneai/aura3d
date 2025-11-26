/**
 * Abstract physics backend interface for pluggable physics engines.
 *
 * @module Physics/PhysicsBackend
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { Matrix4 } from '../math/Matrix4';
import { IShape, ShapeType } from './Collider';
import { BodyType } from './RigidBody';

/**
 * Physics body handle type for backend-specific body references.
 */
export type PhysicsBodyHandle = number | object;

/**
 * Physics shape handle type for backend-specific shape references.
 */
export type PhysicsShapeHandle = number | object;

/**
 * Physics constraint handle type for backend-specific constraint references.
 */
export type PhysicsConstraintHandle = number | object;

/**
 * Physics material properties.
 */
export interface PhysicsMaterialData {
  friction: number;
  restitution: number;
  density: number;
  linearDamping: number;
  angularDamping: number;
}

/**
 * Rigid body configuration for creation.
 */
export interface RigidBodyConfig {
  type: BodyType;
  position: Vector3;
  rotation: Quaternion;
  mass: number;
  linearVelocity?: Vector3;
  angularVelocity?: Vector3;
  linearDamping?: number;
  angularDamping?: number;
  gravityScale?: number;
  isSleeping?: boolean;
  isCcd?: boolean;
  userData?: any;
}

/**
 * Shape configuration for creation.
 */
export interface ShapeConfig {
  type: ShapeType;
  shape: IShape;
  offset?: Vector3;
  rotation?: Quaternion;
  material?: PhysicsMaterialData;
  isSensor?: boolean;
  density?: number;
}

/**
 * Constraint type enumeration.
 */
export enum ConstraintType {
  Fixed = 'fixed',
  Hinge = 'hinge',
  Slider = 'slider',
  BallSocket = 'ball-socket',
  Spring = 'spring',
  Distance = 'distance',
  Prismatic = 'prismatic',
  Revolute = 'revolute',
  Cone = 'cone'
}

/**
 * Base constraint configuration.
 */
export interface ConstraintConfig {
  type: ConstraintType;
  bodyA: PhysicsBodyHandle;
  bodyB: PhysicsBodyHandle | null;
  anchorA: Vector3;
  anchorB: Vector3;
  breakForce?: number;
  breakTorque?: number;
  collideConnected?: boolean;
}

/**
 * Hinge constraint configuration.
 */
export interface HingeConstraintConfig extends ConstraintConfig {
  type: ConstraintType.Hinge;
  axis: Vector3;
  minAngle?: number;
  maxAngle?: number;
  motorEnabled?: boolean;
  motorSpeed?: number;
  motorMaxForce?: number;
}

/**
 * Slider constraint configuration.
 */
export interface SliderConstraintConfig extends ConstraintConfig {
  type: ConstraintType.Slider;
  axis: Vector3;
  minDistance?: number;
  maxDistance?: number;
}

/**
 * Spring constraint configuration.
 */
export interface SpringConstraintConfig extends ConstraintConfig {
  type: ConstraintType.Spring;
  restLength?: number;
  stiffness: number;
  damping: number;
}

/**
 * Raycast result information.
 */
export interface RaycastHit {
  body: PhysicsBodyHandle;
  point: Vector3;
  normal: Vector3;
  distance: number;
  fraction: number;
  userData?: any;
}

/**
 * Raycast query parameters.
 */
export interface RaycastQuery {
  origin: Vector3;
  direction: Vector3;
  maxDistance: number;
  layerMask?: number;
  queryTriggers?: boolean;
}

/**
 * Collision event information.
 */
export interface CollisionEvent {
  bodyA: PhysicsBodyHandle;
  bodyB: PhysicsBodyHandle;
  contacts: ContactPoint[];
  impulse: number;
}

/**
 * Contact point in collision.
 */
export interface ContactPoint {
  point: Vector3;
  normal: Vector3;
  separation: number;
  impulse: number;
}

/**
 * Physics world configuration.
 */
export interface PhysicsWorldConfig {
  gravity: Vector3;
  maxSubsteps: number;
  fixedTimestep: number;
  solverIterations?: number;
  allowSleeping?: boolean;
  sleepThreshold?: number;
  broadphaseType?: 'sap' | 'grid' | 'tree';
}

/**
 * Backend initialization options.
 */
export interface BackendInitOptions {
  wasmPath?: string;
  workerUrl?: string;
  enableCCD?: boolean;
  enableMultithreading?: boolean;
}

/**
 * Abstract physics backend interface.
 *
 * Provides a unified API for different physics engines (Cannon.js, Rapier, Ammo.js).
 * Backends must implement all methods for complete physics simulation support.
 *
 * Performance target: 1000 active bodies @ 60 FPS
 *
 * @example
 * ```typescript
 * const backend = new CannonBackend();
 * await backend.initialize();
 *
 * const worldConfig: PhysicsWorldConfig = {
 *   gravity: new Vector3(0, -9.81, 0),
 *   maxSubsteps: 5,
 *   fixedTimestep: 1 / 60
 * };
 *
 * const bodyHandle = backend.createBody({
 *   type: BodyType.Dynamic,
 *   position: new Vector3(0, 10, 0),
 *   rotation: Quaternion.identity(),
 *   mass: 10
 * });
 *
 * backend.step(1 / 60, worldConfig);
 *
 * const state = backend.getBodyState(bodyHandle);
 * console.log(state.position, state.rotation);
 * ```
 */
export abstract class PhysicsBackend {
  /**
   * Backend name for identification.
   */
  abstract readonly name: string;

  /**
   * Backend version string.
   */
  abstract readonly version: string;

  /**
   * Whether the backend is initialized and ready.
   */
  protected _initialized: boolean = false;

  /**
   * Gets initialization status.
   */
  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Initializes the physics backend.
   * Must be called before any other methods.
   *
   * @param options - Backend-specific initialization options
   * @returns Promise that resolves when initialization is complete
   *
   * @example
   * ```typescript
   * const backend = new RapierBackend();
   * await backend.initialize({ wasmPath: '/wasm/rapier.wasm' });
   * ```
   */
  abstract initialize(options?: BackendInitOptions): Promise<void>;

  /**
   * Disposes the physics backend and frees all resources.
   * After disposal, the backend cannot be used.
   *
   * @example
   * ```typescript
   * backend.dispose();
   * ```
   */
  abstract dispose(): void;

  /**
   * Steps the physics simulation forward by the specified time.
   * Uses fixed timestep with accumulator for stability.
   *
   * @param deltaTime - Time elapsed since last frame in seconds
   * @param config - Physics world configuration
   *
   * @example
   * ```typescript
   * const dt = 1 / 60;
   * backend.step(dt, worldConfig);
   * ```
   */
  abstract step(deltaTime: number, config: PhysicsWorldConfig): void;

  /**
   * Creates a rigid body in the physics world.
   *
   * @param config - Rigid body configuration
   * @returns Handle to the created body
   *
   * @example
   * ```typescript
   * const handle = backend.createBody({
   *   type: BodyType.Dynamic,
   *   position: new Vector3(0, 5, 0),
   *   rotation: Quaternion.identity(),
   *   mass: 10
   * });
   * ```
   */
  abstract createBody(config: RigidBodyConfig): PhysicsBodyHandle;

  /**
   * Destroys a rigid body and removes it from the physics world.
   *
   * @param handle - Body handle to destroy
   *
   * @example
   * ```typescript
   * backend.destroyBody(bodyHandle);
   * ```
   */
  abstract destroyBody(handle: PhysicsBodyHandle): void;

  /**
   * Creates a collision shape and attaches it to a body.
   *
   * @param bodyHandle - Body to attach shape to
   * @param config - Shape configuration
   * @returns Handle to the created shape
   *
   * @example
   * ```typescript
   * const shapeHandle = backend.createShape(bodyHandle, {
   *   type: ShapeType.Box,
   *   shape: new BoxShape(new Vector3(1, 1, 1)),
   *   material: { friction: 0.5, restitution: 0.3, density: 1000 }
   * });
   * ```
   */
  abstract createShape(bodyHandle: PhysicsBodyHandle, config: ShapeConfig): PhysicsShapeHandle;

  /**
   * Destroys a collision shape and removes it from its body.
   *
   * @param handle - Shape handle to destroy
   *
   * @example
   * ```typescript
   * backend.destroyShape(shapeHandle);
   * ```
   */
  abstract destroyShape(handle: PhysicsShapeHandle): void;

  /**
   * Creates a constraint (joint) between two bodies.
   *
   * @param config - Constraint configuration
   * @returns Handle to the created constraint
   *
   * @example
   * ```typescript
   * const hingeHandle = backend.createConstraint({
   *   type: ConstraintType.Hinge,
   *   bodyA: bodyHandleA,
   *   bodyB: bodyHandleB,
   *   anchorA: new Vector3(0, 0, 0),
   *   anchorB: new Vector3(0, 1, 0),
   *   axis: new Vector3(1, 0, 0)
   * } as HingeConstraintConfig);
   * ```
   */
  abstract createConstraint(config: ConstraintConfig | HingeConstraintConfig | SliderConstraintConfig | SpringConstraintConfig): PhysicsConstraintHandle;

  /**
   * Destroys a constraint and removes it from the physics world.
   *
   * @param handle - Constraint handle to destroy
   *
   * @example
   * ```typescript
   * backend.destroyConstraint(constraintHandle);
   * ```
   */
  abstract destroyConstraint(handle: PhysicsConstraintHandle): void;

  /**
   * Performs a raycast query in the physics world.
   *
   * @param query - Raycast query parameters
   * @returns Array of hits sorted by distance, or empty array if no hits
   *
   * @example
   * ```typescript
   * const hits = backend.raycast({
   *   origin: new Vector3(0, 10, 0),
   *   direction: new Vector3(0, -1, 0),
   *   maxDistance: 20,
   *   queryTriggers: false
   * });
   *
   * if (hits.length > 0) {
   *   console.log('Hit at', hits[0].point);
   * }
   * ```
   */
  abstract raycast(query: RaycastQuery): RaycastHit[];

  /**
   * Gets all active collision events from the last simulation step.
   *
   * @returns Array of collision events
   *
   * @example
   * ```typescript
   * const collisions = backend.getCollisions();
   * for (const collision of collisions) {
   *   console.log('Collision:', collision.bodyA, collision.bodyB);
   * }
   * ```
   */
  abstract getCollisions(): CollisionEvent[];

  /**
   * Gets the current state of a rigid body.
   *
   * @param handle - Body handle
   * @returns Body state with position, rotation, and velocities
   *
   * @example
   * ```typescript
   * const state = backend.getBodyState(bodyHandle);
   * mesh.position.copy(state.position);
   * mesh.quaternion.copy(state.rotation);
   * ```
   */
  abstract getBodyState(handle: PhysicsBodyHandle): {
    position: Vector3;
    rotation: Quaternion;
    linearVelocity: Vector3;
    angularVelocity: Vector3;
    isSleeping: boolean;
  };

  /**
   * Sets the position and rotation of a rigid body.
   *
   * @param handle - Body handle
   * @param position - New position
   * @param rotation - New rotation
   *
   * @example
   * ```typescript
   * backend.setBodyTransform(
   *   bodyHandle,
   *   new Vector3(10, 0, 0),
   *   Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2)
   * );
   * ```
   */
  abstract setBodyTransform(handle: PhysicsBodyHandle, position: Vector3, rotation: Quaternion): void;

  /**
   * Sets the linear and angular velocities of a rigid body.
   *
   * @param handle - Body handle
   * @param linear - Linear velocity
   * @param angular - Angular velocity
   *
   * @example
   * ```typescript
   * backend.setBodyVelocity(
   *   bodyHandle,
   *   new Vector3(5, 0, 0),
   *   new Vector3(0, 1, 0)
   * );
   * ```
   */
  abstract setBodyVelocity(handle: PhysicsBodyHandle, linear: Vector3, angular: Vector3): void;

  /**
   * Applies a force to a rigid body at its center of mass.
   *
   * @param handle - Body handle
   * @param force - Force vector
   * @param point - Optional point of application in world space
   *
   * @example
   * ```typescript
   * backend.applyForce(bodyHandle, new Vector3(0, 100, 0));
   * ```
   */
  abstract applyForce(handle: PhysicsBodyHandle, force: Vector3, point?: Vector3): void;

  /**
   * Applies an impulse to a rigid body at its center of mass.
   *
   * @param handle - Body handle
   * @param impulse - Impulse vector
   * @param point - Optional point of application in world space
   *
   * @example
   * ```typescript
   * backend.applyImpulse(bodyHandle, new Vector3(0, 10, 0));
   * ```
   */
  abstract applyImpulse(handle: PhysicsBodyHandle, impulse: Vector3, point?: Vector3): void;

  /**
   * Sets the mass of a rigid body.
   *
   * @param handle - Body handle
   * @param mass - New mass value
   *
   * @example
   * ```typescript
   * backend.setBodyMass(bodyHandle, 50);
   * ```
   */
  abstract setBodyMass(handle: PhysicsBodyHandle, mass: number): void;

  /**
   * Wakes up a sleeping rigid body.
   *
   * @param handle - Body handle
   *
   * @example
   * ```typescript
   * backend.wakeBody(bodyHandle);
   * ```
   */
  abstract wakeBody(handle: PhysicsBodyHandle): void;

  /**
   * Puts a rigid body to sleep.
   *
   * @param handle - Body handle
   *
   * @example
   * ```typescript
   * backend.sleepBody(bodyHandle);
   * ```
   */
  abstract sleepBody(handle: PhysicsBodyHandle): void;

  /**
   * Gets debug information about the physics world.
   *
   * @returns Debug statistics
   *
   * @example
   * ```typescript
   * const stats = backend.getDebugInfo();
   * console.log('Active bodies:', stats.activeBodies);
   * console.log('Contacts:', stats.contacts);
   * ```
   */
  abstract getDebugInfo(): {
    bodyCount: number;
    activeBodies: number;
    sleepingBodies: number;
    constraintCount: number;
    contacts: number;
    islands: number;
  };
}
