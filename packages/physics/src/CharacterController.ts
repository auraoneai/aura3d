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
  /**
   * Tallest ledge the character walks up without jumping, in world units.
   *
   * Without this a capsule stops dead at a kerb: the solver sees a vertical wall and
   * pushes back. Every platformer needs it, because level geometry is full of small steps
   * that a player expects to walk over rather than jump.
   */
  readonly maxStepHeight?: number | undefined;
  /**
   * Snap distance when walking off a small ledge, in world units.
   *
   * Without step-down a character walking down stairs launches off each edge and
   * repeatedly loses `grounded`, which breaks coyote time, footstep audio and any state
   * machine keyed on being on the floor.
   */
  readonly stepDownDistance?: number | undefined;
  /** Slide along a wall instead of stopping when movement is blocked. Defaults to true. */
  readonly wallSlide?: boolean | undefined;
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
  /** Height the character was lifted this step to clear a ledge. Zero when flat. */
  readonly steppedUp: number;
  /** Distance the character was snapped down this step to stay on a descending surface. */
  readonly steppedDown: number;
  /** True when horizontal motion was redirected along a wall rather than stopped. */
  readonly wallSliding: boolean;
  /** True when the head struck geometry, so upward velocity was cancelled. */
  readonly ceilingHit: boolean;
  /** Slope angle under the character in radians. Zero on flat ground. */
  readonly slopeAngle: number;
  /** True when standing on a surface steeper than `maxSlopeAngleRadians`. */
  readonly onSteepSlope: boolean;
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
  readonly maxStepHeight: number;
  readonly stepDownDistance: number;
  readonly wallSlide: boolean;
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
    jumpedThisFrame: false,
    steppedUp: 0,
    steppedDown: 0,
    wallSliding: false,
    ceilingHit: false,
    slopeAngle: 0,
    onSteepSlope: false
  };

  constructor(private readonly world: PhysicsWorld, descriptor: CharacterControllerDescriptor = {}) {
    this.radius = positiveFinite(descriptor.radius ?? 0.24, "character radius");
    this.halfHeight = positiveFinite(descriptor.halfHeight ?? 0.38, "character halfHeight");
    this.maxSpeed = positiveFinite(descriptor.maxSpeed ?? 3.5, "character maxSpeed");
    this.acceleration = positiveFinite(descriptor.acceleration ?? 32, "character acceleration");
    this.jumpSpeed = positiveFinite(descriptor.jumpSpeed ?? 4.2, "character jumpSpeed");
    this.groundProbeDistance = positiveFinite(descriptor.groundProbeDistance ?? 0.12, "character groundProbeDistance");
    this.maxSlopeAngleRadians = positiveFinite(descriptor.maxSlopeAngleRadians ?? Math.PI / 3, "character maxSlopeAngleRadians");
    // Default step height is a third of the capsule's total height: tall enough for kerbs
    // and stair treads, short enough that a character cannot walk up a wall.
    this.maxStepHeight = Math.max(0, descriptor.maxStepHeight ?? (this.halfHeight + this.radius) * 0.34);
    this.stepDownDistance = Math.max(0, descriptor.stepDownDistance ?? this.maxStepHeight);
    this.wallSlide = descriptor.wallSlide ?? true;
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
      jumpedThisFrame: false,
      steppedUp: 0,
      steppedDown: 0,
      wallSliding: false,
      ceilingHit: false,
      slopeAngle: 0,
      onSteepSlope: false
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

    /*
     * Wall slide: redirect blocked motion along the surface instead of stopping.
     *
     * Without this a capsule pressed into a wall at an angle loses all its speed, because
     * the solver cancels the whole velocity rather than only the component into the wall.
     * The player feels it as sticking on geometry they are trying to run past. Removing
     * only the normal component is the standard fix and is what "slide" means.
     */
    let wallSliding = false;
    const horizontalSpeed = Math.hypot(nextVelocity[0], nextVelocity[2]);
    // Captured before wall slide mutates nextVelocity; step-up needs the original intent.
    const intendedDirection: Vec3 = horizontalSpeed > 1e-6
      ? [nextVelocity[0] / horizontalSpeed, 0, nextVelocity[2] / horizontalSpeed]
      : [0, 0, 0];
    if (horizontalSpeed > 1e-4) {
      const direction: Vec3 = [nextVelocity[0] / horizontalSpeed, 0, nextVelocity[2] / horizontalSpeed];
      const wall = this.castHorizontal(direction, this.radius * 0.6);
      if (wall && Math.abs(wall.normal[1]) < 0.5) {
        if (this.wallSlide) {
          const into = nextVelocity[0] * wall.normal[0] + nextVelocity[2] * wall.normal[2];
          if (into < 0) {
            nextVelocity[0] -= wall.normal[0] * into;
            nextVelocity[2] -= wall.normal[2] * into;
            wallSliding = true;
          }
        } else {
          nextVelocity[0] = 0;
          nextVelocity[2] = 0;
        }
      }
    }

    /*
     * Step up: lift over a ledge no taller than `maxStepHeight`.
     *
     * A capsule has no notion of a stair. Presented with a kerb it sees a vertical wall and
     * stops, so a character walks into level geometry a player expects to stride over. The
     * test is: is the obstacle ahead low enough, and is there room above it to stand?
     */
    let steppedUp = 0;
    if (ground.grounded && this.maxStepHeight > 0 && horizontalSpeed > 1e-4) {
      /*
       * Use the *intended* direction, captured before the wall slide ran.
       *
       * Wall slide removes the component into the surface. Walking straight at a kerb that
       * means the whole horizontal velocity is removed, so reading `nextVelocity` here
       * found ~0 and the length guard skipped step-up entirely — the character stood
       * against a climbable ledge forever. A character trying to walk into a step should
       * step up precisely *because* its motion was blocked.
       */
      const direction: Vec3 = [
        intendedDirection[0],
        0,
        intendedDirection[2]
      ];
      {
        const blocked = this.castHorizontal(direction, this.radius * 0.6);
        if (blocked && Math.abs(blocked.normal[1]) < 0.5) {
          const stepTarget = this.probeStepSurface(direction, blocked.distance);
          if (stepTarget !== undefined) {
            const rise = stepTarget - (this.body.position[1] - this.halfHeight - this.radius);
            if (rise > 1e-4 && rise <= this.maxStepHeight) {
              this.body.setPosition([
                this.body.position[0],
                this.body.position[1] + rise,
                this.body.position[2]
              ]);
              steppedUp = rise;
              // The obstacle is cleared, so the wall-slide redirect no longer applies.
              wallSliding = false;
            }
          }
        }
      }
    }

    /*
     * Step down: stay glued to a descending surface within `stepDownDistance`.
     *
     * Without this, walking down stairs launches the character off every edge: it leaves
     * the ground, falls, lands, and repeats. `grounded` flickers, which breaks coyote time,
     * footstep audio and any state machine keyed on standing on the floor.
     */
    let steppedDown = 0;
    if (!ground.grounded && !jumpedThisFrame && this.stepDownDistance > 0 && nextVelocity[1] <= 0 && this.state.grounded) {
      const below = this.probeGroundAt(this.stepDownDistance + this.radius);
      if (below.grounded && below.distance !== undefined && below.distance <= this.stepDownDistance) {
        this.body.setPosition([
          this.body.position[0],
          this.body.position[1] - below.distance,
          this.body.position[2]
        ]);
        steppedDown = below.distance;
        nextVelocity[1] = 0;
      }
    }

    if (this.jumpQueued && (ground.grounded || steppedDown > 0)) {
      nextVelocity[1] = this.jumpSpeed;
      jumpedThisFrame = true;
    }
    this.jumpQueued = false;

    /*
     * Ceiling: cancel upward velocity when the head is blocked.
     *
     * A jump into a low ceiling otherwise keeps its upward velocity and the character
     * hovers against the geometry for the rest of the rise, then drops — which reads as
     * sticking to the roof.
     */
    let ceilingHit = false;
    if (nextVelocity[1] > 0) {
      const headOrigin: Vec3 = [
        this.body.position[0],
        this.body.position[1] + this.halfHeight,
        this.body.position[2]
      ];
      const above = this.world.sphereCast(headOrigin, this.radius * 0.9, [0, 1, 0], {
        maxDistance: this.radius * 0.5,
        includeSensors: false,
      // Never detect our own capsule: a self-hit at distance 0 reads as a wall.
      ignoreBodies: [this.body.id],
        ...(this.collisionMask === undefined ? {} : { mask: this.collisionMask })
      });
      if (above && above.normal[1] < -0.3) {
        nextVelocity[1] = 0;
        ceilingHit = true;
      }
    }

    const grounded = (ground.grounded || steppedDown > 0) && !jumpedThisFrame;
    // Slope angle from the ground normal, so gameplay can react to a hill without
    // re-deriving it from a raycast the controller already did.
    const slopeAngle = grounded ? Math.acos(Math.min(1, Math.max(-1, ground.normal[1]))) : 0;

    this.body.setVelocity(nextVelocity);
    this.state = {
      grounded,
      groundNormal: ground.normal,
      groundColliderId: ground.colliderId,
      desiredVelocity,
      velocity: [...nextVelocity],
      speed: Math.hypot(nextVelocity[0], nextVelocity[2]),
      jumpedThisFrame,
      steppedUp,
      steppedDown,
      wallSliding,
      ceilingHit,
      slopeAngle,
      onSteepSlope: ground.steep === true
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

  /** Horizontal sweep ahead of the capsule's mid-section, for wall and ledge detection. */
  private castHorizontal(direction: Vec3, distance: number): { readonly normal: Vec3; readonly distance: number } | undefined {
    /*
     * Probe just above the capsule's base, not above step height.
     *
     * An earlier version placed this at `base + maxStepHeight`, reasoning that a kerb
     * should not be mistaken for a wall. That put the probe *above* every obstacle it was
     * meant to find: with a 0.2 capsule and a 0.25 step height the probe sat at y=1.049
     * while the 0.18-unit ledge topped out at 0.68, so it reported no obstacle at all and
     * the character walked into the ledge and stopped without ever seeing it.
     *
     * The correct division of labour is: this probe finds *anything* ahead, and
     * `probeStepSurface` decides whether it is short enough to climb. Classifying the
     * obstacle is the step probe's job, not the wall probe's.
     */
    const probeRadius = this.radius * 0.7;
    /*
     * The sweep sphere must sit entirely above the floor the character stands on.
     *
     * At `base + 0.6r` with a `0.85r` sphere the sphere's underside reaches `base - 0.25r`
     * — below the floor — so the sweep detected the ground itself as a wall. The character
     * then believed it was permanently against an obstacle and never moved, at any
     * position, on flat ground.
     *
     * Offset by slightly more than the probe radius so the sphere clears the surface, and
     * keep the probe low enough to still see a kerb.
     */
    const origin: Vec3 = [
      this.body.position[0],
      this.body.position[1] - this.halfHeight - this.radius + probeRadius * 1.15,
      this.body.position[2]
    ];
    /*
     * Reach must cover the capsule's own radius plus the requested margin.
     *
     * A sweep of radius 0.85r starting at the centre only extends 0.85r + distance. With a
     * 0.12 margin that is 0.29 for a 0.2 capsule — but geometry the capsule is already
     * touching sits at exactly r, so a wall in contact was *behind* the sweep's reach and
     * reported no hit. The character walked into the ledge and stopped without ever seeing
     * it, which is indistinguishable from the bug this method exists to fix.
     */
    const hit = this.world.sphereCast(origin, probeRadius, direction, {
      maxDistance: this.radius + distance,
      includeSensors: false,
      // Never detect our own capsule: a self-hit at distance 0 reads as a wall.
      ignoreBodies: [this.body.id],
      ...(this.collisionMask === undefined ? {} : { mask: this.collisionMask })
    });
    if (!hit) return undefined;
    return { normal: orientAgainst(normalizeVec3(hit.normal), direction), distance: hit.distance };
  }

  /**
   * Surface height just past an obstacle, or undefined when there is nothing to stand on.
   *
   * Probes downward from above the maximum step height at a point slightly ahead of the
   * capsule. If it finds a walkable surface, that height is the top of the step.
   */
  private probeStepSurface(direction: Vec3, obstacleDistance: number): number | undefined {
    /*
     * Probe just past the obstacle the wall sweep actually found.
     *
     * A fixed `1.1 * radius` lookahead was wrong whenever the wall sweep triggered further
     * out than that: the character halted 0.246 units from a ledge while the step probe
     * sampled only 0.22 ahead, so it measured the *low* floor it was already standing on,
     * computed a rise of ~0, and never stepped. Deriving the lookahead from the measured
     * obstacle distance keeps the two probes consistent by construction.
     */
    const ahead = Math.max(this.radius * 1.1, obstacleDistance + this.radius * 0.85);
    const origin: Vec3 = [
      this.body.position[0] + direction[0] * ahead,
      this.body.position[1] - this.halfHeight - this.radius + this.maxStepHeight + this.radius,
      this.body.position[2] + direction[2] * ahead
    ];
    const hit = this.world.raycast(origin, [0, -1, 0], {
      maxDistance: this.maxStepHeight + this.radius * 2,
      includeSensors: false,
      // Never detect our own capsule: a self-hit at distance 0 reads as a wall.
      ignoreBodies: [this.body.id],
      ...(this.collisionMask === undefined ? {} : { mask: this.collisionMask })
    });
    if (!hit) return undefined;
    /*
     * Orient the normal against the ray before judging walkability.
     *
     * A raycast returns the face normal unoriented, so a downward ray landing on the top
     * face of a box can report [0,-1,0]. Testing that raw value against cos(maxSlope)
     * rejected every legitimate step: the top of a kerb looked like a ceiling.
     */
    const normal = orientAgainst(normalizeVec3(hit.normal), [0, -1, 0]);
    // A step is only a step if its top is walkable; a steep face is a wall.
    if (normal[1] < Math.cos(this.maxSlopeAngleRadians)) return undefined;
    return hit.point[1];
  }

  /** Ground probe with a caller-supplied reach, used by step-down. */
  private probeGroundAt(maxDistance: number): {
    readonly grounded: boolean;
    readonly normal: Vec3;
    readonly colliderId: number | null;
    readonly distance?: number | undefined;
  } {
    const origin: Vec3 = [
      this.body.position[0],
      this.body.position[1] - this.halfHeight + this.groundProbeDistance,
      this.body.position[2]
    ];
    const hit = this.world.sphereCast(origin, this.radius * 0.92, [0, -1, 0], {
      maxDistance,
      includeSensors: false,
      // Never detect our own capsule: a self-hit at distance 0 reads as a wall.
      ignoreBodies: [this.body.id],
      ...(this.collisionMask === undefined ? {} : { mask: this.collisionMask })
    });
    const minGroundNormalY = Math.cos(this.maxSlopeAngleRadians);
    if (!hit) return { grounded: false, normal: [0, 1, 0], colliderId: null };
    /*
     * Orient before judging walkability, not after.
     *
     * A sweep against a box returns the face normal unoriented, so a downward probe onto a
     * flat floor reports [0,-1,0]. Comparing that raw value to cos(maxSlope) rejects the
     * floor: -1 < 0.5. The character stood on a solid surface and reported grounded:false
     * for every frame, which disabled jumping, step-up and step-down at once.
     */
    const normal = orientAgainst(normalizeVec3(hit.normal), [0, -1, 0]);
    if (normal[1] < minGroundNormalY) {
      return { grounded: false, normal, colliderId: hit.colliderId };
    }
    return {
      grounded: true,
      normal,
      colliderId: hit.colliderId,
      distance: Math.max(0, hit.distance - this.groundProbeDistance)
    };
  }

  private probeGround(): { readonly grounded: boolean; readonly normal: Vec3; readonly colliderId: number | null; readonly steep?: boolean | undefined } {
    const origin: Vec3 = [
      this.body.position[0],
      this.body.position[1] - this.halfHeight + this.groundProbeDistance,
      this.body.position[2]
    ];
    const hit = this.world.sphereCast(origin, this.radius * 0.92, [0, -1, 0], {
      maxDistance: this.groundProbeDistance + this.radius * 0.35,
      includeSensors: false,
      // Never detect our own capsule: a self-hit at distance 0 reads as a wall.
      ignoreBodies: [this.body.id],
      ...(this.collisionMask === undefined ? {} : { mask: this.collisionMask })
    });
    const minGroundNormalY = Math.cos(this.maxSlopeAngleRadians);
    if (!hit) {
      return { grounded: false, normal: [0, 1, 0], colliderId: null };
    }
    // Orient before the walkability test; see probeGroundAt for why this matters.
    const oriented = orientAgainst(normalizeVec3(hit.normal), [0, -1, 0]);
    if (oriented[1] < minGroundNormalY) {
      /*
       * Too steep to stand on, but still report the real normal.
       *
       * Returning world up here discarded the information a caller needs to slide down a
       * slope, and made a steep face indistinguishable from open air.
       */
      return { grounded: false, normal: oriented, colliderId: hit.colliderId, steep: true };
    }
    return { grounded: true, normal: oriented, colliderId: hit.colliderId };
  }
}

/**
 * Flip a normal so it faces back along the query direction.
 *
 * Raycasts and sweeps report a face's own normal, which may point either way depending on
 * winding. Callers almost always want the side they hit from.
 */
function orientAgainst(normal: Vec3, direction: Vec3): Vec3 {
  const facing = normal[0] * direction[0] + normal[1] * direction[1] + normal[2] * direction[2];
  return facing > 0 ? [-normal[0], -normal[1], -normal[2]] : normal;
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
