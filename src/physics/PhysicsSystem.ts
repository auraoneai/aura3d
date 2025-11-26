/**
 * ECS physics system integrating physics simulation with entities.
 *
 * @module Physics/PhysicsSystem
 */

import { System, SystemContext, SystemPriorities, QueryDescriptor } from '../ecs/System';
import { IComponent, ComponentType } from '../ecs/Component';
import { PhysicsWorld } from './PhysicsWorld';
import { RigidBody } from './RigidBody';
import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';

/**
 * Transform component interface (assumed to exist in ECS).
 */
interface Transform {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

/**
 * RigidBody component for ECS entities.
 */
export class RigidBodyComponent implements IComponent {
  body: RigidBody;

  constructor(body?: RigidBody) {
    this.body = body ?? new RigidBody();
  }

  onAttach(entity: number): void {
    // Initialize if needed
  }

  onDetach(entity: number): void {
    // Cleanup if needed
  }
}

/**
 * Physics system for ECS integration.
 *
 * Manages physics simulation and syncs with entity transforms.
 *
 * @example
 * ```typescript
 * const physicsSystem = new PhysicsSystem({
 *   gravity: new Vector3(0, -9.81, 0)
 * });
 *
 * world.addSystem(physicsSystem);
 * ```
 */
export class PhysicsSystem extends System {
  readonly query: QueryDescriptor;
  physicsWorld: PhysicsWorld;

  /**
   * Creates a new physics system.
   */
  constructor(options: {
    gravity?: Vector3;
    fixedTimestep?: number;
  } = {}) {
    super({
      name: 'PhysicsSystem',
      priority: SystemPriorities.PHYSICS
    });

    this.physicsWorld = new PhysicsWorld({
      gravity: options.gravity,
      fixedTimestep: options.fixedTimestep
    });

    // Query for entities with RigidBody and Transform
    this.query = [RigidBodyComponent as any];
  }

  /**
   * Initialize system.
   */
  override onInit(): void {
    // Setup collision event listeners
    this.physicsWorld.addEventListener('collisionenter', (event) => {
      // Handle collision events
    });
  }

  /**
   * Fixed update for deterministic physics.
   */
  override fixedUpdate(context: SystemContext): void {
    // Step physics simulation
    this.physicsWorld.step(context.fixedDeltaTime);

    // Sync physics to transforms
    const query = this.getQuery();
    query.forEach((entity, components) => {
      const [rigidBodyComp, transform] = components as [RigidBodyComponent, Transform];
      
      if (rigidBodyComp && rigidBodyComp.body) {
        const body = rigidBodyComp.body;

        // Sync physics to transform
        if (transform) {
          transform.position.copy(body.position);
          transform.rotation.copy(body.rotation);
        }
      }
    });
  }

  /**
   * Update is not used (physics runs in fixedUpdate).
   */
  update(context: SystemContext): void {
    // Physics logic is in fixedUpdate
  }

  /**
   * Cleanup on destroy.
   */
  override onDestroy(): void {
    this.physicsWorld.clear();
  }

  /**
   * Adds a rigid body to the physics world.
   */
  addRigidBody(body: RigidBody): void {
    this.physicsWorld.addRigidBody(body);
  }

  /**
   * Removes a rigid body from the physics world.
   */
  removeRigidBody(body: RigidBody): void {
    this.physicsWorld.removeRigidBody(body);
  }

  /**
   * Sets gravity.
   */
  setGravity(gravity: Vector3): void {
    this.physicsWorld.gravity = gravity;
  }

  /**
   * Gets the physics world.
   */
  getWorld(): PhysicsWorld {
    return this.physicsWorld;
  }
}
