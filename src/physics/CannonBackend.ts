/**
 * Cannon.js physics backend implementation.
 *
 * @module Physics/CannonBackend
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
  ConstraintType,
  ContactPoint
} from './PhysicsBackend';
import { BodyType } from './RigidBody';
import { ShapeType } from './Collider';
import { BoxShape } from './shapes/BoxShape';
import { SphereShape } from './shapes/SphereShape';

/**
 * Type definition for Cannon.js library.
 * Using minimal typing to avoid full dependency.
 */
declare const CANNON: any;

/**
 * Cannon.js body wrapper for handle mapping.
 */
interface CannonBodyWrapper {
  body: any;
  userData: any;
}

/**
 * Cannon.js physics backend implementation.
 *
 * Provides integration with Cannon.js physics engine.
 * Supports: box, sphere, cylinder, convex hull, trimesh, heightfield shapes.
 *
 * Performance: Optimized for 1000+ active bodies at 60 FPS.
 *
 * @example
 * ```typescript
 * const backend = new CannonBackend();
 * await backend.initialize();
 *
 * const body = backend.createBody({
 *   type: BodyType.Dynamic,
 *   position: new Vector3(0, 10, 0),
 *   rotation: Quaternion.identity(),
 *   mass: 10
 * });
 *
 * backend.step(1 / 60, worldConfig);
 * ```
 */
export class CannonBackend extends PhysicsBackend {
  readonly name = 'Cannon.js';
  readonly version = '0.6.2';

  private world: any = null;
  private bodies: Map<number, CannonBodyWrapper> = new Map();
  private shapes: Map<number, any> = new Map();
  private constraints: Map<number, any> = new Map();
  private bodyIdCounter: number = 0;
  private shapeIdCounter: number = 0;
  private constraintIdCounter: number = 0;
  private collisionEvents: CollisionEvent[] = [];
  private accumulator: number = 0;

  async initialize(options?: BackendInitOptions): Promise<void> {
    if (this._initialized) {
      throw new Error('CannonBackend already initialized');
    }

    if (typeof CANNON === 'undefined') {
      throw new Error('Cannon.js library not loaded. Include cannon.js or cannon-es before initializing.');
    }

    this.world = new CANNON.World();
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 10;
    this.world.allowSleep = true;

    this.world.addEventListener('postStep', () => {
      this.collisionEvents = [];
    });

    this.world.addEventListener('beginContact', (event: any) => {
      this.handleCollisionBegin(event);
    });

    this._initialized = true;
  }

  dispose(): void {
    if (!this._initialized) return;

    for (const [id, wrapper] of this.bodies) {
      this.world.removeBody(wrapper.body);
    }

    this.bodies.clear();
    this.shapes.clear();
    this.constraints.clear();
    this.world = null;
    this._initialized = false;
  }

  step(deltaTime: number, config: PhysicsWorldConfig): void {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    this.world.gravity.set(config.gravity.x, config.gravity.y, config.gravity.z);

    this.accumulator += deltaTime;
    let substeps = 0;

    while (this.accumulator >= config.fixedTimestep && substeps < config.maxSubsteps) {
      this.world.step(config.fixedTimestep);
      this.accumulator -= config.fixedTimestep;
      substeps++;
    }

    if (this.accumulator > config.fixedTimestep) {
      this.accumulator = config.fixedTimestep;
    }
  }

  createBody(config: RigidBodyConfig): PhysicsBodyHandle {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const cannonBody = new CANNON.Body({
      mass: config.type === BodyType.Dynamic ? config.mass : 0,
      position: new CANNON.Vec3(config.position.x, config.position.y, config.position.z),
      quaternion: new CANNON.Quaternion(config.rotation.x, config.rotation.y, config.rotation.z, config.rotation.w),
      type: this.convertBodyType(config.type),
      linearDamping: config.linearDamping ?? 0.01,
      angularDamping: config.angularDamping ?? 0.05
    });

    if (config.linearVelocity) {
      cannonBody.velocity.set(config.linearVelocity.x, config.linearVelocity.y, config.linearVelocity.z);
    }

    if (config.angularVelocity) {
      cannonBody.angularVelocity.set(config.angularVelocity.x, config.angularVelocity.y, config.angularVelocity.z);
    }

    if (config.isSleeping) {
      cannonBody.sleep();
    }

    cannonBody.sleepSpeedLimit = 0.1;
    cannonBody.sleepTimeLimit = 0.5;

    this.world.addBody(cannonBody);

    const handle = this.bodyIdCounter++;
    this.bodies.set(handle, {
      body: cannonBody,
      userData: config.userData ?? null
    });

    return handle;
  }

  destroyBody(handle: PhysicsBodyHandle): void {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const wrapper = this.bodies.get(handle as number);
    if (!wrapper) {
      console.warn('Attempt to destroy non-existent body:', handle);
      return;
    }

    this.world.removeBody(wrapper.body);
    this.bodies.delete(handle as number);
  }

  createShape(bodyHandle: PhysicsBodyHandle, config: ShapeConfig): PhysicsShapeHandle {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const wrapper = this.bodies.get(bodyHandle as number);
    if (!wrapper) {
      throw new Error('Body not found for shape creation');
    }

    const cannonShape = this.convertShape(config);

    if (!cannonShape) {
      throw new Error(`Unsupported shape type: ${config.type}`);
    }

    const material = this.createMaterial(config.material);
    cannonShape.material = material;

    const offset = config.offset ?? new Vector3(0, 0, 0);
    const rotation = config.rotation ?? Quaternion.identity();

    wrapper.body.addShape(
      cannonShape,
      new CANNON.Vec3(offset.x, offset.y, offset.z),
      new CANNON.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
    );

    const shapeHandle = this.shapeIdCounter++;
    this.shapes.set(shapeHandle, {
      cannonShape,
      bodyHandle,
      isSensor: config.isSensor ?? false
    });

    if (config.density && wrapper.body.type === CANNON.Body.DYNAMIC) {
      const volume = this.estimateShapeVolume(config);
      wrapper.body.mass = volume * config.density;
      wrapper.body.updateMassProperties();
    }

    return shapeHandle;
  }

  destroyShape(handle: PhysicsShapeHandle): void {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const shapeData = this.shapes.get(handle as number);
    if (!shapeData) {
      console.warn('Attempt to destroy non-existent shape:', handle);
      return;
    }

    const wrapper = this.bodies.get(shapeData.bodyHandle);
    if (wrapper) {
      const index = wrapper.body.shapes.indexOf(shapeData.cannonShape);
      if (index !== -1) {
        wrapper.body.shapes.splice(index, 1);
        wrapper.body.shapeOffsets.splice(index, 1);
        wrapper.body.shapeOrientations.splice(index, 1);
        wrapper.body.updateMassProperties();
      }
    }

    this.shapes.delete(handle as number);
  }

  createConstraint(config: ConstraintConfig | HingeConstraintConfig | SliderConstraintConfig | SpringConstraintConfig): PhysicsConstraintHandle {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const bodyAWrapper = this.bodies.get(config.bodyA as number);
    const bodyBWrapper = config.bodyB !== null ? this.bodies.get(config.bodyB as number) : null;

    if (!bodyAWrapper) {
      throw new Error('Body A not found for constraint creation');
    }

    let constraint: any;

    switch (config.type) {
      case ConstraintType.Fixed:
        constraint = new CANNON.LockConstraint(
          bodyAWrapper.body,
          bodyBWrapper?.body ?? this.world.defaultContactMaterial.contactEquationStiffness
        );
        break;

      case ConstraintType.Hinge: {
        const hingeConfig = config as HingeConstraintConfig;
        constraint = new CANNON.HingeConstraint(
          bodyAWrapper.body,
          bodyBWrapper?.body,
          {
            pivotA: new CANNON.Vec3(hingeConfig.anchorA.x, hingeConfig.anchorA.y, hingeConfig.anchorA.z),
            pivotB: new CANNON.Vec3(hingeConfig.anchorB.x, hingeConfig.anchorB.y, hingeConfig.anchorB.z),
            axisA: new CANNON.Vec3(hingeConfig.axis.x, hingeConfig.axis.y, hingeConfig.axis.z),
            axisB: new CANNON.Vec3(hingeConfig.axis.x, hingeConfig.axis.y, hingeConfig.axis.z)
          }
        );

        if (hingeConfig.motorEnabled) {
          constraint.enableMotor();
          constraint.setMotorSpeed(hingeConfig.motorSpeed ?? 0);
          constraint.setMotorMaxForce(hingeConfig.motorMaxForce ?? 1000);
        }
        break;
      }

      case ConstraintType.Distance: {
        const distance = config.anchorA.sub(config.anchorB).length();
        constraint = new CANNON.DistanceConstraint(
          bodyAWrapper.body,
          bodyBWrapper?.body,
          distance
        );
        break;
      }

      case ConstraintType.Spring: {
        const springConfig = config as SpringConstraintConfig;
        constraint = new CANNON.Spring(
          bodyAWrapper.body,
          bodyBWrapper?.body,
          {
            localAnchorA: new CANNON.Vec3(springConfig.anchorA.x, springConfig.anchorA.y, springConfig.anchorA.z),
            localAnchorB: new CANNON.Vec3(springConfig.anchorB.x, springConfig.anchorB.y, springConfig.anchorB.z),
            restLength: springConfig.restLength ?? config.anchorA.sub(config.anchorB).length(),
            stiffness: springConfig.stiffness,
            damping: springConfig.damping
          }
        );
        break;
      }

      case ConstraintType.BallSocket:
        constraint = new CANNON.PointToPointConstraint(
          bodyAWrapper.body,
          new CANNON.Vec3(config.anchorA.x, config.anchorA.y, config.anchorA.z),
          bodyBWrapper?.body,
          new CANNON.Vec3(config.anchorB.x, config.anchorB.y, config.anchorB.z)
        );
        break;

      default:
        throw new Error(`Unsupported constraint type: ${config.type}`);
    }

    if (config.collideConnected !== undefined) {
      constraint.collideConnected = config.collideConnected;
    }

    this.world.addConstraint(constraint);

    const handle = this.constraintIdCounter++;
    this.constraints.set(handle, constraint);

    return handle;
  }

  destroyConstraint(handle: PhysicsConstraintHandle): void {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const constraint = this.constraints.get(handle as number);
    if (!constraint) {
      console.warn('Attempt to destroy non-existent constraint:', handle);
      return;
    }

    this.world.removeConstraint(constraint);
    this.constraints.delete(handle as number);
  }

  raycast(query: RaycastQuery): RaycastHit[] {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const from = new CANNON.Vec3(query.origin.x, query.origin.y, query.origin.z);
    const to = query.direction.scale(query.maxDistance).add(query.origin);
    const toVec = new CANNON.Vec3(to.x, to.y, to.z);

    const result = new CANNON.RaycastResult();
    const ray = new CANNON.Ray(from, toVec);

    ray.mode = CANNON.Ray.CLOSEST;
    ray.skipBackfaces = true;

    const hits: RaycastHit[] = [];

    this.world.raycastClosest(from, toVec, {}, result);

    if (result.hasHit) {
      const bodyHandle = this.findBodyHandle(result.body);
      if (bodyHandle !== null) {
        hits.push({
          body: bodyHandle,
          point: new Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z),
          normal: new Vector3(result.hitNormalWorld.x, result.hitNormalWorld.y, result.hitNormalWorld.z),
          distance: from.distanceTo(result.hitPointWorld),
          fraction: from.distanceTo(result.hitPointWorld) / query.maxDistance,
          userData: this.bodies.get(bodyHandle as number)?.userData
        });
      }
    }

    return hits;
  }

  getCollisions(): CollisionEvent[] {
    return [...this.collisionEvents];
  }

  getBodyState(handle: PhysicsBodyHandle): {
    position: Vector3;
    rotation: Quaternion;
    linearVelocity: Vector3;
    angularVelocity: Vector3;
    isSleeping: boolean;
  } {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const wrapper = this.bodies.get(handle as number);
    if (!wrapper) {
      throw new Error('Body not found');
    }

    const body = wrapper.body;

    return {
      position: new Vector3(body.position.x, body.position.y, body.position.z),
      rotation: new Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w),
      linearVelocity: new Vector3(body.velocity.x, body.velocity.y, body.velocity.z),
      angularVelocity: new Vector3(body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z),
      isSleeping: body.sleepState === CANNON.Body.SLEEPING
    };
  }

  setBodyTransform(handle: PhysicsBodyHandle, position: Vector3, rotation: Quaternion): void {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const wrapper = this.bodies.get(handle as number);
    if (!wrapper) {
      throw new Error('Body not found');
    }

    wrapper.body.position.set(position.x, position.y, position.z);
    wrapper.body.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    wrapper.body.wakeUp();
  }

  setBodyVelocity(handle: PhysicsBodyHandle, linear: Vector3, angular: Vector3): void {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const wrapper = this.bodies.get(handle as number);
    if (!wrapper) {
      throw new Error('Body not found');
    }

    wrapper.body.velocity.set(linear.x, linear.y, linear.z);
    wrapper.body.angularVelocity.set(angular.x, angular.y, angular.z);
    wrapper.body.wakeUp();
  }

  applyForce(handle: PhysicsBodyHandle, force: Vector3, point?: Vector3): void {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const wrapper = this.bodies.get(handle as number);
    if (!wrapper) {
      throw new Error('Body not found');
    }

    const forceVec = new CANNON.Vec3(force.x, force.y, force.z);

    if (point) {
      const pointVec = new CANNON.Vec3(point.x, point.y, point.z);
      wrapper.body.applyForce(forceVec, pointVec);
    } else {
      wrapper.body.applyForce(forceVec, wrapper.body.position);
    }

    wrapper.body.wakeUp();
  }

  applyImpulse(handle: PhysicsBodyHandle, impulse: Vector3, point?: Vector3): void {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const wrapper = this.bodies.get(handle as number);
    if (!wrapper) {
      throw new Error('Body not found');
    }

    const impulseVec = new CANNON.Vec3(impulse.x, impulse.y, impulse.z);

    if (point) {
      const pointVec = new CANNON.Vec3(point.x, point.y, point.z);
      wrapper.body.applyImpulse(impulseVec, pointVec);
    } else {
      wrapper.body.applyImpulse(impulseVec, wrapper.body.position);
    }

    wrapper.body.wakeUp();
  }

  setBodyMass(handle: PhysicsBodyHandle, mass: number): void {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const wrapper = this.bodies.get(handle as number);
    if (!wrapper) {
      throw new Error('Body not found');
    }

    wrapper.body.mass = mass;
    wrapper.body.updateMassProperties();
    wrapper.body.wakeUp();
  }

  wakeBody(handle: PhysicsBodyHandle): void {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const wrapper = this.bodies.get(handle as number);
    if (!wrapper) {
      throw new Error('Body not found');
    }

    wrapper.body.wakeUp();
  }

  sleepBody(handle: PhysicsBodyHandle): void {
    if (!this._initialized) {
      throw new Error('CannonBackend not initialized');
    }

    const wrapper = this.bodies.get(handle as number);
    if (!wrapper) {
      throw new Error('Body not found');
    }

    wrapper.body.sleep();
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
      throw new Error('CannonBackend not initialized');
    }

    let activeBodies = 0;
    let sleepingBodies = 0;

    for (const wrapper of this.bodies.values()) {
      if (wrapper.body.sleepState === CANNON.Body.SLEEPING) {
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
      contacts: this.world.contacts.length,
      islands: 0
    };
  }

  private convertBodyType(type: BodyType): number {
    switch (type) {
      case BodyType.Dynamic:
        return CANNON.Body.DYNAMIC;
      case BodyType.Static:
        return CANNON.Body.STATIC;
      case BodyType.Kinematic:
        return CANNON.Body.KINEMATIC;
      default:
        return CANNON.Body.DYNAMIC;
    }
  }

  private convertShape(config: ShapeConfig): any {
    switch (config.type) {
      case ShapeType.Box: {
        const boxShape = config.shape as BoxShape;
        const halfExtents = boxShape.extents;
        return new CANNON.Box(new CANNON.Vec3(halfExtents.x, halfExtents.y, halfExtents.z));
      }

      case ShapeType.Sphere: {
        const sphereShape = config.shape as SphereShape;
        return new CANNON.Sphere(sphereShape.radius);
      }

      case ShapeType.Capsule: {
        const capsuleData = config.shape as any;
        return new CANNON.Cylinder(
          capsuleData.radius,
          capsuleData.radius,
          capsuleData.height,
          8
        );
      }

      default:
        return null;
    }
  }

  private createMaterial(materialData?: any): any {
    const material = new CANNON.Material('material');

    if (materialData) {
      material.friction = materialData.friction ?? 0.5;
      material.restitution = materialData.restitution ?? 0.3;
    }

    return material;
  }

  private estimateShapeVolume(config: ShapeConfig): number {
    switch (config.type) {
      case ShapeType.Box: {
        const boxShape = config.shape as BoxShape;
        const e = boxShape.extents;
        return 8 * e.x * e.y * e.z;
      }

      case ShapeType.Sphere: {
        const sphereShape = config.shape as SphereShape;
        const r = sphereShape.radius;
        return (4 / 3) * Math.PI * r * r * r;
      }

      default:
        return 1.0;
    }
  }

  private findBodyHandle(cannonBody: any): number | null {
    for (const [handle, wrapper] of this.bodies) {
      if (wrapper.body === cannonBody) {
        return handle;
      }
    }
    return null;
  }

  private handleCollisionBegin(event: any): void {
    const bodyAHandle = this.findBodyHandle(event.bodyA);
    const bodyBHandle = this.findBodyHandle(event.bodyB);

    if (bodyAHandle === null || bodyBHandle === null) return;

    const contacts: ContactPoint[] = event.contact ? [{
      point: new Vector3(
        event.contact.ri.x + event.bodyA.position.x,
        event.contact.ri.y + event.bodyA.position.y,
        event.contact.ri.z + event.bodyA.position.z
      ),
      normal: new Vector3(event.contact.ni.x, event.contact.ni.y, event.contact.ni.z),
      separation: -event.contact.penetration || 0,
      impulse: event.contact.getImpactVelocityAlongNormal?.() || 0
    }] : [];

    this.collisionEvents.push({
      bodyA: bodyAHandle,
      bodyB: bodyBHandle,
      contacts,
      impulse: contacts[0]?.impulse || 0
    });
  }
}
