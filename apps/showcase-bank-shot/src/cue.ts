/**
 * Bank Shot cue controller (PRD BS-06): aim, contact point, charge, strike.
 *
 * Route-local aim state machine: A/D rotate the aim around the cue ball (full
 * circle), W/S set the authored contact point (top/draw), Space charges with a
 * sweet zone, release strikes. The table owns the actual impulse (see table.ts
 * strike()); this module only produces { angle, power, spin }.
 *
 * The sweep preview is geometric over live ball positions and the rail lines —
 * the same math the live route drives through the physics world's sphereCast
 * (table.ts sweepFromCue); kept pure here so unit tests pin it.
 */

export const AIM_STEP = 0.028;
export const SPIN_STEP = 0.02;
export const CHARGE_SECONDS = 1.1;
/** Minimum power fraction (a sub-frame tap still strikes softly). */
export const MIN_POWER = 0.12;
/** Release inside this charge window for the sweet-zone bonus flag. */
export const SWEET_ZONE: readonly [number, number] = [0.72, 0.9];

/** Strike speed law (m/s): power 0.12 -> 1.2, power 1 -> 5.2. */
export const STRIKE_MIN_SPEED = 1.2;
export const STRIKE_MAX_SPEED = 5.2;

export function strikeSpeedFor(power: number): number {
  const clamped = Math.min(1, Math.max(MIN_POWER, power));
  return STRIKE_MIN_SPEED + ((clamped - MIN_POWER) / (1 - MIN_POWER)) * (STRIKE_MAX_SPEED - STRIKE_MIN_SPEED);
}

export interface CueState {
  /** Aim angle in radians around the cue ball; 0 = +X (toward the rack). */
  readonly aimAngle: number;
  /** Authored contact point: -1 draw .. 0 center .. +1 top. */
  readonly spin: number;
  readonly charge: number;
  readonly charging: boolean;
  readonly inSweetZone: boolean;
}

export interface StrikeCommand {
  readonly angle: number;
  readonly power: number;
  readonly spin: number;
  readonly sweetZone: boolean;
}

export class CueController {
  private aimAngleValue = 0;
  private spinValue = 0;
  private chargeValue = 0;
  private chargingValue = false;

  get aimAngle(): number {
    return this.aimAngleValue;
  }

  get spin(): number {
    return this.spinValue;
  }

  aimBy(deltaRadians: number): void {
    this.aimAngleValue = (this.aimAngleValue + deltaRadians) % (Math.PI * 2);
    if (this.aimAngleValue > Math.PI) this.aimAngleValue -= Math.PI * 2;
    if (this.aimAngleValue < -Math.PI) this.aimAngleValue += Math.PI * 2;
  }

  spinBy(delta: number): void {
    this.spinValue = Math.min(1, Math.max(-1, this.spinValue + delta));
  }

  beginCharge(): void {
    if (this.chargingValue) return;
    this.chargingValue = true;
    this.chargeValue = 0;
  }

  updateCharge(dt: number): void {
    if (!this.chargingValue) return;
    this.chargeValue = Math.min(1, this.chargeValue + Math.max(0, dt) / CHARGE_SECONDS);
  }

  cancelCharge(): void {
    this.chargingValue = false;
    this.chargeValue = 0;
  }

  get charging(): boolean {
    return this.chargingValue;
  }

  /** Release: the command to strike with, or null when not charging. */
  strike(): StrikeCommand | null {
    if (!this.chargingValue) return null;
    const charge = Math.max(MIN_POWER, this.chargeValue);
    this.chargingValue = false;
    this.chargeValue = 0;
    return {
      angle: this.aimAngleValue,
      power: charge,
      spin: this.spinValue,
      sweetZone: charge >= SWEET_ZONE[0] && charge <= SWEET_ZONE[1]
    };
  }

  state(): CueState {
    return {
      aimAngle: this.aimAngleValue,
      spin: this.spinValue,
      charge: this.chargingValue ? this.chargeValue : 0,
      charging: this.chargingValue,
      inSweetZone: this.chargingValue && this.chargeValue >= SWEET_ZONE[0] && this.chargeValue <= SWEET_ZONE[1]
    };
  }
}

// ---- sweep preview -------------------------------------------------------------

export interface PreviewBall {
  readonly number: number;
  readonly x: number;
  readonly z: number;
  readonly live: boolean;
}

export interface SweepPreview {
  /** Where the aim ray ends: the ghost-ball center at first contact (or rail). */
  readonly ghostX: number;
  readonly ghostZ: number;
  readonly kind: "ball" | "cushion" | "none";
  readonly ballNumber: number | null;
  /** Direction the struck object ball would travel (unit), when kind === "ball". */
  readonly objectDirX: number;
  readonly objectDirZ: number;
  /** Bank preview: reflected direction off the first cushion, when kind === "cushion". */
  readonly bankDirX: number;
  readonly bankDirZ: number;
}

export interface SweepBounds {
  readonly halfX: number;
  readonly halfZ: number;
}

/**
 * 2D sphere sweep from the cue ball along the aim angle against live balls and
 * the cushion faces. Returns the ghost-ball contact position, the struck ball's
 * departure direction, or the cushion reflection for the bank preview line.
 */
export function sweepPreviewGeometric(
  cueX: number,
  cueZ: number,
  angle: number,
  balls: readonly PreviewBall[],
  ballRadius: number,
  bounds: SweepBounds
): SweepPreview {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);

  // First ball contact: smallest t where |cue + t*d - ball| = 2r (ghost ball).
  let bestT = Infinity;
  let bestBall: PreviewBall | null = null;
  for (const ball of balls) {
    if (!ball.live || ball.number === 0) continue;
    const ox = ball.x - cueX;
    const oz = ball.z - cueZ;
    const along = ox * dx + oz * dz;
    if (along <= 0) continue;
    const perp2 = ox * ox + oz * oz - along * along;
    const rr = (2 * ballRadius) * (2 * ballRadius);
    if (perp2 > rr) continue;
    const t = along - Math.sqrt(rr - perp2);
    if (t >= 0 && t < bestT) {
      bestT = t;
      bestBall = ball;
    }
  }

  // Rail hit distance: the cue center can approach a rail face to `ballRadius`.
  let railT = Infinity;
  let railNormal: readonly [number, number] = [0, 0];
  const limits: { t: number; normal: readonly [number, number] }[] = [];
  if (dx > 0) limits.push({ t: (bounds.halfX - ballRadius - cueX) / dx, normal: [-1, 0] });
  if (dx < 0) limits.push({ t: (-bounds.halfX + ballRadius - cueX) / dx, normal: [1, 0] });
  if (dz > 0) limits.push({ t: (bounds.halfZ - ballRadius - cueZ) / dz, normal: [0, -1] });
  if (dz < 0) limits.push({ t: (-bounds.halfZ + ballRadius - cueZ) / dz, normal: [0, 1] });
  for (const limit of limits) {
    if (limit.t >= 0 && limit.t < railT) {
      railT = limit.t;
      railNormal = limit.normal;
    }
  }

  if (bestBall && bestT <= railT) {
    const ghostX = cueX + dx * bestT;
    const ghostZ = cueZ + dz * bestT;
    const len = Math.hypot(bestBall.x - ghostX, bestBall.z - ghostZ) || 1;
    return {
      ghostX,
      ghostZ,
      kind: "ball",
      ballNumber: bestBall.number,
      objectDirX: (bestBall.x - ghostX) / len,
      objectDirZ: (bestBall.z - ghostZ) / len,
      bankDirX: 0,
      bankDirZ: 0
    };
  }
  if (railT < Infinity) {
    const ghostX = cueX + dx * railT;
    const ghostZ = cueZ + dz * railT;
    const dot = dx * railNormal[0] + dz * railNormal[1];
    return {
      ghostX,
      ghostZ,
      kind: "cushion",
      ballNumber: null,
      objectDirX: 0,
      objectDirZ: 0,
      bankDirX: dx - 2 * dot * railNormal[0],
      bankDirZ: dz - 2 * dot * railNormal[1]
    };
  }
  return {
    ghostX: cueX + dx * 2,
    ghostZ: cueZ + dz * 2,
    kind: "none",
    ballNumber: null,
    objectDirX: 0,
    objectDirZ: 0,
    bankDirX: 0,
    bankDirZ: 0
  };
}
