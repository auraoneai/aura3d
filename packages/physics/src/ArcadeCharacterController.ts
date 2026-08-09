import type { Collider } from "./Collider.js";
import { KinematicBody, type KinematicBodySnapshot } from "./KinematicBody.js";
import type { PhysicsWorld } from "./PhysicsWorld.js";
import type { RigidBody } from "./RigidBody.js";
import { Shape, type Vec3 } from "./Shape.js";

export interface ArcadeCharacterControllerDescriptor {
  readonly position?: Vec3;
  readonly radius?: number;
  readonly halfHeight?: number;
  readonly maxSpeed?: number;
  readonly acceleration?: number;
  readonly jumpSpeed?: number;
  readonly gravity?: number;
  readonly groundY?: number;
}

export interface ArcadeCharacterControllerState {
  readonly grounded: boolean;
  readonly groundNormal: Vec3;
  readonly groundColliderId: number | null;
  readonly desiredVelocity: Vec3;
  readonly velocity: Vec3;
  readonly speed: number;
  readonly jumpedThisFrame: boolean;
}

/**
 * Authored-unit deterministic movement with a kinematic trigger proxy.
 *
 * This is deliberately not a rigid-body character controller. Physical slope,
 * step, contact, and depenetration ownership belongs to the selected optional
 * Rapier adapter. The proxy exists so arcade routes can reuse trigger/raycast
 * plumbing without importing or pretending to be physical simulation.
 */
export class ArcadeCharacterController {
  readonly body: RigidBody;
  readonly collider: Collider;
  readonly radius: number;
  readonly halfHeight: number;
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly jumpSpeed: number;
  readonly motion: KinematicBody;
  #jumpQueued = false;

  constructor(world: PhysicsWorld, descriptor: ArcadeCharacterControllerDescriptor = {}) {
    this.radius = positive(descriptor.radius ?? 0.24, "arcade character radius");
    this.halfHeight = positive(descriptor.halfHeight ?? 0.38, "arcade character halfHeight");
    this.maxSpeed = positive(descriptor.maxSpeed ?? 3.5, "arcade character maxSpeed");
    this.acceleration = positive(descriptor.acceleration ?? 32, "arcade character acceleration");
    this.jumpSpeed = positive(descriptor.jumpSpeed ?? 4.2, "arcade character jumpSpeed");
    const position = descriptor.position ?? [0, this.halfHeight + this.radius, 0];
    const groundY = descriptor.groundY ?? position[1] - this.halfHeight - this.radius;
    this.motion = new KinematicBody({
      id: "arcade-character",
      position,
      halfExtents: [this.radius, this.halfHeight + this.radius, this.radius],
      maxSpeed: this.maxSpeed,
      acceleration: this.acceleration,
      airAcceleration: this.acceleration * 0.65,
      jumpSpeed: this.jumpSpeed,
      gravity: descriptor.gravity ?? 9.81,
      groundY,
      groundSnapDistance: 0.08,
      lockDepth: false
    });
    this.body = world.createRigidBody({ type: "kinematic", position });
    this.collider = world.createCollider(this.body, {
      shape: Shape.capsule(this.radius, this.halfHeight),
      sensor: true
    });
  }

  setMoveInput(input: { readonly x: number; readonly z?: number }): void {
    this.motion.setMoveInput({ x: finiteOrZero(input.x), z: finiteOrZero(input.z ?? 0) });
  }

  jump(): void {
    this.#jumpQueued = true;
    this.motion.jump();
  }

  teleport(position: Vec3): void {
    this.motion.position = [...position];
    this.motion.previousPosition = [...position];
    this.motion.velocity = [0, 0, 0];
    this.motion.grounded = false;
    this.#syncProxy();
  }

  step(dt: number): ArcadeCharacterControllerState {
    const events = this.motion.step(dt);
    this.#syncProxy();
    const snapshot = this.motion.snapshot();
    const jumpedThisFrame = this.#jumpQueued && events.some((event) => event.type === "jump");
    this.#jumpQueued = false;
    return stateFromSnapshot(snapshot, jumpedThisFrame);
  }

  snapshot(): ArcadeCharacterControllerState {
    return stateFromSnapshot(this.motion.snapshot(), false);
  }

  #syncProxy(): void {
    this.body.setPosition(this.motion.position);
    this.body.setVelocity([0, 0, 0]);
  }
}

function stateFromSnapshot(snapshot: KinematicBodySnapshot, jumpedThisFrame: boolean): ArcadeCharacterControllerState {
  const speed = Math.hypot(snapshot.velocity[0], snapshot.velocity[2]);
  return {
    grounded: snapshot.grounded,
    groundNormal: [0, 1, 0],
    groundColliderId: null,
    desiredVelocity: [snapshot.moveInput[0] * speed, snapshot.velocity[1], snapshot.moveInput[2] * speed],
    velocity: snapshot.velocity,
    speed,
    jumpedThisFrame
  };
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive.`);
  return value;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
