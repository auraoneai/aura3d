/**
 * Rigid body physics component for dynamic objects.
 *
 * @module Physics/RigidBody
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { Matrix4 } from '../math/Matrix4';
import { Matrix3 } from '../math/Matrix3';
import { Collider, IShape } from './Collider';

/**
 * Rigid body type enum.
 */
export enum BodyType {
  /** Dynamic body affected by forces and gravity */
  Dynamic = 0,

  /** Kinematic body moved by setting velocity (not affected by forces) */
  Kinematic = 1,

  /** Static body that never moves */
  Static = 2
}

/**
 * Rigid body class for physics simulation.
 *
 * Represents a physical object with mass, velocity, and forces.
 *
 * @example
 * ```typescript
 * const body = new RigidBody({
 *   type: BodyType.Dynamic,
 *   mass: 10,
 *   position: new Vector3(0, 5, 0)
 * });
 *
 * body.addCollider(new Collider({ shape: new BoxShape(Vector3.one()) }));
 * body.applyForce(new Vector3(0, 100, 0));
 * ```
 */
export class RigidBody {
  type: BodyType;
  position: Vector3;
  rotation: Quaternion;
  linearVelocity: Vector3;
  angularVelocity: Vector3;

  /** Alias for linearVelocity for convenience */
  get velocity(): Vector3 {
    return this.linearVelocity;
  }
  set velocity(v: Vector3) {
    this.linearVelocity = v;
  }
  mass: number;
  inverseMass: number;
  inertia: Matrix3;
  inverseInertia: Matrix3;
  linearDamping: number;
  angularDamping: number;
  gravityScale: number;
  colliders: Collider[];
  isSleeping: boolean;
  sleepThreshold: number;
  private sleepTime: number;
  private forceAccumulator: Vector3;
  private torqueAccumulator: Vector3;

  constructor(options: {
    type?: BodyType;
    mass?: number;
    position?: Vector3;
    rotation?: Quaternion;
    linearDamping?: number;
    angularDamping?: number;
    gravityScale?: number;
  } = {}) {
    this.type = options.type ?? BodyType.Dynamic;
    this.position = options.position ?? Vector3.zero();
    this.rotation = options.rotation ?? Quaternion.identity();
    this.linearVelocity = Vector3.zero();
    this.angularVelocity = Vector3.zero();
    this.mass = options.mass ?? 1.0;
    this.inverseMass = this.type === BodyType.Dynamic ? 1.0 / this.mass : 0;
    this.inertia = Matrix3.identity();
    this.inverseInertia = Matrix3.identity();
    this.linearDamping = options.linearDamping ?? 0.01;
    this.angularDamping = options.angularDamping ?? 0.05;
    this.gravityScale = options.gravityScale ?? 1.0;
    this.colliders = [];
    this.isSleeping = false;
    this.sleepThreshold = 0.1;
    this.sleepTime = 0;
    this.forceAccumulator = Vector3.zero();
    this.torqueAccumulator = Vector3.zero();
  }

  addCollider(colliderOrShapeOrConfig: Collider | IShape | { shape: IShape; friction?: number; restitution?: number; isTrigger?: boolean }): void {
    // If it's already a Collider instance with getAABB method, use directly
    if (colliderOrShapeOrConfig instanceof Collider) {
      this.colliders.push(colliderOrShapeOrConfig);
      return;
    }

    // If it's a config object with shape property, create a Collider from it
    if ('shape' in colliderOrShapeOrConfig && colliderOrShapeOrConfig.shape) {
      const config = colliderOrShapeOrConfig as { shape: IShape; friction?: number; restitution?: number; isTrigger?: boolean };
      const collider = new Collider({
        shape: config.shape,
        isTrigger: config.isTrigger
      });
      // Apply friction/restitution to material if provided
      if (config.friction !== undefined) {
        collider.material.staticFriction = config.friction;
        collider.material.dynamicFriction = config.friction;
      }
      if (config.restitution !== undefined) {
        collider.material.restitution = config.restitution;
      }
      this.colliders.push(collider);
      return;
    }

    // If it's an IShape (has type property for ShapeType), wrap it in a Collider
    if ('type' in colliderOrShapeOrConfig) {
      const collider = new Collider({ shape: colliderOrShapeOrConfig as IShape });
      this.colliders.push(collider);
    }
  }

  removeCollider(collider: Collider): void {
    const index = this.colliders.indexOf(collider);
    if (index !== -1) this.colliders.splice(index, 1);
  }

  applyForce(force: Vector3, point?: Vector3): void {
    if (this.type !== BodyType.Dynamic) return;
    this.forceAccumulator.addInPlace(force);
    if (point) {
      const r = point.sub(this.position);
      const torque = r.cross(force);
      this.torqueAccumulator.addInPlace(torque);
    }
    this.wakeUp();
  }

  applyImpulse(impulse: Vector3, point?: Vector3): void {
    if (this.type !== BodyType.Dynamic) return;
    this.linearVelocity.addInPlace(impulse.scale(this.inverseMass));
    if (point) {
      const r = point.sub(this.position);
      const angularImpulse = r.cross(impulse);
      // Convert to angular velocity (simplified)
      this.angularVelocity.addInPlace(angularImpulse.scale(this.inverseMass));
    }
    this.wakeUp();
  }

  /** Alias for applyForce with point parameter */
  applyForceAtPoint(force: Vector3, point: Vector3): void {
    this.applyForce(force, point);
  }

  /** Alias for applyImpulse with point parameter */
  applyImpulseAtPoint(impulse: Vector3, point: Vector3): void {
    this.applyImpulse(impulse, point);
  }

  /** Apply torque to rotate the body */
  applyTorque(torque: Vector3): void {
    if (this.type !== BodyType.Dynamic) return;
    this.torqueAccumulator.addInPlace(torque);
    this.wakeUp();
  }

  setMass(mass: number): void {
    this.mass = mass;
    this.inverseMass = this.type === BodyType.Dynamic && mass > 0 ? 1.0 / mass : 0;
  }

  setInertia(inertia: Matrix4): void {
    this.inertia.setFromMatrix4(inertia);
    const inv = this.inertia.invert();
    if (inv) this.inverseInertia.copy(inv);
  }

  setPosition(position: Vector3): this {
    this.position.copy(position);
    this.wakeUp();
    return this;
  }

  getPosition(): Vector3 {
    return this.position.clone();
  }

  setRotation(rotation: Quaternion): this {
    this.rotation = rotation;
    this.wakeUp();
    return this;
  }

  getRotation(): Quaternion {
    return this.rotation;
  }

  setVelocity(velocity: Vector3): this {
    this.linearVelocity.copy(velocity);
    this.wakeUp();
    return this;
  }

  getVelocity(): Vector3 {
    return this.linearVelocity.clone();
  }

  getLinearVelocity(): Vector3 {
    return this.linearVelocity.clone();
  }

  /** Alias for setVelocity for common naming convention */
  setLinearVelocity(velocity: Vector3): this {
    return this.setVelocity(velocity);
  }

  setAngularVelocity(angularVelocity: Vector3): this {
    this.angularVelocity.copy(angularVelocity);
    this.wakeUp();
    return this;
  }

  getAngularVelocity(): Vector3 {
    return this.angularVelocity.clone();
  }

  getWorldMatrix(): Matrix4 {
    const matrix = new Matrix4();
    matrix.compose(this.position, this.rotation, Vector3.one());
    return matrix;
  }

  integrate(dt: number, gravity: Vector3): void {
    if (this.type !== BodyType.Dynamic || this.isSleeping) return;

    // Apply gravity
    const gravityForce = gravity.scale(this.mass * this.gravityScale);
    this.forceAccumulator.addInPlace(gravityForce);

    // Linear integration
    const acceleration = this.forceAccumulator.scale(this.inverseMass);
    this.linearVelocity.addInPlace(acceleration.scale(dt));
    this.position.addInPlace(this.linearVelocity.scale(dt));

    // Apply damping
    const linearDamp = Math.pow(1.0 - this.linearDamping, dt);
    this.linearVelocity.scaleInPlace(linearDamp);

    // Angular integration (simplified)
    this.rotation = this.rotation.multiply(
      Quaternion.fromAxisAngle(this.angularVelocity.normalize(), this.angularVelocity.length() * dt)
    ).normalize();

    const angularDamp = Math.pow(1.0 - this.angularDamping, dt);
    this.angularVelocity.scaleInPlace(angularDamp);

    // Clear accumulators
    this.forceAccumulator.set(0, 0, 0);
    this.torqueAccumulator.set(0, 0, 0);

    // Check sleep
    this.updateSleep(dt);
  }

  private updateSleep(dt: number): void {
    const energy = this.linearVelocity.lengthSquared() + this.angularVelocity.lengthSquared();
    if (energy < this.sleepThreshold) {
      this.sleepTime += dt;
      if (this.sleepTime > 0.5) this.isSleeping = true;
    } else {
      this.sleepTime = 0;
      this.isSleeping = false;
    }
  }

  wakeUp(): void {
    this.isSleeping = false;
    this.sleepTime = 0;
  }

  sleep(): void {
    this.isSleeping = true;
    this.linearVelocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
  }
}
