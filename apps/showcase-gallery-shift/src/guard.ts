/**
 * Gallery Shift guards (PRD GS-06): deterministic waypoint patrols with
 * idle/investigate/alert states, real AnimationController clip switching from
 * the typed robot asset's embedded clips, and an AUTHORED footstep gait.
 *
 * Patrol AI is route-local and deterministic (Turbo opponent-AI precedent): no
 * steering noise, no reaction-time roulette — the same inputs always produce
 * the same patrol. Guard locomotion is authored movement on a runtime node
 * (not a solver body); vision/hearing wiring lives in vision.ts/main.ts.
 *
 * Footstep label honesty: the typed robot asset has no clip-local footstep
 * events, so footsteps are driven by an authored gait phase (distance-based
 * stride cycles), labeled "authored gait" in README/route-health/evidence.
 */
import type { GuardSpawnSpec, Vec2 } from "./floor";
import { escalationWaypoints, guardSpeedAfterLifts } from "./floor";

export type GuardState = "idle" | "investigate" | "alert";

export interface GuardFootstep {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

/** Real embedded clip names from the typed `showcaseExpressiveRobot` asset. */
export const GUARD_CLIPS = {
  idle: "Idle",
  walk: "Walking",
  run: "Running"
} as const;
export type GuardClipKind = keyof typeof GUARD_CLIPS;

/** Stride length (m) per footstep half-cycle of the authored gait. */
export const GUARD_STRIDE_METERS = 0.9;
/** Investigation scan: seconds spent sweeping at the target point. */
export const INVESTIGATE_LINGER_SECONDS = 2.5;
/** Alert gives up after this many seconds without a fresh sighting. */
export const ALERT_GIVE_UP_SECONDS = 4;

export interface GuardUpdateInput {
  readonly dt: number;
  /** Live detection state drives alert transitions (wired by main.ts). */
  readonly detection: number;
  readonly suspiciousThreshold: number;
  readonly alertThreshold: number;
  /** Last seen/noise point for investigate/alert targets. */
  readonly lastSeen: Vec2 | null;
  /** Floor-wide laser burst forces alert toward the trip point. */
  readonly laserAlertPoint: Vec2 | null;
}

export interface GuardSnapshot {
  readonly id: string;
  readonly state: GuardState;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly speed: number;
  readonly clip: GuardClipKind;
  readonly routeLength: number;
  readonly waypointCount: number;
  readonly footstepPhase: number;
}

export class GuardAgent {
  readonly id: string;
  private xValue: number;
  private zValue: number;
  private yawValue: number;
  private stateValue: GuardState = "idle";
  private readonly baseRoute: readonly Vec2[];
  private extraRoute: readonly Vec2[] = [];
  private waypointIndex = 0;
  private readonly baseSpeed: number;
  private liftsValue = 0;
  private target: Vec2 | null = null;
  private lingerSeconds = 0;
  private unseenSeconds = 0;
  private footstepPhaseValue = 0;
  private lastFootstepHalf = 0;

  constructor(spawn: GuardSpawnSpec) {
    this.id = spawn.id;
    this.xValue = spawn.x;
    this.zValue = spawn.z;
    this.baseRoute = spawn.route;
    this.baseSpeed = spawn.baseSpeed;
    this.yawValue = 0;
  }

  get x(): number {
    return this.xValue;
  }

  get z(): number {
    return this.zValue;
  }

  get yaw(): number {
    return this.yawValue;
  }

  get state(): GuardState {
    return this.stateValue;
  }

  get route(): readonly Vec2[] {
    return [...this.baseRoute, ...this.extraRoute];
  }

  get speed(): number {
    if (this.stateValue === "alert") return guardSpeedAfterLifts(this.baseSpeed * 2.1, this.liftsValue);
    if (this.stateValue === "investigate") return guardSpeedAfterLifts(this.baseSpeed * 1.45, this.liftsValue);
    return guardSpeedAfterLifts(this.baseSpeed, this.liftsValue);
  }

  /** Authored gait phase in [0, 1): one full cycle = two footsteps. */
  get footstepPhase(): number {
    return this.footstepPhaseValue;
  }

  /** Deterministic escalation: called by main.ts in lift order. */
  registerLift(liftedPedestalIds: readonly string[]): void {
    this.liftsValue = liftedPedestalIds.length;
    this.extraRoute = escalationWaypoints(liftedPedestalIds);
  }

  /** Noise heard (authored radius test done by caller): investigate the point. */
  hearNoise(point: Vec2): void {
    if (this.stateValue === "alert") return;
    this.stateValue = "investigate";
    this.target = point;
    this.lingerSeconds = 0;
  }

  /** Vision wiring: suspicious sighting while patrol/idle -> investigate. */
  reportSuspicious(point: Vec2): void {
    if (this.stateValue === "alert") return;
    this.stateValue = "investigate";
    this.target = point;
    this.lingerSeconds = 0;
  }

  /** Vision wiring: detection crossed the alert threshold -> hunt last seen. */
  reportAlert(point: Vec2): void {
    this.stateValue = "alert";
    this.target = point;
    this.unseenSeconds = 0;
    this.lingerSeconds = 0;
  }

  reset(spawn: GuardSpawnSpec): void {
    this.xValue = spawn.x;
    this.zValue = spawn.z;
    this.stateValue = "idle";
    this.waypointIndex = 0;
    this.extraRoute = [];
    this.liftsValue = 0;
    this.target = null;
    this.lingerSeconds = 0;
    this.unseenSeconds = 0;
    this.footstepPhaseValue = 0;
    this.lastFootstepHalf = 0;
  }

  /**
   * Advance one fixed step. Movement is authored: straight-line toward the
   * current target (waypoint, investigate point, or last-seen point), snapping
   * the facing yaw to the movement direction. Returns authored footsteps whose
   * gait half-cycle flipped this step.
   */
  update(input: GuardUpdateInput): readonly GuardFootstep[] {
    const dt = input.dt;
    if (input.laserAlertPoint && this.stateValue !== "alert") {
      this.stateValue = "alert";
      this.target = input.laserAlertPoint;
      this.unseenSeconds = 0;
      this.lingerSeconds = 0;
    }
    if (this.stateValue === "idle" && input.detection >= input.suspiciousThreshold && input.lastSeen) {
      this.stateValue = "investigate";
      this.target = input.lastSeen;
      this.lingerSeconds = 0;
    } else if (this.stateValue !== "alert" && input.detection >= input.alertThreshold && input.lastSeen) {
      this.stateValue = "alert";
      this.target = input.lastSeen;
      this.unseenSeconds = 0;
    }

    const route = this.route;
    let moveTarget: Vec2 | null = null;
    if (this.stateValue === "alert") {
      if (input.lastSeen) {
        this.target = input.lastSeen;
        this.unseenSeconds = 0;
      } else {
        this.unseenSeconds += dt;
        if (this.unseenSeconds >= ALERT_GIVE_UP_SECONDS) {
          this.stateValue = this.target ? "investigate" : "idle";
          this.unseenSeconds = 0;
          this.lingerSeconds = 0;
        }
      }
      moveTarget = this.target;
    } else if (this.stateValue === "investigate") {
      moveTarget = this.target;
      if (this.target && this.nearTarget(this.target)) {
        this.lingerSeconds += dt;
        moveTarget = null;
        const sweep = Math.sin((this.lingerSeconds / INVESTIGATE_LINGER_SECONDS) * Math.PI * 2) * (Math.PI / 3);
        this.yawValue = normalize(this.yawTo(this.target) + sweep);
        if (this.lingerSeconds >= INVESTIGATE_LINGER_SECONDS) {
          this.stateValue = "idle";
          this.target = null;
          this.lingerSeconds = 0;
        }
      }
    }
    if (this.stateValue === "idle") {
      if (route.length > 0) {
        moveTarget = route[this.waypointIndex % route.length] ?? null;
        if (moveTarget && this.nearTarget(moveTarget)) {
          this.waypointIndex = (this.waypointIndex + 1) % route.length;
          moveTarget = route[this.waypointIndex] ?? null;
        }
      }
    }

    const footsteps: GuardFootstep[] = [];
    if (moveTarget) {
      const dx = moveTarget.x - this.xValue;
      const dz = moveTarget.z - this.zValue;
      const distance = Math.hypot(dx, dz);
      const speed = this.speed;
      if (distance > 1e-6) {
        const step = Math.min(distance, speed * dt);
        this.xValue += (dx / distance) * step;
        this.zValue += (dz / distance) * step;
        this.yawValue = Math.atan2(dx, dz);
        // Authored gait: phase advances with distance, two footsteps per cycle.
        this.footstepPhaseValue = (this.footstepPhaseValue + step / (GUARD_STRIDE_METERS * 2)) % 1;
        const half = Math.floor(this.footstepPhaseValue * 2);
        if (half !== this.lastFootstepHalf) {
          this.lastFootstepHalf = half;
          footsteps.push({ id: this.id, x: this.xValue, z: this.zValue });
        }
      }
    }
    return footsteps;
  }

  snapshot(): GuardSnapshot {
    return {
      id: this.id,
      state: this.stateValue,
      x: this.xValue,
      z: this.zValue,
      yaw: this.yawValue,
      speed: this.speed,
      clip: this.stateValue === "alert" ? "run" : this.movingClip(),
      routeLength: routeLengthOf(this.route),
      waypointCount: this.route.length,
      footstepPhase: this.footstepPhaseValue
    };
  }

  private movingClip(): GuardClipKind {
    // Investigation walks; idle patrol between waypoints uses the walk clip
    // only while actually traveling (snapshot consumers treat idle-at-point
    // with the idle clip through `state === "idle" && !moving` in main.ts).
    return "walk";
  }

  private nearTarget(point: Vec2): boolean {
    return Math.hypot(point.x - this.xValue, point.z - this.zValue) < 0.12;
  }

  private yawTo(point: Vec2): number {
    return Math.atan2(point.x - this.xValue, point.z - this.zValue);
  }
}

function normalize(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= 2 * Math.PI;
  while (wrapped < -Math.PI) wrapped += 2 * Math.PI;
  return wrapped;
}

function routeLengthOf(route: readonly Vec2[]): number {
  if (route.length < 2) return 0;
  let total = 0;
  for (let index = 0; index < route.length; index += 1) {
    const a = route[index]!;
    const b = route[(index + 1) % route.length]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

/**
 * Authored hearing test (radius check, deterministic): a noise event reaches a
 * guard when inside the noise radius. Labeled authored — the physics facade
 * exposes raycast/sphereCast but no overlap-sphere query.
 */
export function guardHearsNoise(guard: { readonly x: number; readonly z: number }, noise: { readonly x: number; readonly z: number; readonly radius: number }): boolean {
  if (noise.radius <= 0) return false;
  return Math.hypot(noise.x - guard.x, noise.z - guard.z) <= noise.radius;
}
