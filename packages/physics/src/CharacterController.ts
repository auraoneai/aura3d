import type { Collider } from "./Collider.js";
import type { PhysicsWorld } from "./PhysicsWorld.js";
import type { RigidBody } from "./RigidBody.js";
import { Shape, normalizeVec3, type Vec3 } from "./Shape.js";

export type CharacterControllerDescriptor = {
  readonly position?: Vec3;
  readonly radius?: number;
  readonly halfHeight?: number;
  readonly maxSpeed?: number;
  readonly acceleration?: number;
  readonly jumpSpeed?: number;
  readonly groundProbeDistance?: number;
  readonly maxSlopeAngleRadians?: number;
  readonly collisionMask?: number;
};

export type CharacterControllerMoveInput = {
  readonly x: number;
  readonly z?: number;
};

export type CharacterControllerState = {
  readonly grounded: boolean;
  readonly groundNormal: Vec3;
  readonly groundColliderId: number | null;
  readonly desiredVelocity: Vec3;
  readonly velocity: Vec3;
  readonly speed: number;
  readonly jumpedThisFrame: boolean;
};

export class CharacterController {
  readonly body: RigidBody;
  readonly collider: Collider;
  readonly radius: number;
  readonly halfHeight: number;
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly jumpSpeed: number;
  readonly groundProbeDistance: number;
  readonly maxSlopeAngleRadians: number;
  private readonly collisionMask: number | undefined;
  private moveInput: [number, number] = [0, 0];
  private jumpQueued = false;
  private state: CharacterControllerState = {
    grounded: false,
    groundNormal: [0, 1, 0],
    groundColliderId: null,
    desiredVelocity: [0, 0, 0],
    velocity: [0, 0, 0],
    speed: 0,
    jumpedThisFrame: false
  };

  constructor(private readonly world: PhysicsWorld, descriptor: CharacterControllerDescriptor = {}) {
    this.radius = positiveFinite(descriptor.radius ?? 0.24, "character radius");
    this.halfHeight = positiveFinite(descriptor.halfHeight ?? 0.38, "character halfHeight");
    this.maxSpeed = positiveFinite(descriptor.maxSpeed ?? 3.5, "character maxSpeed");
    this.acceleration = positiveFinite(descriptor.acceleration ?? 32, "character acceleration");
    this.jumpSpeed = positiveFinite(descriptor.jumpSpeed ?? 4.2, "character jumpSpeed");
    this.groundProbeDistance = positiveFinite(descriptor.groundProbeDistance ?? 0.12, "character groundProbeDistance");
    this.maxSlopeAngleRadians = positiveFinite(descriptor.maxSlopeAngleRadians ?? Math.PI / 3, "character maxSlopeAngleRadians");
    this.collisionMask = descriptor.collisionMask;
    this.body = world.createRigidBody({
      type: "dynamic",
      position: descriptor.position ?? [0, this.halfHeight + this.radius, 0],
      mass: 1,
      linearDamping: 0.02,
      angularDamping: 1
    });
    this.collider = world.createCollider(this.body, {
      shape: Shape.capsule(this.radius, this.halfHeight),
      material: { friction: 0.05, restitution: 0 }
    });
  }

  setMoveInput(input: CharacterControllerMoveInput): void {
    const x = finiteOrZero(input.x);
    const z = finiteOrZero(input.z ?? 0);
    const length = Math.hypot(x, z);
    this.moveInput = length > 1 ? [x / length, z / length] : [x, z];
  }

  jump(): void {
    this.jumpQueued = true;
  }

  teleport(position: Vec3): void {
    this.body.setPosition(position);
    this.body.setVelocity([0, 0, 0]);
    this.state = {
      ...this.state,
      grounded: false,
      groundColliderId: null,
      velocity: [0, 0, 0],
      speed: 0,
      jumpedThisFrame: false
    };
  }

  step(dt: number): CharacterControllerState {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new Error("CharacterController.step dt must be finite and positive.");
    }
    const ground = this.probeGround();
    const desiredVelocity: Vec3 = [
      this.moveInput[0] * this.maxSpeed,
      this.body.velocity[1],
      this.moveInput[1] * this.maxSpeed
    ];
    const nextVelocity: [number, number, number] = [
      moveToward(this.body.velocity[0], desiredVelocity[0], this.acceleration * dt),
      this.body.velocity[1],
      moveToward(this.body.velocity[2], desiredVelocity[2], this.acceleration * dt)
    ];
    let jumpedThisFrame = false;
    if (ground.grounded && nextVelocity[1] < 0) {
      nextVelocity[1] = 0;
    }
    if (this.jumpQueued && ground.grounded) {
      nextVelocity[1] = this.jumpSpeed;
      jumpedThisFrame = true;
    }
    this.jumpQueued = false;
    this.body.setVelocity(nextVelocity);
    this.state = {
      grounded: ground.grounded && !jumpedThisFrame,
      groundNormal: ground.normal,
      groundColliderId: ground.colliderId,
      desiredVelocity,
      velocity: [...nextVelocity],
      speed: Math.hypot(nextVelocity[0], nextVelocity[2]),
      jumpedThisFrame
    };
    return this.state;
  }

  snapshot(): CharacterControllerState {
    return {
      ...this.state,
      groundNormal: [...this.state.groundNormal],
      desiredVelocity: [...this.state.desiredVelocity],
      velocity: [...this.state.velocity]
    };
  }

  private probeGround(): { readonly grounded: boolean; readonly normal: Vec3; readonly colliderId: number | null } {
    const origin: Vec3 = [
      this.body.position[0],
      this.body.position[1] - this.halfHeight + this.groundProbeDistance,
      this.body.position[2]
    ];
    const hit = this.world.sphereCast(origin, this.radius * 0.92, [0, -1, 0], {
      maxDistance: this.groundProbeDistance + this.radius * 0.35,
      includeSensors: false,
      ...(this.collisionMask === undefined ? {} : { mask: this.collisionMask })
    });
    const minGroundNormalY = Math.cos(this.maxSlopeAngleRadians);
    if (!hit || hit.normal[1] < minGroundNormalY) {
      return { grounded: false, normal: [0, 1, 0], colliderId: null };
    }
    return { grounded: true, normal: normalizeVec3(hit.normal), colliderId: hit.colliderId };
  }
}

function positiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
  return value;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function moveToward(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) {
    return target;
  }
  return current + Math.sign(delta) * maxDelta;
}
