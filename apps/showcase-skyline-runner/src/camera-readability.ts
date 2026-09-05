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
        // 2.5 (from 3.55): the retained route-primary probe measures the
        // settled hero at 75x179 against minForegroundWidth 96 (reproduced
        // with the repo's own difference metrics: 6262px, density 0.47, not
        // clipped -- genuinely small, not a measurement artefact). Apparent
        // size scales ~1/distance, so 3.55 -> 2.5 predicts ~107px and clears
        // the floor with real margin. The old 3.2 "oversized mascot" verdict
        // does not transfer: it described a larger-hero era (hero filled the
        // frame at 3.2); the current asset measures 75px at 3.55, and ~107px
        // is ~7% of frame width. Height scales along (179 -> ~254, floor 72,
        // bounds stay central so no clip risk).
        // VERIFIED 2026-09-05 via retained probe (two consecutive runs,
        // bit-identical): settled hero measures 106x248 against projection
        // 221.48px, width floor 96 cleared with margin. Consequence: the
        // pose-determinism height bound moved 1.1 -> 1.15 (systematic
        // close-camera geometry, not phase — see the determinism test).
        distance: 2.5,
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
