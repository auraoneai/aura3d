import {
  normalizeFacing,
  pushbox,
  resolveCollisionVolume,
  withVolumeOwner,
  type CombatFacing,
  type CollisionVolume,
  type CollisionOwnerId,
  type ResolvedCollisionVolume
} from "./CollisionVolumes.js";
import { cloneVec3, validateFiniteVec3, type Vec3 } from "./Shape.js";

export type KinematicBodyId = CollisionOwnerId;

export type KinematicBounds = {
  readonly minX?: number;
  readonly maxX?: number;
  readonly minY?: number;
  readonly maxY?: number;
  readonly minZ?: number;
  readonly maxZ?: number;
};

export type KinematicMoveInput = {
  readonly x?: number;
  readonly z?: number;
};

export type KinematicBodyDescriptor = {
  readonly id?: KinematicBodyId;
  readonly position?: Vec3;
  readonly velocity?: Vec3;
  readonly facing?: CombatFacing;
  readonly halfExtents?: Vec3;
  readonly maxSpeed?: number;
  readonly acceleration?: number;
  readonly airAcceleration?: number;
  readonly groundFriction?: number;
  readonly airFriction?: number;
  readonly gravity?: number;
  readonly jumpSpeed?: number;
  readonly maxFallSpeed?: number;
  readonly dashSpeed?: number;
  readonly dashDuration?: number;
  readonly dashCooldown?: number;
  readonly groundY?: number;
  readonly groundSnapDistance?: number;
  readonly bounds?: KinematicBounds;
  readonly lockDepth?: boolean;
  readonly laneZ?: number;
  readonly laneHalfWidth?: number;
  readonly pushbox?: CollisionVolume;
  readonly tags?: readonly string[];
};

export type KinematicStepOptions = {
  readonly gravity?: number;
  readonly groundY?: number;
  readonly groundSnapDistance?: number;
  readonly bounds?: KinematicBounds;
  readonly lockDepth?: boolean;
  readonly laneZ?: number;
  readonly laneHalfWidth?: number;
};

export type KnockbackOptions = {
  readonly mode?: "add" | "set";
  readonly clearDash?: boolean;
  readonly forceAirborne?: boolean;
};

export type KinematicBodySnapshot = {
  readonly id: KinematicBodyId;
  readonly position: Vec3;
  readonly previousPosition: Vec3;
  readonly velocity: Vec3;
  readonly facing: CombatFacing;
  readonly grounded: boolean;
  readonly moveInput: Vec3;
  readonly halfExtents: Vec3;
  readonly dashFramesRemaining: number;
  readonly dashCooldownRemaining: number;
  readonly tags: readonly string[];
};

export type KinematicBodyEvent =
  | {
      readonly type: "jump";
      readonly bodyId: KinematicBodyId;
      readonly position: Vec3;
      readonly velocity: Vec3;
    }
  | {
      readonly type: "dash";
      readonly bodyId: KinematicBodyId;
      readonly direction: CombatFacing;
      readonly position: Vec3;
      readonly velocity: Vec3;
      readonly duration: number;
    }
  | {
      readonly type: "land";
      readonly bodyId: KinematicBodyId;
      readonly position: Vec3;
      readonly impactSpeed: number;
    }
  | {
      readonly type: "bounds";
      readonly bodyId: KinematicBodyId;
      readonly axes: readonly ("x" | "y" | "z")[];
      readonly position: Vec3;
    }
  | {
      readonly type: "ground-snap";
      readonly bodyId: KinematicBodyId;
      readonly position: Vec3;
    }
  | {
      readonly type: "knockback";
      readonly bodyId: KinematicBodyId;
      readonly impulse: Vec3;
      readonly velocity: Vec3;
    };

export class KinematicBody {
  readonly id: KinematicBodyId;
  readonly halfExtents: Vec3;
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly airAcceleration: number;
  readonly groundFriction: number;
  readonly airFriction: number;
  readonly gravity: number;
  readonly jumpSpeed: number;
  readonly maxFallSpeed: number;
  readonly dashSpeed: number;
  readonly dashDuration: number;
  readonly dashCooldown: number;
  readonly groundY: number;
  readonly groundSnapDistance: number;
  readonly bounds: KinematicBounds | undefined;
  readonly lockDepth: boolean;
  readonly laneZ: number;
  readonly laneHalfWidth: number | undefined;
  readonly tags: readonly string[];
  position: [number, number, number];
  previousPosition: [number, number, number];
  velocity: [number, number, number];
  facing: CombatFacing;
  grounded: boolean;
  private pushboxVolume: CollisionVolume;
  private moveInput: [number, number] = [0, 0];
  private jumpQueued = false;
  private dashQueued = false;
  private queuedDashDirection: CombatFacing | null = null;
  private dashTimeRemaining = 0;
  private dashCooldownRemaining = 0;
  private readonly pendingEvents: KinematicBodyEvent[] = [];

  constructor(id: KinematicBodyId, descriptor?: KinematicBodyDescriptor);
  constructor(descriptor?: KinematicBodyDescriptor);
  constructor(idOrDescriptor: KinematicBodyId | KinematicBodyDescriptor = 1, descriptor: KinematicBodyDescriptor = {}) {
    const resolvedDescriptor = isDescriptor(idOrDescriptor) ? idOrDescriptor : descriptor;
    const resolvedId = isDescriptor(idOrDescriptor) ? resolvedDescriptor.id ?? 1 : idOrDescriptor;
    validateBodyId(resolvedId);
    this.id = resolvedId;
    this.halfExtents = cloneVec3(resolvedDescriptor.halfExtents ?? [0.35, 0.9, 0.3]);
    validatePositiveVec3(this.halfExtents, "kinematic body halfExtents");
    this.maxSpeed = finiteNonNegative(resolvedDescriptor.maxSpeed ?? 4.5, "kinematic maxSpeed");
    this.acceleration = finiteNonNegative(resolvedDescriptor.acceleration ?? 48, "kinematic acceleration");
    this.airAcceleration = finiteNonNegative(resolvedDescriptor.airAcceleration ?? 22, "kinematic airAcceleration");
    this.groundFriction = finiteNonNegative(resolvedDescriptor.groundFriction ?? 52, "kinematic groundFriction");
    this.airFriction = finiteNonNegative(resolvedDescriptor.airFriction ?? 4, "kinematic airFriction");
    this.gravity = finiteNonNegative(Math.abs(resolvedDescriptor.gravity ?? 24), "kinematic gravity");
    this.jumpSpeed = finiteNonNegative(resolvedDescriptor.jumpSpeed ?? 8.5, "kinematic jumpSpeed");
    this.maxFallSpeed = finiteNonNegative(resolvedDescriptor.maxFallSpeed ?? 18, "kinematic maxFallSpeed");
    this.dashSpeed = finiteNonNegative(resolvedDescriptor.dashSpeed ?? 8.25, "kinematic dashSpeed");
    this.dashDuration = finiteNonNegative(resolvedDescriptor.dashDuration ?? 0.14, "kinematic dashDuration");
    this.dashCooldown = finiteNonNegative(resolvedDescriptor.dashCooldown ?? 0.18, "kinematic dashCooldown");
    this.groundY = finite(resolvedDescriptor.groundY ?? 0, "kinematic groundY");
    this.groundSnapDistance = finiteNonNegative(resolvedDescriptor.groundSnapDistance ?? 0.08, "kinematic groundSnapDistance");
    this.bounds = resolvedDescriptor.bounds;
    this.lockDepth = resolvedDescriptor.lockDepth ?? true;
    this.laneZ = finite(resolvedDescriptor.laneZ ?? 0, "kinematic laneZ");
    this.laneHalfWidth =
      resolvedDescriptor.laneHalfWidth === undefined ? undefined : finiteNonNegative(resolvedDescriptor.laneHalfWidth, "kinematic laneHalfWidth");
    this.tags = [...(resolvedDescriptor.tags ?? [])];
    this.position = cloneVec3(resolvedDescriptor.position ?? [0, this.groundY + this.halfExtents[1], this.laneZ]);
    this.previousPosition = cloneVec3(this.position);
    this.velocity = cloneVec3(resolvedDescriptor.velocity ?? [0, 0, 0]);
    validateFiniteVec3(this.position, "kinematic position");
    validateFiniteVec3(this.velocity, "kinematic velocity");
    this.facing = normalizeFacing(resolvedDescriptor.facing ?? 1);
    this.pushboxVolume =
      resolvedDescriptor.pushbox ??
      pushbox({
        id: "push",
        halfExtents: this.halfExtents
      });
    this.grounded = this.position[1] - this.halfExtents[1] <= this.groundY + this.groundSnapDistance;
  }

  setMoveInput(input: KinematicMoveInput | number, z = 0): void {
    const rawX = typeof input === "number" ? input : input.x ?? 0;
    const rawZ = typeof input === "number" ? z : input.z ?? 0;
    const x = finiteOrZero(rawX);
    const depth = this.lockDepth ? 0 : finiteOrZero(rawZ);
    const length = Math.hypot(x, depth);
    this.moveInput = length > 1 ? [x / length, depth / length] : [x, depth];
    if (Math.abs(this.moveInput[0]) > 1e-6) {
      this.facing = normalizeFacing(this.moveInput[0]);
    }
  }

  move(input: KinematicMoveInput | number, z = 0): void {
    this.setMoveInput(input, z);
  }

  queueJump(): void {
    this.jumpQueued = true;
  }

  jump(): void {
    this.queueJump();
  }

  queueDash(direction?: number): void {
    this.dashQueued = true;
    this.queuedDashDirection = direction === undefined ? null : normalizeFacing(direction);
  }

  dash(direction?: number): void {
    this.queueDash(direction);
  }

  applyKnockback(impulse: Vec3, options: KnockbackOptions = {}): void {
    validateFiniteVec3(impulse, "knockback impulse");
    if (options.mode === "set") {
      this.velocity = cloneVec3(impulse);
    } else {
      this.velocity = [
        this.velocity[0] + impulse[0],
        this.velocity[1] + impulse[1],
        this.velocity[2] + impulse[2]
      ];
    }
    if (options.clearDash ?? true) {
      this.dashTimeRemaining = 0;
      this.dashQueued = false;
      this.queuedDashDirection = null;
    }
    if (options.forceAirborne ?? impulse[1] > 0) {
      this.grounded = false;
    }
    this.pendingEvents.push({
      type: "knockback",
      bodyId: this.id,
      impulse: cloneVec3(impulse),
      velocity: cloneVec3(this.velocity)
    });
  }

  setPosition(position: Vec3): void {
    validateFiniteVec3(position, "kinematic position");
    this.position = cloneVec3(position);
    this.previousPosition = cloneVec3(position);
    this.grounded = this.position[1] - this.halfExtents[1] <= this.groundY + this.groundSnapDistance;
  }

  translate(delta: Vec3): void {
    validateFiniteVec3(delta, "kinematic translation");
    this.position = [
      this.position[0] + delta[0],
      this.position[1] + delta[1],
      this.position[2] + delta[2]
    ];
  }

  setVelocity(velocity: Vec3): void {
    validateFiniteVec3(velocity, "kinematic velocity");
    this.velocity = cloneVec3(velocity);
  }

  setFacing(facing: number): void {
    this.facing = normalizeFacing(facing);
  }

  setPushbox(volume: CollisionVolume): void {
    if (volume.kind !== "pushbox") {
      throw new Error("KinematicBody pushbox volume must have kind \"pushbox\".");
    }
    this.pushboxVolume = volume;
  }

  resolvedPushbox(): ResolvedCollisionVolume {
    return resolveCollisionVolume(withVolumeOwner(this.pushboxVolume, this.id), this.position, this.facing);
  }

  step(dt: number, options: KinematicStepOptions = {}): readonly KinematicBodyEvent[] {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new Error("KinematicBody.step dt must be finite and positive.");
    }
    const events = this.drainPendingEvents();
    this.previousPosition = cloneVec3(this.position);
    const wasGrounded = this.grounded;
    const impactSpeed = Math.max(0, -this.velocity[1]);
    const gravity = finiteNonNegative(Math.abs(options.gravity ?? this.gravity), "kinematic step gravity");
    const lockDepth = options.lockDepth ?? this.lockDepth;
    const laneZ = finite(options.laneZ ?? this.laneZ, "kinematic step laneZ");
    if (this.dashCooldownRemaining > 0) {
      this.dashCooldownRemaining = Math.max(0, this.dashCooldownRemaining - dt);
    }
    if (this.dashQueued && this.dashCooldownRemaining <= 0 && this.dashDuration > 0 && this.dashSpeed > 0) {
      const direction = this.queuedDashDirection ?? (Math.abs(this.moveInput[0]) > 1e-6 ? normalizeFacing(this.moveInput[0]) : this.facing);
      this.facing = direction;
      this.dashTimeRemaining = this.dashDuration;
      this.dashCooldownRemaining = this.dashDuration + this.dashCooldown;
      this.velocity[0] = direction * this.dashSpeed;
      if (lockDepth) {
        this.velocity[2] = 0;
      }
      events.push({
        type: "dash",
        bodyId: this.id,
        direction,
        position: cloneVec3(this.position),
        velocity: cloneVec3(this.velocity),
        duration: this.dashDuration
      });
    }
    this.dashQueued = false;
    this.queuedDashDirection = null;
    if (this.jumpQueued && this.grounded && this.jumpSpeed > 0) {
      this.velocity[1] = this.jumpSpeed;
      this.grounded = false;
      events.push({
        type: "jump",
        bodyId: this.id,
        position: cloneVec3(this.position),
        velocity: cloneVec3(this.velocity)
      });
    }
    this.jumpQueued = false;
    if (this.dashTimeRemaining > 0) {
      this.dashTimeRemaining = Math.max(0, this.dashTimeRemaining - dt);
      if (lockDepth) {
        this.velocity[2] = 0;
      }
    } else {
      const acceleration = this.grounded ? this.acceleration : this.airAcceleration;
      const friction = this.grounded ? this.groundFriction : this.airFriction;
      this.velocity[0] = approachAxis(this.velocity[0], this.moveInput[0], this.maxSpeed, acceleration, friction, dt);
      this.velocity[2] = lockDepth ? 0 : approachAxis(this.velocity[2], this.moveInput[1], this.maxSpeed, acceleration, friction, dt);
    }
    if (this.grounded && this.velocity[1] < 0) {
      this.velocity[1] = 0;
    }
    if (!this.grounded || this.velocity[1] > 0) {
      this.velocity[1] = Math.max(this.velocity[1] - gravity * dt, -this.maxFallSpeed);
    }
    this.position = [
      this.position[0] + this.velocity[0] * dt,
      this.position[1] + this.velocity[1] * dt,
      this.position[2] + this.velocity[2] * dt
    ];
    events.push(...this.applyConstraints({ ...options, lockDepth, laneZ }, wasGrounded, impactSpeed));
    return events;
  }

  constrain(options: KinematicStepOptions = {}): readonly KinematicBodyEvent[] {
    return this.applyConstraints(options, this.grounded, Math.max(0, -this.velocity[1]));
  }

  stopAxis(axis: "x" | "y" | "z"): void {
    const index = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    this.velocity[index] = 0;
  }

  snapshot(): KinematicBodySnapshot {
    return {
      id: this.id,
      position: cloneVec3(this.position),
      previousPosition: cloneVec3(this.previousPosition),
      velocity: cloneVec3(this.velocity),
      facing: this.facing,
      grounded: this.grounded,
      moveInput: [this.moveInput[0], 0, this.moveInput[1]],
      halfExtents: cloneVec3(this.halfExtents),
      dashFramesRemaining: this.dashTimeRemaining,
      dashCooldownRemaining: this.dashCooldownRemaining,
      tags: [...this.tags]
    };
  }

  private applyConstraints(options: KinematicStepOptions, wasGrounded: boolean, impactSpeed: number): KinematicBodyEvent[] {
    const events: KinematicBodyEvent[] = [];
    const lockDepth = options.lockDepth ?? this.lockDepth;
    const laneZ = finite(options.laneZ ?? this.laneZ, "kinematic constraint laneZ");
    const laneHalfWidth = options.laneHalfWidth ?? this.laneHalfWidth;
    const bounds = options.bounds ?? this.bounds;
    const axes: ("x" | "y" | "z")[] = [];
    if (lockDepth) {
      if (Math.abs(this.position[2] - laneZ) > 1e-9) {
        axes.push("z");
      }
      this.position[2] = laneZ;
      this.velocity[2] = 0;
    } else if (laneHalfWidth !== undefined) {
      const clamped = clampAxisWithHalfExtent(this.position[2], laneZ - laneHalfWidth, laneZ + laneHalfWidth, this.halfExtents[2]);
      if (clamped !== this.position[2]) {
        this.position[2] = clamped;
        this.velocity[2] = 0;
        axes.push("z");
      }
    }
    if (bounds) {
      const clampedX = clampAxisWithHalfExtent(this.position[0], bounds.minX, bounds.maxX, this.halfExtents[0]);
      const clampedY = clampAxisWithHalfExtent(this.position[1], bounds.minY, bounds.maxY, this.halfExtents[1]);
      const clampedZ = clampAxisWithHalfExtent(this.position[2], bounds.minZ, bounds.maxZ, this.halfExtents[2]);
      if (clampedX !== this.position[0]) {
        this.position[0] = clampedX;
        this.velocity[0] = 0;
        axes.push("x");
      }
      if (clampedY !== this.position[1]) {
        this.position[1] = clampedY;
        this.velocity[1] = 0;
        axes.push("y");
      }
      if (clampedZ !== this.position[2]) {
        this.position[2] = clampedZ;
        this.velocity[2] = 0;
        axes.push("z");
      }
    }
    if (axes.length > 0) {
      events.push({
        type: "bounds",
        bodyId: this.id,
        axes: uniqueAxes(axes),
        position: cloneVec3(this.position)
      });
    }
    const groundY = finite(options.groundY ?? this.groundY, "kinematic constraint groundY");
    const snapDistance = finiteNonNegative(options.groundSnapDistance ?? this.groundSnapDistance, "kinematic constraint groundSnapDistance");
    const bottom = this.position[1] - this.halfExtents[1];
    if (this.velocity[1] <= 0 && bottom <= groundY + snapDistance) {
      const correctedY = groundY + this.halfExtents[1];
      const snapped = Math.abs(this.position[1] - correctedY) > 1e-9;
      this.position[1] = correctedY;
      this.velocity[1] = 0;
      this.grounded = true;
      if (!wasGrounded) {
        events.push({
          type: "land",
          bodyId: this.id,
          position: cloneVec3(this.position),
          impactSpeed
        });
      } else if (snapped) {
        events.push({
          type: "ground-snap",
          bodyId: this.id,
          position: cloneVec3(this.position)
        });
      }
    } else {
      this.grounded = false;
    }
    return events;
  }

  private drainPendingEvents(): KinematicBodyEvent[] {
    const events = [...this.pendingEvents];
    this.pendingEvents.length = 0;
    return events;
  }
}

function isDescriptor(value: KinematicBodyId | KinematicBodyDescriptor): value is KinematicBodyDescriptor {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBodyId(id: KinematicBodyId): void {
  if (typeof id === "number") {
    if (!Number.isFinite(id)) {
      throw new Error("Kinematic body id number must be finite.");
    }
    return;
  }
  if (id.length === 0) {
    throw new Error("Kinematic body id string cannot be empty.");
  }
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite.`);
  }
  return value;
}

function finiteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative.`);
  }
  return value;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function validatePositiveVec3(value: Vec3, name: string): void {
  validateFiniteVec3(value, name);
  if (value[0] <= 0 || value[1] <= 0 || value[2] <= 0) {
    throw new Error(`${name} must contain finite positive values.`);
  }
}

function approachAxis(current: number, input: number, maxSpeed: number, acceleration: number, friction: number, dt: number): number {
  if (Math.abs(input) > 1e-6) {
    return moveToward(current, input * maxSpeed, acceleration * dt);
  }
  return moveToward(current, 0, friction * dt);
}

function moveToward(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) {
    return target;
  }
  return current + Math.sign(delta) * maxDelta;
}

function clampAxisWithHalfExtent(value: number, min: number | undefined, max: number | undefined, halfExtent: number): number {
  const lower = min === undefined ? -Infinity : min + halfExtent;
  const upper = max === undefined ? Infinity : max - halfExtent;
  if (lower > upper) {
    return (lower + upper) * 0.5;
  }
  return Math.min(upper, Math.max(lower, value));
}

function uniqueAxes(axes: readonly ("x" | "y" | "z")[]): readonly ("x" | "y" | "z")[] {
  const result: ("x" | "y" | "z")[] = [];
  for (const axis of axes) {
    if (!result.includes(axis)) {
      result.push(axis);
    }
  }
  return result;
}
