/**
 * Gallery Shift thief (PRD GS-04): authored movement on a runtime node plus a
 * dynamic sensor sphere (r 0.3, zero gravity) in the route physics world,
 * positioned every fixed step so exit/laser sensors fire through engine sensor
 * events.
 *
 * Gaits: walk 3.2 / sneak 1.4 / sprint 5.6 m/s with noise radii 3/0/6 m
 * (sneak is silent). Lifting: hold-to-lift 1.2 s with a visible progress
 * value, a movement slow, and a standing noise spike for the whole hold.
 *
 * Real embedded clip names from the typed `showcaseKenneyOobiPlatformerHero`
 * asset drive the AnimationController in main.ts.
 */
import {
  GAIT_SPEED,
  LIFT_HOLD_SECONDS,
  LIFT_INTERACT_RANGE,
  LIFT_MOVE_SCALE,
  LIFT_NOISE_RADIUS,
  NOISE_RADIUS,
  THIEF_RADIUS,
  resolveThiefPosition,
  type FloorLayout,
  type PedestalSpec,
  type SimBody,
  type SolidCircle,
  type SolidRect,
  type Vec2
} from "./floor";

export type ThiefGait = "walk" | "sneak" | "sprint";

/** Real embedded clip names in the typed Oobi platformer hero asset. */
export const THIEF_CLIPS = {
  idle: "idle",
  walk: "walk",
  sneak: "crouch",
  sprint: "sprint",
  lift: "pick-up",
  carry: "holding-both"
} as const;
export type ThiefClipKind = keyof typeof THIEF_CLIPS;

/** Noise sampling cadence while moving (seconds between samples). */
export const NOISE_SAMPLE_SECONDS = 0.35;

export interface NoiseEvent {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly source: "walk" | "sneak" | "sprint" | "lift";
}

export interface ThiefInput {
  /** Normalized movement vector in XZ (already camera/frame aligned). */
  readonly moveX: number;
  readonly moveZ: number;
  /** Shift toggle state and sprint intent are resolved by main.ts. */
  readonly gait: ThiefGait;
  /** Interact held (E). */
  readonly liftHeld: boolean;
}

export interface ThiefState {
  readonly x: number;
  readonly z: number;
  readonly gait: ThiefGait;
  readonly moving: boolean;
  readonly speed: number;
  readonly liftingPedestalId: string | null;
  readonly liftProgress: number;
  readonly carrying: boolean;
  readonly clip: ThiefClipKind;
}

export class ThiefPlayer {
  private xValue: number;
  private zValueValue: number;
  private gaitValue: ThiefGait = "walk";
  private moveXValue = 0;
  private moveZValue = 0;
  private movingValue = false;
  private liftTargetValue: PedestalSpec | null = null;
  private liftProgressValue = 0;
  private carryingValue = false;
  private noiseAccumulator = NOISE_SAMPLE_SECONDS;
  private readonly body: SimBody;

  constructor(
    private readonly layout: FloorLayout,
    private readonly rects: readonly SolidRect[],
    private readonly circles: readonly SolidCircle[],
    body: SimBody,
    spawn: Vec2
  ) {
    this.xValue = spawn.x;
    this.zValueValue = spawn.z;
    this.body = body;
  }

  get x(): number {
    return this.xValue;
  }

  get z(): number {
    return this.zValueValue;
  }

  get gait(): ThiefGait {
    return this.gaitValue;
  }

  get liftingPedestalId(): string | null {
    return this.liftTargetValue ? this.liftTargetValue.id : null;
  }

  get liftProgress(): number {
    return this.liftProgressValue;
  }

  get carrying(): boolean {
    return this.carryingValue;
  }

  setGait(gait: ThiefGait): void {
    this.gaitValue = gait;
  }

  setCarrying(carrying: boolean): void {
    this.carryingValue = carrying;
  }

  /** Test-only debug teleport (README-documented, ?debug=1 gated). */
  teleport(x: number, z: number): void {
    const resolved = resolveThiefPosition(x, z, this.layout, this.rects, this.circles);
    this.xValue = resolved.x;
    this.zValueValue = resolved.z;
    this.liftTargetValue = null;
    this.liftProgressValue = 0;
    this.pushBody();
  }

  /**
   * Advance one fixed step: authored movement with rect/circle pushout, then
   * the kinematic body is woken and positioned so sensor overlaps register in
   * the next world step. Returns emitted noise samples; the completed lift is
   * reported through `takeCompletedLift()`.
   */
  update(dt: number, input: ThiefInput, pedestals: readonly PedestalSpec[]): readonly NoiseEvent[] {
    this.gaitValue = input.gait;
    this.moveXValue = input.moveX;
    this.moveZValue = input.moveZ;
    const inputMagnitude = Math.hypot(input.moveX, input.moveZ);
    this.movingValue = inputMagnitude > 1e-6;

    // Hold-to-lift target selection: nearest unlifted pedestal in range.
    const inRange = pedestals
      .filter((pedestal) => Math.hypot(pedestal.x - this.xValue, pedestal.z - this.zValueValue) <= LIFT_INTERACT_RANGE)
      .sort((a, b) => Math.hypot(a.x - this.xValue, a.z - this.zValueValue) - Math.hypot(b.x - this.xValue, b.z - this.zValueValue));
    if (!input.liftHeld || inRange.length === 0) {
      this.liftTargetValue = null;
      this.liftProgressValue = 0;
    } else if (!this.liftTargetValue || !inRange.some((pedestal) => pedestal.id === this.liftTargetValue!.id)) {
      this.liftTargetValue = inRange[0] ?? null;
      this.liftProgressValue = 0;
    }

    const lifting = this.liftTargetValue !== null;
    const speed = GAIT_SPEED[this.gaitValue] * (lifting ? LIFT_MOVE_SCALE : 1);
    if (this.movingValue) {
      const nx = input.moveX / inputMagnitude;
      const nz = input.moveZ / inputMagnitude;
      const resolved = resolveThiefPosition(this.xValue + nx * speed * dt, this.zValueValue + nz * speed * dt, this.layout, this.rects, this.circles);
      this.xValue = resolved.x;
      this.zValueValue = resolved.z;
    }
    this.pushBody();

    const noises: NoiseEvent[] = [];
    this.noiseAccumulator += dt;
    if (this.noiseAccumulator >= NOISE_SAMPLE_SECONDS) {
      this.noiseAccumulator = 0;
      if (lifting) {
        noises.push({ x: this.xValue, z: this.zValueValue, radius: LIFT_NOISE_RADIUS, source: "lift" });
      } else if (this.movingValue) {
        const radius = NOISE_RADIUS[this.gaitValue];
        if (radius > 0) {
          noises.push({ x: this.xValue, z: this.zValueValue, radius, source: this.gaitValue });
        }
      }
    }

    if (lifting) {
      this.liftProgressValue = Math.min(1, this.liftProgressValue + dt / LIFT_HOLD_SECONDS);
    }
    return noises;
  }

  /** Consume a completed lift (caller awards score/escalation and hides the exhibit). */
  takeCompletedLift(): PedestalSpec | null {
    if (this.liftTargetValue && this.liftProgressValue >= 1) {
      const done = this.liftTargetValue;
      this.liftTargetValue = null;
      this.liftProgressValue = 0;
      this.carryingValue = true;
      return done;
    }
    return null;
  }

  snapshot(): ThiefState {
    const lifting = this.liftTargetValue !== null;
    return {
      x: this.xValue,
      z: this.zValueValue,
      gait: this.gaitValue,
      moving: this.movingValue,
      speed: this.movingValue ? GAIT_SPEED[this.gaitValue] * (lifting ? LIFT_MOVE_SCALE : 1) : 0,
      liftingPedestalId: this.liftTargetValue ? this.liftTargetValue.id : null,
      liftProgress: this.liftProgressValue,
      carrying: this.carryingValue,
      clip: this.activeClip()
    };
  }

  private activeClip(): ThiefClipKind {
    if (this.liftTargetValue) return "lift";
    if (this.carryingValue && this.movingValue) return "carry";
    if (!this.movingValue) return "idle";
    if (this.gaitValue === "sneak") return "sneak";
    if (this.gaitValue === "sprint") return "sprint";
    return "walk";
  }

  private pushBody(): void {
    // Authored movement: wake then position. Zero gravity means no velocity
    // accumulation between steps; the solver never drives this body.
    this.body.wake();
    this.body.setPosition([this.xValue, THIEF_RADIUS, this.zValueValue]);
  }
}
