export interface SkylineCameraTuning {
  readonly viewport: "desktop" | "compact";
  readonly distance: number;
  readonly height: number;
  readonly lookAhead: number;
  readonly targetHeight: number;
  readonly fov: number;
}

export interface SkylineCameraFrame {
  readonly facing: -1 | 1;
  readonly leadDirection: "left" | "right";
  readonly leadMatchesFacing: boolean;
  readonly offset: readonly [number, number, number];
  readonly targetOffset: readonly [number, number, number];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * One source of truth for the two accepted Skyline viewports. The compact
 * camera deliberately uses less look-ahead because portrait framing has much
 * less horizontal room, while its wider FOV preserves vertical jump context.
 */
export function skylineCameraTuning(compactViewport: boolean): SkylineCameraTuning {
  return compactViewport
    ? {
        viewport: "compact",
        distance: 4.6,
        height: 0.58,
        lookAhead: 0.32,
        targetHeight: 0.34,
        fov: 48
      }
    : {
        viewport: "desktop",
        // 3.55 (from 3.75): the hero sat exactly on the 96px route-primary
        // width floor; +5% scale buys real margin and a slightly more heroic
        // frame without returning to the over-zoomed mascot look at 3.2.
        distance: 3.55,
        height: 0.6,
        lookAhead: 0.42,
        targetHeight: 0.34,
        fov: 42
      };
}

/**
 * Resolve the mutable follow-camera offsets from current player facing.
 * Keeping the lead sign in this pure function prevents the initial positive
 * look-ahead from silently remaining active after the runner turns left.
 */
export function skylineCameraFrame(
  tuning: SkylineCameraTuning,
  facing: number,
  shake: readonly [number, number, number] = [0, 0, 0]
): SkylineCameraFrame {
  const normalizedFacing: -1 | 1 = facing < 0 ? -1 : 1;
  const signedLead = tuning.lookAhead * normalizedFacing;
  const [shakeX, shakeY] = shake;
  const targetOffset = [
    round(signedLead + shakeX * 0.35),
    round(tuning.targetHeight + shakeY * 0.25),
    0
  ] as const;
  return {
    facing: normalizedFacing,
    leadDirection: normalizedFacing < 0 ? "left" : "right",
    leadMatchesFacing: Math.sign(targetOffset[0]) === normalizedFacing,
    offset: [
      round(signedLead * 0.42 + shakeX),
      round(tuning.height + shakeY),
      round(tuning.distance)
    ],
    targetOffset
  };
}
