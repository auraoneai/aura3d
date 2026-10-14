export interface TurboExcursionState {
  readonly progress: number;
  readonly heading: number;
  readonly signedTrackOffset: number;
}

export interface TurboRacingLineSample {
  readonly heading: number;
}

/**
 * Steer toward the local outside normal until the racing kit emits its real
 * off-track event. A fixed left/right lock can follow a closed circuit forever;
 * this controller derives the target from the current certified tangent and
 * never mutates position, progress, checkpoint, or event state.
 */
export function turboAcceptanceExcursionInput(
  state: TurboExcursionState,
  sampleAt: (progress: number) => TurboRacingLineSample
): { readonly throttle: number; readonly brake: number; readonly drift: boolean; readonly steer: number } {
  const side = state.signedTrackOffset < -0.001 ? -1 : 1;
  const targetHeading = sampleAt(state.progress).heading + side * Math.PI / 2;
  const headingError = normalizeAngle(targetHeading - state.heading);
  return {
    throttle: 1,
    brake: 0,
    drift: true,
    steer: clamp(headingError * 2.5, -1, 1)
  };
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
