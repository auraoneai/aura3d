/**
 * Siege Golf shot controller - aim / charge / launch (PRD SG-04, shot.ts row).
 *
 * Built on top of the public mini-golf kit:
 * - games.miniGolfPointerShot(start, end) maps a drag gesture to {vector,power};
 * - games.createMiniGolfState() is kept as a live oracle instance whose shoot()
 *   normalizes aim vectors and clamps power exactly as documented; the route
 *   passes every player input through canonicalShotInput(), which asks the
 *   oracle for its post-clamp aim vector so route shots can never diverge from
 *   the kit's contract. The velocity magnitude law (power * IMPULSE_SCALE /
 *   BALL_MASS) is proven against the live oracle in the unit tests.
 */
import { games } from "@aura3d/engine";
import { MINI_GOLF_BALL_MASS, MINI_GOLF_IMPUSE_SCALE } from "./structures";

export interface ShotInput {
  readonly vector: readonly [number, number];
  readonly power: number;
}

/** Shared oracle instance; throwaway world used only for input canonicalization. */
const oracle = games.createMiniGolfState();

/**
 * Canonicalize a raw input through the public kit: normalize the planar vector
 * and clamp power into the kit's documented range. Returns null when the input
 * is not finite or non-positive.
 */
export function canonicalShotInput(vector: readonly [number, number], power: number): ShotInput | null {
  if (!Number.isFinite(vector[0]) || !Number.isFinite(vector[1])) return null;
  if (!Number.isFinite(power) || power <= 0) return null;
  const metrics = oracle.shoot({ vector: [vector[0], 0, vector[1]], power });
  const aim = metrics.aimVector;
  return { vector: [aim[0], aim[2]], power };
}

/** Launch speed for a canonical power, per the kit's impulse law. */
export function launchSpeed(power: number): number {
  return power * MINI_GOLF_IMPUSE_SCALE / MINI_GOLF_BALL_MASS;
}

/** Drag-gesture mapping straight from the public kit, with a route-local
 *  minimum travel so an accidental tap never launches a full default shot. */
export const MIN_DRAG_PIXELS = 12;

export function pointerShot(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number }
): ShotInput | null {
  if (Math.hypot(end.x - start.x, end.y - start.y) < MIN_DRAG_PIXELS) return null;
  const mapped = games.miniGolfPointerShot({ x: start.x, y: start.y }, { x: end.x, y: end.y });
  const v = mapped.vector;
  if (v[0] === 0 && v[2] === 0) return null;
  const planar: readonly [number, number] = [-v[0], v[2]];
  return canonicalShotInput(planar, mapped.power);
}

export type ChargePhase = "idle" | "charging" | "struck";

export interface AimState {
  readonly phase: ChargePhase;
  /** Radians offset from the hole aim; positive veers left (+X). */
  readonly angle: number;
  /** 0..1 charge fraction while charging; 0 otherwise. */
  readonly charge: number;
  readonly minAngle: number;
  readonly maxAngle: number;
}

export interface StrikeResult {
  readonly input: ShotInput;
  readonly speed: number;
}

/**
 * Route-local aim + charge state machine. Keyboard: arrows rotate the aim by
 * AIM_STEP radians, Space charges at a fixed rate per second, release/J strikes.
 * Charge is strictly monotonic in hold time, so the meter is never theater.
 */
export class ShotController {
  private phaseValue: ChargePhase = "idle";
  private angleValue = 0;
  private chargeValue = 0;
  private baseDir: readonly [number, number] = [0, -1];
  private readonly minAngle: number;
  private readonly maxAngle: number;
  private readonly maxPower: number;
  private readonly minPower: number;
  private readonly chargeSeconds: number;

  constructor(options: { readonly maxPower?: number; readonly chargeSeconds?: number } = {}) {
    this.maxAngle = Math.PI / 3;
    this.minAngle = -Math.PI / 3;
    // The kit clamps power at 2.4; stay inside that ceiling.
    this.maxPower = Math.min(2.4, options.maxPower ?? 2.3);
    this.minPower = 0.55;
    this.chargeSeconds = options.chargeSeconds ?? 1.15;
  }

  get state(): AimState {
    return {
      phase: this.phaseValue,
      angle: this.angleValue,
      charge: this.phaseValue === "charging" ? this.chargeValue : 0,
      minAngle: this.minAngle,
      maxAngle: this.maxAngle
    };
  }

  get charging(): boolean {
    return this.phaseValue === "charging";
  }

  beginCharge(): void {
    if (this.phaseValue === "struck") return;
    this.phaseValue = "charging";
    this.chargeValue = 0;
  }

  updateCharge(dt: number): void {
    if (this.phaseValue !== "charging") return;
    this.chargeValue = Math.min(1, this.chargeValue + Math.max(0, dt) / this.chargeSeconds);
  }

  cancelCharge(): void {
    if (this.phaseValue === "charging") {
      this.phaseValue = "idle";
      this.chargeValue = 0;
    }
  }

  aimBy(deltaRadians: number): void {
    this.angleValue = Math.min(this.maxAngle, Math.max(this.minAngle, this.angleValue + deltaRadians));
  }

  /** Player-facing precision dial used for deliberate puzzle solutions. */
  aimTo(angleRadians: number): void {
    if (!Number.isFinite(angleRadians)) return;
    this.angleValue = Math.min(this.maxAngle, Math.max(this.minAngle, angleRadians));
  }

  resetAim(): void {
    this.angleValue = 0;
  }

  /** Re-anchor the aim cone on a new hole's authored aim line. */
  loadHole(aim: readonly [number, number]): void {
    const length = Math.hypot(aim[0], aim[1]) || 1;
    this.baseDir = [aim[0] / length, aim[1] / length];
    this.angleValue = 0;
    this.phaseValue = "idle";
    this.chargeValue = 0;
  }

  strike(): StrikeResult | null {
    if (this.phaseValue !== "charging") return null;
    const fraction = Math.max(this.chargeValue, 0.12);
    const power = this.minPower + (this.maxPower - this.minPower) * fraction;
    // Aim angle -> direction around the hole's base aim line.
    const cos = Math.cos(this.angleValue);
    const sin = Math.sin(this.angleValue);
    const dx = this.baseDir[0] * cos - this.baseDir[1] * sin;
    const dz = this.baseDir[1] * cos + this.baseDir[0] * sin;
    const canonical = canonicalShotInput([dx, dz], power);
    if (!canonical) return null;
    this.phaseValue = "struck";
    this.chargeValue = 0;
    return { input: canonical, speed: launchSpeed(canonical.power) };
  }

  /** Strike at the exact power selected on the precision dial. */
  strikeAtPower(power: number): StrikeResult | null {
    if (this.phaseValue === "struck" || !Number.isFinite(power)) return null;
    const cos = Math.cos(this.angleValue);
    const sin = Math.sin(this.angleValue);
    const dx = this.baseDir[0] * cos - this.baseDir[1] * sin;
    const dz = this.baseDir[1] * cos + this.baseDir[0] * sin;
    const canonical = canonicalShotInput([dx, dz], Math.min(this.maxPower, Math.max(this.minPower, power)));
    if (!canonical) return null;
    this.phaseValue = "struck";
    this.chargeValue = 0;
    return { input: canonical, speed: launchSpeed(canonical.power) };
  }

  armNextShot(): void {
    if (this.phaseValue === "struck") this.phaseValue = "idle";
  }

  /** Touch path: full drag defines both direction and power in one gesture. */
  strikeFromDrag(start: { readonly x: number; readonly y: number }, end: { readonly x: number; readonly y: number }): StrikeResult | null {
    const mapped = pointerShot(start, end);
    if (!mapped) return null;
    this.phaseValue = "struck";
    this.angleValue = Math.atan2(mapped.vector[0], -mapped.vector[1]) * -1;
    return { input: mapped, speed: launchSpeed(mapped.power) };
  }
}
