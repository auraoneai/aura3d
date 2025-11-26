/**
 * Mock physics backend for testing and development.
 *
 * @module Physics/MockPhysicsWorld
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import {
  PhysicsBackend,
  PhysicsBodyHandle,
  PhysicsShapeHandle,
  PhysicsConstraintHandle,
  RigidBodyConfig,
  ShapeConfig,
  ConstraintConfig,
  HingeConstraintConfig,
  SliderConstraintConfig,
  SpringConstraintConfig,
  RaycastQuery,
  RaycastHit,
  CollisionEvent,
  PhysicsWorldConfig,
  BackendInitOptions,
  ContactPoint
} from './PhysicsBackend';
import { BodyType } from './RigidBody';

/**
 * Mock body state for testing.
 */
interface MockBodyState {
  position: Vector3;
  rotation: Quaternion;
  linearVelocity: Vector3;
  angularVelocity: Vector3;
  mass: number;
  isSleeping: boolean;
  userData: any;
  type: BodyType;
  shapes: Set<number>;
}

/**
 * Mock shape data for testing.
 */
interface MockShapeData {
  config: ShapeConfig;
  bodyHandle: number;
}

/**
 * Mock constraint data for testing.
 */
interface MockConstraintData {
  config: ConstraintConfig | HingeConstraintConfig | SliderConstraintConfig | SpringConstraintConfig;
}

/**
 * Configurable mock results for testing.
 */
export interface MockPhysicsConfig {
  raycastResults?: RaycastHit[];
  collisionEvents?: CollisionEvent[];
  simulateGravity?: boolean;
  simulateDamping?: boolean;
  trackStateCalls?: boolean;
}

/**
 * Mock physics backend for unit testing and development.
 *
 * Provides configurable behavior for testing physics integration
 * without requiring real physics engine dependencies.
 *
 * Features:
 * - Configurable raycast results
 * - Triggerable collision events
 * - Optional basic gravity simulation
 * - State tracking for verification
 * - No external dependencies
 *
 * @example
 * ```typescript
 * const mock = new MockPhysicsWorld({
 *   raycastResults: [{
 *     body: 1,
 *     point: new Vector3(0, 0, 0),
 *     normal: new Vector3(0, 1, 0),
 *     distance: 10,
 *     fraction: 0.5
 *   }],
 *   simulateGravity: true
 * });
 *
 * await mock.initialize();
 *
 * const body = mock.createBody({
 *   type: BodyType.Dynamic,
 *   position: new Vector3(0, 10, 0),
 *   rotation: Quaternion.identity(),
 *   mass: 10
 * });
 *
 * mock.step(1 / 60, worldConfig);
 *
 * const hits = mock.raycast({
 *   origin: new Vector3(0, 10, 0),
 *   direction: new Vector3(0, -1, 0),
 *   maxDistance: 20
 * });
 *
 * expect(hits.length).toBe(1);
 * ```
 */
export class MockPhysicsWorld extends PhysicsBackend {
  readonly name = 'Mock';
  readonly version = '1.0.0';

  private config: MockPhysicsConfig;
  private bodies: Map<number, MockBodyState> = new Map();
  private shapes: Map<number, MockShapeData> = new Map();
  private constraints: Map<number, MockConstraintData> = new Map();
  private bodyIdCounter: number = 0;
  private shapeIdCounter: number = 0;
  private constraintIdCounter: number = 0;
  private currentGravity: Vector3 = new Vector3(0, -9.81, 0);
  private currentTimestep: number = 0;
  private totalTime: number = 0;
  private stepCount: number = 0;

  public stateCalls: {
    method: string;
    args: any[];
    timestamp: number;
  }[] = [];

  /**
   * Creates a new mock physics backend.
   *
   * @param config - Mock configuration options
   */
  constructor(config: MockPhysicsConfig = {}) {
    super();
    this.config = {
      raycastResults: [],
      collisionEvents: [],
      simulateGravity: false,
      simulateDamping: false,
      trackStateCalls: false,
      ...config
    };
  }

  async initialize(options?: BackendInitOptions): Promise<void> {
    if (this._initialized) {
      throw new Error('MockPhysicsWorld already initialized');
    }

    this.trackCall('initialize', [options]);
    this._initialized = true;
  }

  dispose(): void {
    if (!this._initialized) return;

    this.trackCall('dispose', []);

    this.bodies.clear();
    this.shapes.clear();
    this.constraints.clear();
    this.stateCalls = [];
    this._initialized = false;
  }

  step(deltaTime: number, config: PhysicsWorldConfig): void {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('step', [deltaTime, config]);

    this.currentGravity = config.gravity.clone();
    this.currentTimestep = config.fixedTimestep;
    this.totalTime += deltaTime;
    this.stepCount++;

    if (this.config.simulateGravity) {
      this.simulateGravity(deltaTime, config);
    }

    if (this.config.simulateDamping) {
      this.simulateDamping(deltaTime);
    }
  }

  createBody(config: RigidBodyConfig): PhysicsBodyHandle {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('createBody', [config]);

    const handle = this.bodyIdCounter++;

    this.bodies.set(handle, {
      position: config.position.clone(),
      rotation: config.rotation.clone(),
      linearVelocity: config.linearVelocity?.clone() ?? Vector3.zero(),
      angularVelocity: config.angularVelocity?.clone() ?? Vector3.zero(),
      mass: config.mass,
      isSleeping: config.isSleeping ?? false,
      userData: config.userData,
      type: config.type,
      shapes: new Set()
    });

    return handle;
  }

  destroyBody(handle: PhysicsBodyHandle): void {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('destroyBody', [handle]);

    const state = this.bodies.get(handle as number);
    if (!state) {
      console.warn('Attempt to destroy non-existent body:', handle);
      return;
    }

    for (const shapeId of state.shapes) {
      this.shapes.delete(shapeId);
    }

    this.bodies.delete(handle as number);
  }

  createShape(bodyHandle: PhysicsBodyHandle, config: ShapeConfig): PhysicsShapeHandle {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('createShape', [bodyHandle, config]);

    const state = this.bodies.get(bodyHandle as number);
    if (!state) {
      throw new Error('Body not found for shape creation');
    }

    const shapeHandle = this.shapeIdCounter++;

    this.shapes.set(shapeHandle, {
      config,
      bodyHandle: bodyHandle as number
    });

    state.shapes.add(shapeHandle);

    return shapeHandle;
  }

  destroyShape(handle: PhysicsShapeHandle): void {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('destroyShape', [handle]);

    const shapeData = this.shapes.get(handle as number);
    if (!shapeData) {
      console.warn('Attempt to destroy non-existent shape:', handle);
      return;
    }

    const state = this.bodies.get(shapeData.bodyHandle);
    if (state) {
      state.shapes.delete(handle as number);
    }

    this.shapes.delete(handle as number);
  }

  createConstraint(config: ConstraintConfig | HingeConstraintConfig | SliderConstraintConfig | SpringConstraintConfig): PhysicsConstraintHandle {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('createConstraint', [config]);

    const handle = this.constraintIdCounter++;

    this.constraints.set(handle, {
      config
    });

    return handle;
  }

  destroyConstraint(handle: PhysicsConstraintHandle): void {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('destroyConstraint', [handle]);

    if (!this.constraints.has(handle as number)) {
      console.warn('Attempt to destroy non-existent constraint:', handle);
      return;
    }

    this.constraints.delete(handle as number);
  }

  raycast(query: RaycastQuery): RaycastHit[] {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('raycast', [query]);

    return this.config.raycastResults ?? [];
  }

  getCollisions(): CollisionEvent[] {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('getCollisions', []);

    return this.config.collisionEvents ?? [];
  }

  getBodyState(handle: PhysicsBodyHandle): {
    position: Vector3;
    rotation: Quaternion;
    linearVelocity: Vector3;
    angularVelocity: Vector3;
    isSleeping: boolean;
  } {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('getBodyState', [handle]);

    const state = this.bodies.get(handle as number);
    if (!state) {
      throw new Error('Body not found');
    }

    return {
      position: state.position.clone(),
      rotation: state.rotation.clone(),
      linearVelocity: state.linearVelocity.clone(),
      angularVelocity: state.angularVelocity.clone(),
      isSleeping: state.isSleeping
    };
  }

  setBodyTransform(handle: PhysicsBodyHandle, position: Vector3, rotation: Quaternion): void {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('setBodyTransform', [handle, position, rotation]);

    const state = this.bodies.get(handle as number);
    if (!state) {
      throw new Error('Body not found');
    }

    state.position = position.clone();
    state.rotation = rotation.clone();
    state.isSleeping = false;
  }

  setBodyVelocity(handle: PhysicsBodyHandle, linear: Vector3, angular: Vector3): void {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('setBodyVelocity', [handle, linear, angular]);

    const state = this.bodies.get(handle as number);
    if (!state) {
      throw new Error('Body not found');
    }

    state.linearVelocity = linear.clone();
    state.angularVelocity = angular.clone();
    state.isSleeping = false;
  }

  applyForce(handle: PhysicsBodyHandle, force: Vector3, point?: Vector3): void {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('applyForce', [handle, force, point]);

    const state = this.bodies.get(handle as number);
    if (!state) {
      throw new Error('Body not found');
    }

    if (state.type === BodyType.Dynamic) {
      const acceleration = force.scale(1 / state.mass);
      state.linearVelocity.addInPlace(acceleration.scale(this.currentTimestep));
      state.isSleeping = false;
    }
  }

  applyImpulse(handle: PhysicsBodyHandle, impulse: Vector3, point?: Vector3): void {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('applyImpulse', [handle, impulse, point]);

    const state = this.bodies.get(handle as number);
    if (!state) {
      throw new Error('Body not found');
    }

    if (state.type === BodyType.Dynamic) {
      const deltaV = impulse.scale(1 / state.mass);
      state.linearVelocity.addInPlace(deltaV);
      state.isSleeping = false;
    }
  }

  setBodyMass(handle: PhysicsBodyHandle, mass: number): void {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('setBodyMass', [handle, mass]);

    const state = this.bodies.get(handle as number);
    if (!state) {
      throw new Error('Body not found');
    }

    state.mass = mass;
    state.isSleeping = false;
  }

  wakeBody(handle: PhysicsBodyHandle): void {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('wakeBody', [handle]);

    const state = this.bodies.get(handle as number);
    if (!state) {
      throw new Error('Body not found');
    }

    state.isSleeping = false;
  }

  sleepBody(handle: PhysicsBodyHandle): void {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('sleepBody', [handle]);

    const state = this.bodies.get(handle as number);
    if (!state) {
      throw new Error('Body not found');
    }

    state.isSleeping = true;
    state.linearVelocity.set(0, 0, 0);
    state.angularVelocity.set(0, 0, 0);
  }

  getDebugInfo(): {
    bodyCount: number;
    activeBodies: number;
    sleepingBodies: number;
    constraintCount: number;
    contacts: number;
    islands: number;
  } {
    if (!this._initialized) {
      throw new Error('MockPhysicsWorld not initialized');
    }

    this.trackCall('getDebugInfo', []);

    let activeBodies = 0;
    let sleepingBodies = 0;

    for (const state of this.bodies.values()) {
      if (state.isSleeping) {
        sleepingBodies++;
      } else {
        activeBodies++;
      }
    }

    return {
      bodyCount: this.bodies.size,
      activeBodies,
      sleepingBodies,
      constraintCount: this.constraints.size,
      contacts: this.config.collisionEvents?.length ?? 0,
      islands: 0
    };
  }

  /**
   * Sets the mock raycast results for testing.
   *
   * @param results - Array of raycast hits to return
   *
   * @example
   * ```typescript
   * mock.setRaycastResults([{
   *   body: 1,
   *   point: new Vector3(0, 0, 0),
   *   normal: new Vector3(0, 1, 0),
   *   distance: 10,
   *   fraction: 0.5
   * }]);
   * ```
   */
  setRaycastResults(results: RaycastHit[]): void {
    this.config.raycastResults = results;
  }

  /**
   * Sets the mock collision events for testing.
   *
   * @param events - Array of collision events to return
   *
   * @example
   * ```typescript
   * mock.setCollisionEvents([{
   *   bodyA: 1,
   *   bodyB: 2,
   *   contacts: [{
   *     point: new Vector3(0, 0, 0),
   *     normal: new Vector3(0, 1, 0),
   *     separation: -0.1,
   *     impulse: 10
   *   }],
   *   impulse: 10
   * }]);
   * ```
   */
  setCollisionEvents(events: CollisionEvent[]): void {
    this.config.collisionEvents = events;
  }

  /**
   * Triggers a collision event between two bodies.
   *
   * @param bodyA - First body handle
   * @param bodyB - Second body handle
   * @param contacts - Optional contact points
   *
   * @example
   * ```typescript
   * mock.triggerCollision(body1, body2);
   * const collisions = mock.getCollisions();
   * expect(collisions.length).toBe(1);
   * ```
   */
  triggerCollision(bodyA: PhysicsBodyHandle, bodyB: PhysicsBodyHandle, contacts: ContactPoint[] = []): void {
    if (!this.config.collisionEvents) {
      this.config.collisionEvents = [];
    }

    this.config.collisionEvents.push({
      bodyA,
      bodyB,
      contacts,
      impulse: contacts.reduce((sum, c) => sum + c.impulse, 0)
    });
  }

  /**
   * Gets all tracked state calls for verification.
   *
   * @returns Array of method calls
   *
   * @example
   * ```typescript
   * mock.createBody(config);
   * const calls = mock.getStateCalls();
   * expect(calls).toContainEqual({
   *   method: 'createBody',
   *   args: [config],
   *   timestamp: expect.any(Number)
   * });
   * ```
   */
  getStateCalls(): typeof this.stateCalls {
    return [...this.stateCalls];
  }

  /**
   * Clears all tracked state calls.
   *
   * @example
   * ```typescript
   * mock.clearStateCalls();
   * expect(mock.getStateCalls()).toHaveLength(0);
   * ```
   */
  clearStateCalls(): void {
    this.stateCalls = [];
  }

  /**
   * Gets the current simulation time.
   *
   * @returns Total simulation time in seconds
   */
  getTotalTime(): number {
    return this.totalTime;
  }

  /**
   * Gets the number of simulation steps executed.
   *
   * @returns Step count
   */
  getStepCount(): number {
    return this.stepCount;
  }

  /**
   * Gets all body handles.
   *
   * @returns Array of body handles
   */
  getBodyHandles(): PhysicsBodyHandle[] {
    return Array.from(this.bodies.keys());
  }

  /**
   * Gets all shape handles.
   *
   * @returns Array of shape handles
   */
  getShapeHandles(): PhysicsShapeHandle[] {
    return Array.from(this.shapes.keys());
  }

  /**
   * Gets all constraint handles.
   *
   * @returns Array of constraint handles
   */
  getConstraintHandles(): PhysicsConstraintHandle[] {
    return Array.from(this.constraints.keys());
  }

  /**
   * Resets the mock to initial state.
   *
   * @example
   * ```typescript
   * mock.reset();
   * expect(mock.getBodyHandles()).toHaveLength(0);
   * ```
   */
  reset(): void {
    this.bodies.clear();
    this.shapes.clear();
    this.constraints.clear();
    this.stateCalls = [];
    this.bodyIdCounter = 0;
    this.shapeIdCounter = 0;
    this.constraintIdCounter = 0;
    this.totalTime = 0;
    this.stepCount = 0;
    this.config.raycastResults = [];
    this.config.collisionEvents = [];
  }

  private trackCall(method: string, args: any[]): void {
    if (this.config.trackStateCalls) {
      this.stateCalls.push({
        method,
        args,
        timestamp: Date.now()
      });
    }
  }

  private simulateGravity(deltaTime: number, config: PhysicsWorldConfig): void {
    for (const state of this.bodies.values()) {
      if (state.type === BodyType.Dynamic && !state.isSleeping) {
        const gravityAccel = this.currentGravity.scale(deltaTime);
        state.linearVelocity.addInPlace(gravityAccel);
        state.position.addInPlace(state.linearVelocity.scale(deltaTime));
      }
    }
  }

  private simulateDamping(deltaTime: number): void {
    for (const state of this.bodies.values()) {
      if (state.type === BodyType.Dynamic && !state.isSleeping) {
        const linearDampFactor = Math.pow(0.99, deltaTime);
        const angularDampFactor = Math.pow(0.95, deltaTime);

        state.linearVelocity.scaleInPlace(linearDampFactor);
        state.angularVelocity.scaleInPlace(angularDampFactor);

        const energyThreshold = 0.01;
        const energy = state.linearVelocity.lengthSquared() + state.angularVelocity.lengthSquared();

        if (energy < energyThreshold) {
          state.isSleeping = true;
          state.linearVelocity.set(0, 0, 0);
          state.angularVelocity.set(0, 0, 0);
        }
      }
    }
  }
}
