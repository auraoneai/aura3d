/**
 * Camera feel — brief damped camera punch on quad clears and level-ups (BF-A4).
 *
 * The punch mutates the route's owned camera spec offsets each frame, exactly like
 * the Skyline Runner shake discipline: no renderer internals, no DOM transform —
 * the scene camera itself moves. Under `prefers-reduced-motion` the punch never
 * arms and the proof records the suppression instead.
 */
export interface CameraFeelProof {
  readonly punchesFired: number;
  readonly punchActive: boolean;
  readonly lastPunchStrength: number;
  readonly biggestPunchStrength: number;
  readonly levelUpPunchSeen: boolean;
  readonly quadPunchSeen: boolean;
  readonly reducedMotionSuppressionCount: number;
}

export interface CameraSpecLike {
  position?: readonly [number, number, number];
  target?: readonly [number, number, number];
}

export interface CameraFeelController {
  /** Arms a punch of the given strength (1 = normal, >1 for quads). */
  readonly punch: (strength: number, cause: "quad" | "level-up") => void;
  /** Advances decay; call once per frame with the frame dt. */
  readonly update: (dt: number) => void;
  /** Re-applies base framing plus the live punch offset to the owned spec. */
  readonly apply: (cameraSpec: CameraSpecLike) => void;
  readonly proof: () => CameraFeelProof;
}

const PUNCH_DURATION = 0.34;

export function createCameraFeel(options: {
  reducedMotion: boolean;
  basePosition: readonly [number, number, number];
  baseTarget: readonly [number, number, number];
}): CameraFeelController {
  const { reducedMotion, basePosition, baseTarget } = options;
  let remaining = 0;
  let strength = 0;
  let cause: "quad" | "level-up" | null = null;
  let punchesFired = 0;
  let lastPunchStrength = 0;
  let biggestPunchStrength = 0;
  let levelUpPunchSeen = false;
  let quadPunchSeen = false;
  let reducedMotionSuppressionCount = 0;

  return {
    punch(nextStrength, nextCause) {
      if (!Number.isFinite(nextStrength) || nextStrength <= 0) return;
      if (reducedMotion) {
        reducedMotionSuppressionCount += 1;
        lastPunchStrength = nextStrength;
        if (nextCause === "quad") quadPunchSeen = true;
        if (nextCause === "level-up") levelUpPunchSeen = true;
        return;
      }
      punchesFired += 1;
      strength = Math.max(strength, Math.min(2.5, nextStrength));
      lastPunchStrength = strength;
      biggestPunchStrength = Math.max(biggestPunchStrength, strength);
      cause = nextCause;
      remaining = PUNCH_DURATION;
      if (nextCause === "quad") quadPunchSeen = true;
      if (nextCause === "level-up") levelUpPunchSeen = true;
    },
    update(dt) {
      if (remaining <= 0) {
        strength = 0;
        cause = null;
        return;
      }
      remaining = Math.max(0, remaining - Math.max(0, dt));
      // Ease-out so the hit lands instantly and settles smoothly.
      const progress = remaining / PUNCH_DURATION;
      strength *= 0.92 + progress * 0.08;
      if (remaining === 0) {
        strength = 0;
        cause = null;
      }
    },
    apply(cameraSpec) {
      const progress = remaining <= 0 ? 0 : remaining / PUNCH_DURATION;
      // A quick pull-back + slight drop reads as reactor kick without hiding the well.
      const offsetZ = strength * progress * 0.16;
      const offsetY = -strength * progress * 0.075;
      const wobble = cause === "quad" ? strength * progress * 0.02 : 0;
      cameraSpec.position = [basePosition[0] + wobble, basePosition[1] + offsetY, basePosition[2] + offsetZ];
      cameraSpec.target = [baseTarget[0], baseTarget[1] + offsetY * 0.4, baseTarget[2]];
    },
    proof() {
      return {
        punchesFired,
        punchActive: remaining > 0,
        lastPunchStrength,
        biggestPunchStrength,
        levelUpPunchSeen,
        quadPunchSeen,
        reducedMotionSuppressionCount
      };
    }
  };
}
