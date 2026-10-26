// Aim maths for Aura Links. Yaw 0 is +Z; the shot velocity is (sin yaw, 0, cos yaw) (see sim.ts).

export function wrapAngle(angle: number): number {
  const turn = Math.PI * 2;
  let a = angle % turn;
  if (a > Math.PI) a -= turn;
  else if (a <= -Math.PI) a += turn;
  return a;
}

export function yawToward(from: readonly [number, number], to: readonly [number, number]): number {
  return Math.atan2(to[0] - from[0], to[1] - from[1]);
}

export interface DefaultAimInput {
  readonly ball: readonly [number, number];
  readonly cup: readonly [number, number];
  /** yaw of the hole's first fairway segment, used on the tee of a dogleg */
  readonly lineYaw: number;
  readonly onTee: boolean;
}

/** Where a fresh address points: at the pin, except on a dogleg tee where the pin is hidden behind the corner. */
export function defaultAimYaw(input: DefaultAimInput): number {
  const pin = yawToward(input.ball, input.cup);
  if (!input.onTee) return pin;
  return Math.abs(wrapAngle(pin - input.lineYaw)) > 0.35 ? input.lineYaw : pin;
}

export const AIM_FINE_RATE = 0.22;
const AIM_MIN_RATE = 0.55;
const AIM_MAX_RATE = 2.6;

/** Radians per second for A/D: slow to start, speeds up the longer the key is held, fixed and slow with Shift. */
export function aimRate(heldSeconds: number, fine: boolean): number {
  if (fine) return AIM_FINE_RATE;
  return Math.min(AIM_MAX_RATE, AIM_MIN_RATE + Math.max(0, heldSeconds) * 1.4);
}

/** input: +1 turns left (A), -1 turns right (D). The offset is unbounded and wraps at +-PI. */
export function stepAimOffset(offset: number, input: number, dt: number, heldSeconds: number, fine: boolean): number {
  return wrapAngle(offset + input * aimRate(heldSeconds, fine) * dt);
}

/** Clockwise degrees to rotate an up-pointing arrow so it shows where the pin is relative to the aim. */
export function pinArrowDegrees(aimYaw: number, pinYaw: number): number {
  return (-wrapAngle(pinYaw - aimYaw) * 180) / Math.PI;
}
