import type { Collider } from "./Collider.js";
import { KinematicBody, type KinematicBodyDescriptor, type KinematicBodyEvent, type KinematicBodySnapshot, type KinematicStepOptions } from "./KinematicBody.js";
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

export type FightingCharacterControllerState =
  | "idle"
  | "walk"
  | "dash"
  | "jump"
  | "fast-fall"
  | "crouch"
  | "landing";

export type FightingCharacterControllerDescriptor = KinematicBodyDescriptor & {
  readonly walkSpeed?: number;
  readonly crouchSpeed?: number;
  readonly fastFallSpeed?: number;
};

export type FightingCharacterControllerSnapshot = KinematicBodySnapshot & {
  readonly state: FightingCharacterControllerState;
  readonly walkSpeed: number;
  readonly crouchSpeed: number;
  readonly fastFallSpeed: number;
};

export class FightingCharacterController {
  readonly body: KinematicBody;
  readonly walkSpeed: number;
  readonly crouchSpeed: number;
  readonly fastFallSpeed: number;
  private state: FightingCharacterControllerState = "idle";

  constructor(descriptor: FightingCharacterControllerDescriptor = {}) {
    this.walkSpeed = positiveFinite(descriptor.walkSpeed ?? descriptor.maxSpeed ?? 4.5, "fighting controller walkSpeed");
    this.crouchSpeed = positiveFinite(descriptor.crouchSpeed ?? this.walkSpeed * 0.45, "fighting controller crouchSpeed");
    this.fastFallSpeed = positiveFinite(descriptor.fastFallSpeed ?? descriptor.maxFallSpeed ?? 20, "fighting controller fastFallSpeed");
    this.body = new KinematicBody({
      ...descriptor,
      id: descriptor.id ?? "fighter",
      halfExtents: descriptor.halfExtents ?? [0.32, 0.9, 0.25],
      maxSpeed: descriptor.maxSpeed ?? this.walkSpeed,
      acceleration: descriptor.acceleration ?? 54,
      airAcceleration: descriptor.airAcceleration ?? 24,
      groundFriction: descriptor.groundFriction ?? 56,
      airFriction: descriptor.airFriction ?? 4,
      gravity: descriptor.gravity ?? 26,
      jumpSpeed: descriptor.jumpSpeed ?? 9.4,
      maxFallSpeed: descriptor.maxFallSpeed ?? Math.max(this.fastFallSpeed, 20),
      dashSpeed: descriptor.dashSpeed ?? 8.6,
      dashDuration: descriptor.dashDuration ?? 0.12,
      dashCooldown: descriptor.dashCooldown ?? 0.18,
      groundSnapDistance: descriptor.groundSnapDistance ?? 0.06,
      lockDepth: descriptor.lockDepth ?? true
    });
  }

  walk(direction: number, speed?: number): void {
    const magnitude = Math.min(1, Math.abs(finiteOrZero(direction)));
    const facing = direction < 0 ? -1 : 1;
    const targetSpeed = speed ?? (this.body.snapshot().crouching ? this.crouchSpeed : this.walkSpeed);
    const normalizedSpeed = this.body.maxSpeed > 0 ? Math.min(1, positiveFinite(targetSpeed, "fighting controller walk speed") / this.body.maxSpeed) : 0;
    this.body.move(facing * magnitude * normalizedSpeed);
    this.state = magnitude > 0 ? "walk" : this.deriveState([]);
  }

  stop(): void {
    this.body.move(0);
    this.state = this.deriveState([]);
  }

  jump(): void {
    this.body.jump();
    this.state = "jump";
  }

  dash(direction?: number): void {
    this.body.dash(direction);
    this.state = "dash";
  }

  fastFall(speed = this.fastFallSpeed): void {
    this.body.fastFall(speed);
    if (!this.body.grounded) {
      this.state = "fast-fall";
    }
  }

  crouch(active = true): void {
    this.body.crouch(active);
    this.state = active ? "crouch" : this.deriveState([]);
  }

  step(dt: number, options: KinematicStepOptions = {}): readonly KinematicBodyEvent[] {
    const events = this.body.step(dt, options);
    this.state = this.deriveState(events);
    return events;
  }

  snapshot(): FightingCharacterControllerSnapshot {
    return {
      ...this.body.snapshot(),
      state: this.state,
      walkSpeed: this.walkSpeed,
      crouchSpeed: this.crouchSpeed,
      fastFallSpeed: this.fastFallSpeed
    };
  }

  private deriveState(events: readonly KinematicBodyEvent[]): FightingCharacterControllerState {
    if (events.some((event) => event.type === "land")) return "landing";
    const snapshot = this.body.snapshot();
    if (snapshot.crouching) return "crouch";
    if (snapshot.dashFramesRemaining > 0) return "dash";
    if (!snapshot.grounded) return snapshot.velocity[1] < -this.fastFallSpeed * 0.5 ? "fast-fall" : "jump";
    return Math.abs(snapshot.velocity[0]) > 0.05 ? "walk" : "idle";
  }
}

export function createFightingCharacterController(descriptor: FightingCharacterControllerDescriptor = {}): FightingCharacterController {
  return new FightingCharacterController(descriptor);
}

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
