import type { Vec3 } from "./Keyframe.js";

/** Measured scene transforms, not IK targets. Support coordinates include support rotation. */
export interface LocomotionContactSample {
  readonly time: number;
  readonly side: "left" | "right";
  readonly pointId?: string;
  readonly stance: boolean;
  readonly supportId: string;
  readonly supportLocalPosition: Vec3;
  readonly contactError: number;
}

export interface LocomotionStanceMeasurement {
  readonly side: "left" | "right";
  readonly pointId?: string;
  readonly supportId: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly samples: number;
  readonly maxSlip: number;
  readonly worstContactError: number;
}

/**
 * Measure excursion from touchdown across the entire stance, so many tiny per-frame
 * slips cannot evade a limit. A change of support or a swing ends the interval.
 * The caller retains raw samples and supplies actual support-local ankle positions.
 */
export function measureLocomotionStances(samples: readonly LocomotionContactSample[], rigHeight: number): {
  readonly intervals: readonly LocomotionStanceMeasurement[];
  readonly slipLimit: number;
  readonly maxSlip: number;
  readonly worstContactError: number;
  readonly passed: boolean;
} {
  if (!Number.isFinite(rigHeight) || rigHeight <= 0) throw new Error("Measured rig height must be positive.");
  const intervals: LocomotionStanceMeasurement[] = [];
  const active = new Map<string, { anchor: Vec3; interval: LocomotionStanceMeasurement }>();
  const lastTimes = new Map<string, number>();
  for (const sample of samples) {
    const key = `${sample.side}:${sample.pointId ?? "ankle"}`;
    if (!Number.isFinite(sample.time) || sample.time < 0 ||
      sample.time <= (lastTimes.get(key) ?? -Infinity) ||
      sample.supportLocalPosition.length !== 3 || sample.supportLocalPosition.some(value => !Number.isFinite(value)) ||
      !Number.isFinite(sample.contactError) || sample.contactError < 0 || !sample.supportId) {
      throw new Error("Contact samples require increasing times, finite positions/errors, and a support identity.");
    }
    lastTimes.set(key, sample.time);
    let state = active.get(key);
    if (state && (!sample.stance || sample.supportId !== state.interval.supportId)) {
      intervals.push(state.interval);
      active.delete(key);
      state = undefined;
    }
    if (!sample.stance) continue;
    if (!state) {
      state = { anchor: [...sample.supportLocalPosition], interval: {
        side: sample.side, ...(sample.pointId === undefined ? {} : { pointId: sample.pointId }), supportId: sample.supportId, startTime: sample.time,
        endTime: sample.time, samples: 0, maxSlip: 0, worstContactError: 0
      } };
      active.set(key, state);
    }
    const slip = Math.hypot(...sample.supportLocalPosition.map((value, axis) => value - state!.anchor[axis]!));
    state.interval = { ...state.interval, endTime: sample.time, samples: state.interval.samples + 1,
      maxSlip: Math.max(state.interval.maxSlip, slip),
      worstContactError: Math.max(state.interval.worstContactError, sample.contactError) };
  }
  intervals.push(...[...active.values()].map(state => state.interval));
  const maxSlip = Math.max(0, ...intervals.map(interval => interval.maxSlip));
  const worstContactError = Math.max(0, ...intervals.map(interval => interval.worstContactError));
  const slipLimit = rigHeight * 0.01;
  return { intervals, slipLimit, maxSlip, worstContactError,
    passed: intervals.length > 0 && intervals.every(interval => interval.samples >= 2) && maxSlip <= slipLimit };
}
