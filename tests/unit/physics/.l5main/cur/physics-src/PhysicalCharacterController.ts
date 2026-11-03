import type { Vec3 } from "./Shape.js";

/**
 * Contract area 5 — a physical character moving through a collider world.
 *
 * Aura3D's existing character helpers under this area are authored-unit arcade
 * controllers: they resolve against route-authored ledges and make no claim about
 * mass or contact. A platformer that wants grounding, slope limits, auto-step over
 * real geometry and snap-to-ground on descent needs the solver-backed surface, and
 * until now nothing public offered it — so routes hand-rolled kinematic tracing and
 * the visible world and the collision world could drift apart.
 *
 * `move` takes a desired displacement for the step and returns what the solver
 * actually allowed, plus the grounding result. Games must render from `applied` /
 * `position`, never from their own copy of the request, or they reintroduce two
 * transform authorities.
 *
 * The implementation is bridged from `PhysicsWorld`, the only module that reaches
 * the backend.
 */

export interface PhysicsCharacterControllerDescriptor {
  /** Skin width used to keep the character from embedding into geometry. */
  readonly offset?: number;
  /** Step height the character can walk up without jumping. */
  readonly autoStepHeight?: number;
  /** Minimum horizontal room a step needs to be walkable. */
  readonly autoStepMinWidth?: number;
  /** Let the controller push loose dynamic bodies out of the way. */
  readonly autoStepIncludeDynamicBodies?: boolean;
  /** Steepest slope, in radians, the character can stand on. */
  readonly maxSlopeClimbAngle?: number;
  /** Distance the controller snaps down onto ground while descending. */
  readonly snapToGroundDistance?: number;
  /** Steepest slope, in radians, at which the character slides instead of standing still. */
  readonly minSlopeSlideAngle?: number;
  /** Whether the solver may convert an unsupported move into a slope slide. Defaults to true. */
  readonly slideEnabled?: boolean;
  /** Mass, in kilograms, used when the character pushes a dynamic body. */
  readonly characterMass?: number;
  /** Whether the character physically shoves loose dynamic bodies. */
  readonly applyImpulsesToDynamicBodies?: boolean;
}

export interface PhysicsCharacterMovement {
  /** The displacement that was asked for. */
  readonly requested: Vec3;
  /** The displacement actually taken after contacts. Render from this. */
  readonly applied: Vec3;
  readonly grounded: boolean;
  readonly collisions: number;
  /** Authoritative post-step position. */
  readonly position: Vec3;
}

/**
 * A character whose position Rapier owns.
 *
 * The split this encodes is deliberate and is the only one that keeps one transform
 * authority: the *intent* (input plus a gravity integration, in units per second) is
 * authored by the game, and the *result* (where the capsule ends up, whether it is
 * standing, whether a slope is too steep) comes back from the collider solver. A route
 * that also wrote its own position was a second authority, which is exactly how a
 * visible ledge and a collision ledge end up at different heights.
 */
export interface PhysicsCharacterController {
  /** The collider body that represents the character. Must be kinematic. */
  readonly bodyId: number;
  setAutoStep(height: number, minWidth: number, includeDynamicBodies?: boolean): this;
  setMaxSlopeClimbAngle(radians: number): this;
  /** Steepest angle at which the character slides rather than standing still. */
  setMinSlopeSlideAngle(radians: number): this;
  setSnapToGround(distance: number): this;
  /** Turn slope sliding off entirely. On a slope the character then sticks, which is rarely wanted. */
  setSlideEnabled(enabled: boolean): this;
  /** Mass used when the character shoves a loose dynamic body. */
  setCharacterMass(mass: number): this;
  /** Whether touching a dynamic body actually moves it. */
  setApplyImpulsesToDynamicBodies(enabled: boolean): this;
  /**
   * Moves the character by `desired` and reports what the world allowed.
   * Call once per fixed step, then read `position` / `grounded`.
   */
  move(desired: Vec3): PhysicsCharacterMovement;
  position(): Vec3;
  /** Grounding from the last `move`. Never re-queries the solver, so it is safe to call from a HUD. */
  grounded(): boolean;
  /**
   * Teleport and forget the queued kinematic step — a respawn or a reset.
   *
   * Writing only the mesh leaves Rapier's queued translation in flight, which drags
   * the character back toward wherever the pre-respawn movement was headed.
   */
  resetTo(position: Vec3): Vec3;
  dispose(): void;
}
