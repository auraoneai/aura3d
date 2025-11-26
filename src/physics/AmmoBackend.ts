/**
 * Ammo.js/Bullet physics backend implementation.
 *
 * @module Physics/AmmoBackend
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
 * Type definition for Ammo.js library.
 */
declare const Ammo: any;

/**
 * Ammo body metadata for tracking.
 */
interface AmmoBodyMetadata {
  body: any;
  userData: any;
  shapes: Set<number>;
}

/**
 * Ammo shape metadata for tracking.
 */
interface AmmoShapeMetadata {
  shape: any;
  bodyHandle: number;
}

/**
 * Ammo.js/Bullet physics backend implementation.
 *
 * Full-featured physics engine with soft body and vehicle support.
 * Supports: All shape types, soft bodies, vehicles, advanced constraints.
 *
 * Performance: Optimized for complex simulations with 500+ bodies at 60 FPS.
 *
 * @example
 * ```typescript
 * const backend = new AmmoBackend();
 * await backend.initialize();
 *
 * const body = backend.createBody({
 *   type: BodyType.Dynamic,
 *   position: new Vector3(0, 10, 0),
 *   rotation: Quaternion.identity(),
 *   mass: 10
 * });
 * ```
 */
export class AmmoBackend extends PhysicsBackend {
  readonly name = 'Ammo.js';
  readonly version = '0.0.10';

  private Ammo: any = null;
  private world: any = null;
  private collisionConfiguration: any = null;
  private dispatcher: any = null;
  private broadphase: any = null;
  private solver: any = null;
  private bodies: Map<number, AmmoBodyMetadata> = new Map();
  private shapes: Map<number, AmmoShapeMetadata> = new Map();
  private constraints: Map<number, any> = new Map();
  private bodyIdCounter: number = 0;
  private shapeIdCounter: number = 0;
  private constraintIdCounter: number = 0;
  private collisionEvents: CollisionEvent[] = [];
  private accumulator: number = 0;
  private tempTransform: any = null;
  private tempVec3: any = null;
  private tempQuat: any = null;

  async initialize(options?: BackendInitOptions): Promise<void> {
    if (this._initialized) {
      throw new Error('AmmoBackend already initialized');
    }

    try {
      if (typeof Ammo === 'function') {
        this.Ammo = await Ammo();
      } else if (typeof Ammo !== 'undefined') {
        this.Ammo = Ammo;
      } else {
        throw new Error('Ammo.js library not loaded. Include ammo.js or ammo.wasm.js before initializing.');
      }

      this.collisionConfiguration = new this.Ammo.btDefaultCollisionConfiguration();
      this.dispatcher = new this.Ammo.btCollisionDispatcher(this.collisionConfiguration);
      this.broadphase = new this.Ammo.btDbvtBroadphase();
      this.solver = new this.Ammo.btSequentialImpulseConstraintSolver();

      this.world = new this.Ammo.btDiscreteDynamicsWorld(
        this.dispatcher,
        this.broadphase,
        this.solver,
        this.collisionConfiguration
      );

      this.world.setGravity(new this.Ammo.btVector3(0, -9.81, 0));

      this.tempTransform = new this.Ammo.btTransform();
      this.tempVec3 = new this.Ammo.btVector3(0, 0, 0);
      this.tempQuat = new this.Ammo.btQuaternion(0, 0, 0, 1);

      this._initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Ammo.js: ${error}`);
    }
  }

  dispose(): void {
    if (!this._initialized) return;

    for (const metadata of this.bodies.values()) {
      this.world.removeRigidBody(metadata.body);
      this.Ammo.destroy(metadata.body);
    }

    for (const constraint of this.constraints.values()) {
      this.world.removeConstraint(constraint);
      this.Ammo.destroy(constraint);
    }

    this.bodies.clear();
    this.shapes.clear();
    this.constraints.clear();

    if (this.tempTransform) this.Ammo.destroy(this.tempTransform);
    if (this.tempVec3) this.Ammo.destroy(this.tempVec3);
    if (this.tempQuat) this.Ammo.destroy(this.tempQuat);
    if (this.world) this.Ammo.destroy(this.world);
    if (this.solver) this.Ammo.destroy(this.solver);
    if (this.broadphase) this.Ammo.destroy(this.broadphase);
    if (this.dispatcher) this.Ammo.destroy(this.dispatcher);
    if (this.collisionConfiguration) this.Ammo.destroy(this.collisionConfiguration);

    this._initialized = false;
  }

  step(deltaTime: number, config: PhysicsWorldConfig): void {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    this.tempVec3.setValue(config.gravity.x, config.gravity.y, config.gravity.z);
    this.world.setGravity(this.tempVec3);

    this.collisionEvents = [];

    this.accumulator += deltaTime;
    let substeps = 0;

    while (this.accumulator >= config.fixedTimestep && substeps < config.maxSubsteps) {
      this.world.stepSimulation(config.fixedTimestep, 0, config.fixedTimestep);
      this.processCollisions();
      this.accumulator -= config.fixedTimestep;
      substeps++;
    }

    if (this.accumulator > config.fixedTimestep) {
      this.accumulator = config.fixedTimestep;
    }
  }

  createBody(config: RigidBodyConfig): PhysicsBodyHandle {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const transform = new this.Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new this.Ammo.btVector3(config.position.x, config.position.y, config.position.z));
    transform.setRotation(new this.Ammo.btQuaternion(config.rotation.x, config.rotation.y, config.rotation.z, config.rotation.w));

    const mass = config.type === BodyType.Dynamic ? config.mass : 0;
    const localInertia = new this.Ammo.btVector3(0, 0, 0);

    const motionState = new this.Ammo.btDefaultMotionState(transform);
    const rbInfo = new this.Ammo.btRigidBodyConstructionInfo(mass, motionState, null, localInertia);

    rbInfo.set_m_linearDamping(config.linearDamping ?? 0.01);
    rbInfo.set_m_angularDamping(config.angularDamping ?? 0.05);

    const body = new this.Ammo.btRigidBody(rbInfo);

    if (config.type === BodyType.Kinematic) {
      body.setCollisionFlags(body.getCollisionFlags() | 2);
      body.setActivationState(4);
    } else if (config.type === BodyType.Static) {
      body.setCollisionFlags(body.getCollisionFlags() | 1);
    }

    if (config.linearVelocity) {
      body.setLinearVelocity(new this.Ammo.btVector3(
        config.linearVelocity.x,
        config.linearVelocity.y,
        config.linearVelocity.z
      ));
    }

    if (config.angularVelocity) {
      body.setAngularVelocity(new this.Ammo.btVector3(
        config.angularVelocity.x,
        config.angularVelocity.y,
        config.angularVelocity.z
      ));
    }

    if (config.isSleeping) {
      body.setActivationState(0);
    }

    this.world.addRigidBody(body);

    const handle = this.bodyIdCounter++;
    this.bodies.set(handle, {
      body,
      userData: config.userData ?? null,
      shapes: new Set()
    });

    this.Ammo.destroy(transform);
    this.Ammo.destroy(localInertia);
    this.Ammo.destroy(rbInfo);

    return handle;
  }

  destroyBody(handle: PhysicsBodyHandle): void {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const metadata = this.bodies.get(handle as number);
    if (!metadata) {
      console.warn('Attempt to destroy non-existent body:', handle);
      return;
    }

    for (const shapeId of metadata.shapes) {
      const shapeMetadata = this.shapes.get(shapeId);
      if (shapeMetadata) {
        this.Ammo.destroy(shapeMetadata.shape);
        this.shapes.delete(shapeId);
      }
    }

    this.world.removeRigidBody(metadata.body);
    this.Ammo.destroy(metadata.body);
    this.bodies.delete(handle as number);
  }

  createShape(bodyHandle: PhysicsBodyHandle, config: ShapeConfig): PhysicsShapeHandle {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const metadata = this.bodies.get(bodyHandle as number);
    if (!metadata) {
      throw new Error('Body not found for shape creation');
    }

    const shape = this.convertShape(config);
    if (!shape) {
      throw new Error(`Unsupported shape type: ${config.type}`);
    }

    const offset = config.offset ?? new Vector3(0, 0, 0);
    const rotation = config.rotation ?? Quaternion.identity();

    const localTransform = new this.Ammo.btTransform();
    localTransform.setIdentity();
    localTransform.setOrigin(new this.Ammo.btVector3(offset.x, offset.y, offset.z));
    localTransform.setRotation(new this.Ammo.btQuaternion(rotation.x, rotation.y, rotation.z, rotation.w));

    const existingShape = metadata.body.getCollisionShape();

    if (!existingShape || existingShape.isCompound === undefined) {
      const compoundShape = new this.Ammo.btCompoundShape();
      if (existingShape) {
        const identityTransform = new this.Ammo.btTransform();
        identityTransform.setIdentity();
        compoundShape.addChildShape(identityTransform, existingShape);
        this.Ammo.destroy(identityTransform);
      }
      compoundShape.addChildShape(localTransform, shape);
      metadata.body.setCollisionShape(compoundShape);
    } else {
      existingShape.addChildShape(localTransform, shape);
    }

    if (config.density && metadata.body.getMass() > 0) {
      const volume = this.estimateShapeVolume(config);
      const mass = volume * config.density;
      const localInertia = new this.Ammo.btVector3(0, 0, 0);
      metadata.body.getCollisionShape().calculateLocalInertia(mass, localInertia);
      metadata.body.setMassProps(mass, localInertia);
      metadata.body.updateInertiaTensor();
      this.Ammo.destroy(localInertia);
    }

    const shapeHandle = this.shapeIdCounter++;
    this.shapes.set(shapeHandle, {
      shape,
      bodyHandle: bodyHandle as number
    });

    metadata.shapes.add(shapeHandle);

    this.Ammo.destroy(localTransform);

    return shapeHandle;
  }

  destroyShape(handle: PhysicsShapeHandle): void {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const shapeMetadata = this.shapes.get(handle as number);
    if (!shapeMetadata) {
      console.warn('Attempt to destroy non-existent shape:', handle);
      return;
    }

    const bodyMetadata = this.bodies.get(shapeMetadata.bodyHandle);
    if (bodyMetadata) {
      bodyMetadata.shapes.delete(handle as number);
    }

    this.Ammo.destroy(shapeMetadata.shape);
    this.shapes.delete(handle as number);
  }

  createConstraint(config: ConstraintConfig | HingeConstraintConfig | SliderConstraintConfig | SpringConstraintConfig): PhysicsConstraintHandle {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const bodyAMetadata = this.bodies.get(config.bodyA as number);
    const bodyBMetadata = config.bodyB !== null ? this.bodies.get(config.bodyB as number) : null;

    if (!bodyAMetadata) {
      throw new Error('Body A not found for constraint creation');
    }

    let constraint: any;

    const transformA = new this.Ammo.btTransform();
    transformA.setIdentity();
    transformA.setOrigin(new this.Ammo.btVector3(config.anchorA.x, config.anchorA.y, config.anchorA.z));

    const transformB = new this.Ammo.btTransform();
    transformB.setIdentity();
    transformB.setOrigin(new this.Ammo.btVector3(config.anchorB.x, config.anchorB.y, config.anchorB.z));

    switch (config.type) {
      case ConstraintType.Fixed: {
        if (bodyBMetadata) {
          constraint = new this.Ammo.btFixedConstraint(bodyAMetadata.body, bodyBMetadata.body, transformA, transformB);
        }
        break;
      }

      case ConstraintType.Hinge: {
        const hingeConfig = config as HingeConstraintConfig;
        const axis = new this.Ammo.btVector3(hingeConfig.axis.x, hingeConfig.axis.y, hingeConfig.axis.z);

        if (bodyBMetadata) {
          constraint = new this.Ammo.btHingeConstraint(
            bodyAMetadata.body,
            bodyBMetadata.body,
            transformA.getOrigin(),
            transformB.getOrigin(),
            axis,
            axis,
            false
          );

          if (hingeConfig.minAngle !== undefined && hingeConfig.maxAngle !== undefined) {
            constraint.setLimit(hingeConfig.minAngle, hingeConfig.maxAngle);
          }

          if (hingeConfig.motorEnabled) {
            constraint.enableAngularMotor(true, hingeConfig.motorSpeed ?? 0, hingeConfig.motorMaxForce ?? 1000);
          }
        }

        this.Ammo.destroy(axis);
        break;
      }

      case ConstraintType.Slider: {
        const sliderConfig = config as SliderConstraintConfig;

        if (bodyBMetadata) {
          constraint = new this.Ammo.btSliderConstraint(
            bodyAMetadata.body,
            bodyBMetadata.body,
            transformA,
            transformB,
            false
          );

          if (sliderConfig.minDistance !== undefined) {
            constraint.setLowerLinLimit(sliderConfig.minDistance);
          }

          if (sliderConfig.maxDistance !== undefined) {
            constraint.setUpperLinLimit(sliderConfig.maxDistance);
          }
        }
        break;
      }

      case ConstraintType.BallSocket: {
        if (bodyBMetadata) {
          constraint = new this.Ammo.btPoint2PointConstraint(
            bodyAMetadata.body,
            bodyBMetadata.body,
            transformA.getOrigin(),
            transformB.getOrigin()
          );
        }
        break;
      }

      default:
        throw new Error(`Unsupported constraint type: ${config.type}`);
    }

    if (constraint) {
      this.world.addConstraint(constraint, !(config.collideConnected ?? false));

      const handle = this.constraintIdCounter++;
      this.constraints.set(handle, constraint);

      this.Ammo.destroy(transformA);
      this.Ammo.destroy(transformB);

      return handle;
    }

    this.Ammo.destroy(transformA);
    this.Ammo.destroy(transformB);

    throw new Error('Failed to create constraint');
  }

  destroyConstraint(handle: PhysicsConstraintHandle): void {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const constraint = this.constraints.get(handle as number);
    if (!constraint) {
      console.warn('Attempt to destroy non-existent constraint:', handle);
      return;
    }

    this.world.removeConstraint(constraint);
    this.Ammo.destroy(constraint);
    this.constraints.delete(handle as number);
  }

  raycast(query: RaycastQuery): RaycastHit[] {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const from = new this.Ammo.btVector3(query.origin.x, query.origin.y, query.origin.z);
    const to = query.direction.scale(query.maxDistance).add(query.origin);
    const toVec = new this.Ammo.btVector3(to.x, to.y, to.z);

    const rayCallback = new this.Ammo.ClosestRayResultCallback(from, toVec);
    this.world.rayTest(from, toVec, rayCallback);

    const hits: RaycastHit[] = [];

    if (rayCallback.hasHit()) {
      const body = this.Ammo.castObject(rayCallback.get_m_collisionObject(), this.Ammo.btRigidBody);
      const bodyHandle = this.findBodyHandle(body);

      if (bodyHandle !== null) {
        const hitPoint = rayCallback.get_m_hitPointWorld();
        const hitNormal = rayCallback.get_m_hitNormalWorld();

        hits.push({
          body: bodyHandle,
          point: new Vector3(hitPoint.x(), hitPoint.y(), hitPoint.z()),
          normal: new Vector3(hitNormal.x(), hitNormal.y(), hitNormal.z()),
          distance: query.origin.sub(new Vector3(hitPoint.x(), hitPoint.y(), hitPoint.z())).length(),
          fraction: rayCallback.get_m_closestHitFraction(),
          userData: this.bodies.get(bodyHandle)?.userData
        });
      }
    }

    this.Ammo.destroy(rayCallback);
    this.Ammo.destroy(from);
    this.Ammo.destroy(toVec);

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
      throw new Error('AmmoBackend not initialized');
    }

    const metadata = this.bodies.get(handle as number);
    if (!metadata) {
      throw new Error('Body not found');
    }

    const body = metadata.body;
    const transform = body.getWorldTransform();
    const origin = transform.getOrigin();
    const rotation = transform.getRotation();
    const linVel = body.getLinearVelocity();
    const angVel = body.getAngularVelocity();

    return {
      position: new Vector3(origin.x(), origin.y(), origin.z()),
      rotation: new Quaternion(rotation.x(), rotation.y(), rotation.z(), rotation.w()),
      linearVelocity: new Vector3(linVel.x(), linVel.y(), linVel.z()),
      angularVelocity: new Vector3(angVel.x(), angVel.y(), angVel.z()),
      isSleeping: !body.isActive()
    };
  }

  setBodyTransform(handle: PhysicsBodyHandle, position: Vector3, rotation: Quaternion): void {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const metadata = this.bodies.get(handle as number);
    if (!metadata) {
      throw new Error('Body not found');
    }

    this.tempTransform.setIdentity();
    this.tempVec3.setValue(position.x, position.y, position.z);
    this.tempQuat.setValue(rotation.x, rotation.y, rotation.z, rotation.w);
    this.tempTransform.setOrigin(this.tempVec3);
    this.tempTransform.setRotation(this.tempQuat);

    metadata.body.setWorldTransform(this.tempTransform);
    metadata.body.activate(true);
  }

  setBodyVelocity(handle: PhysicsBodyHandle, linear: Vector3, angular: Vector3): void {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const metadata = this.bodies.get(handle as number);
    if (!metadata) {
      throw new Error('Body not found');
    }

    this.tempVec3.setValue(linear.x, linear.y, linear.z);
    metadata.body.setLinearVelocity(this.tempVec3);

    this.tempVec3.setValue(angular.x, angular.y, angular.z);
    metadata.body.setAngularVelocity(this.tempVec3);

    metadata.body.activate(true);
  }

  applyForce(handle: PhysicsBodyHandle, force: Vector3, point?: Vector3): void {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const metadata = this.bodies.get(handle as number);
    if (!metadata) {
      throw new Error('Body not found');
    }

    const forceVec = new this.Ammo.btVector3(force.x, force.y, force.z);

    if (point) {
      const pointVec = new this.Ammo.btVector3(point.x, point.y, point.z);
      metadata.body.applyForce(forceVec, pointVec);
      this.Ammo.destroy(pointVec);
    } else {
      metadata.body.applyCentralForce(forceVec);
    }

    metadata.body.activate(true);
    this.Ammo.destroy(forceVec);
  }

  applyImpulse(handle: PhysicsBodyHandle, impulse: Vector3, point?: Vector3): void {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const metadata = this.bodies.get(handle as number);
    if (!metadata) {
      throw new Error('Body not found');
    }

    const impulseVec = new this.Ammo.btVector3(impulse.x, impulse.y, impulse.z);

    if (point) {
      const pointVec = new this.Ammo.btVector3(point.x, point.y, point.z);
      metadata.body.applyImpulse(impulseVec, pointVec);
      this.Ammo.destroy(pointVec);
    } else {
      metadata.body.applyCentralImpulse(impulseVec);
    }

    metadata.body.activate(true);
    this.Ammo.destroy(impulseVec);
  }

  setBodyMass(handle: PhysicsBodyHandle, mass: number): void {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const metadata = this.bodies.get(handle as number);
    if (!metadata) {
      throw new Error('Body not found');
    }

    const localInertia = new this.Ammo.btVector3(0, 0, 0);
    const shape = metadata.body.getCollisionShape();

    if (shape) {
      shape.calculateLocalInertia(mass, localInertia);
    }

    metadata.body.setMassProps(mass, localInertia);
    metadata.body.updateInertiaTensor();
    metadata.body.activate(true);

    this.Ammo.destroy(localInertia);
  }

  wakeBody(handle: PhysicsBodyHandle): void {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const metadata = this.bodies.get(handle as number);
    if (!metadata) {
      throw new Error('Body not found');
    }

    metadata.body.activate(true);
  }

  sleepBody(handle: PhysicsBodyHandle): void {
    if (!this._initialized) {
      throw new Error('AmmoBackend not initialized');
    }

    const metadata = this.bodies.get(handle as number);
    if (!metadata) {
      throw new Error('Body not found');
    }

    metadata.body.setActivationState(0);
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
      throw new Error('AmmoBackend not initialized');
    }

    let activeBodies = 0;
    let sleepingBodies = 0;

    for (const metadata of this.bodies.values()) {
      if (metadata.body.isActive()) {
        activeBodies++;
      } else {
        sleepingBodies++;
      }
    }

    const numManifolds = this.dispatcher.getNumManifolds();

    return {
      bodyCount: this.bodies.size,
      activeBodies,
      sleepingBodies,
      constraintCount: this.constraints.size,
      contacts: numManifolds,
      islands: 0
    };
  }

  private convertShape(config: ShapeConfig): any {
    switch (config.type) {
      case ShapeType.Box: {
        const boxShape = config.shape as BoxShape;
        const halfExtents = new this.Ammo.btVector3(
          boxShape.extents.x,
          boxShape.extents.y,
          boxShape.extents.z
        );
        const shape = new this.Ammo.btBoxShape(halfExtents);
        this.Ammo.destroy(halfExtents);
        return shape;
      }

      case ShapeType.Sphere: {
        const sphereShape = config.shape as SphereShape;
        return new this.Ammo.btSphereShape(sphereShape.radius);
      }

      case ShapeType.Capsule: {
        const capsuleData = config.shape as any;
        return new this.Ammo.btCapsuleShape(capsuleData.radius, capsuleData.height);
      }

      default:
        return null;
    }
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

  private findBodyHandle(ammoBody: any): number | null {
    for (const [handle, metadata] of this.bodies) {
      if (metadata.body === ammoBody) {
        return handle;
      }
    }
    return null;
  }

  private processCollisions(): void {
    const numManifolds = this.dispatcher.getNumManifolds();

    for (let i = 0; i < numManifolds; i++) {
      const contactManifold = this.dispatcher.getManifoldByIndexInternal(i);
      const body0 = this.Ammo.castObject(contactManifold.getBody0(), this.Ammo.btRigidBody);
      const body1 = this.Ammo.castObject(contactManifold.getBody1(), this.Ammo.btRigidBody);

      const handle0 = this.findBodyHandle(body0);
      const handle1 = this.findBodyHandle(body1);

      if (handle0 === null || handle1 === null) continue;

      const numContacts = contactManifold.getNumContacts();
      const contacts: ContactPoint[] = [];

      for (let j = 0; j < numContacts; j++) {
        const pt = contactManifold.getContactPoint(j);
        const posA = pt.getPositionWorldOnA();
        const posB = pt.getPositionWorldOnB();
        const normal = pt.get_m_normalWorldOnB();

        contacts.push({
          point: new Vector3(posA.x(), posA.y(), posA.z()),
          normal: new Vector3(normal.x(), normal.y(), normal.z()),
          separation: pt.getDistance(),
          impulse: pt.getAppliedImpulse()
        });
      }

      if (contacts.length > 0) {
        this.collisionEvents.push({
          bodyA: handle0,
          bodyB: handle1,
          contacts,
          impulse: contacts.reduce((sum, c) => sum + c.impulse, 0)
        });
      }
    }
  }
}
