/**
 * 5.0 adoption A5 (lab only): a Type-C photometric profile for the sodium floodlights.
 *
 * EXPERIMENTAL in 5.0 (docs/api/public-api.appendix.md: non-clustered, generated lit forward draws on WebGL2). The flag
 * `?ies=1` is default OFF; without it nothing here reaches the scene and the spot lights stay scalar cones.
 * The profile is a rotationally symmetric flood distribution: a hot axis, a smooth shoulder near the spot angle and a
 * deep spill cut-off, so the pool on the asphalt reads as a lamp throw instead of a flat cone.
 */
import type { lights } from "@aura3d/engine";

type AuraPhotometricProfile = NonNullable<NonNullable<Parameters<typeof lights.spot>[0]>["photometricProfile"]>;

/** True only for `?ies=1` (invalid or absent values leave the scalar spots). */
export function readIesLabFlag(search: string | undefined = typeof window !== "undefined" ? window.location.search : undefined): boolean {
  if (!search) return false;
  return new URLSearchParams(search).get("ies")?.trim() === "1";
}

const VERTICAL_ANGLES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 75, 90, 120, 180] as const;
/** Relative intensity per vertical angle: peak on axis, shoulder at 25-35 degrees, hard spill cut-off beyond 40. */
const RELATIVE = [1.0, 0.98, 0.93, 0.85, 0.74, 0.6, 0.44, 0.28, 0.16, 0.06, 0.025, 0.01, 0.004, 0, 0] as const;
/** Profile candelas replace the scalar intensity (2.6 on the Rucker spots) rather than multiplying it, so the axis peak stays in that range. */
const PEAK_CANDELA = 3.2;

export function sodiumFloodProfile(): AuraPhotometricProfile {
  return {
    profile: {
      format: "ies-lm63", version: "LM-63-2002", photometricType: "C", units: "meters", lampCount: 1,
      lumensPerLamp: null, candelaMultiplier: 1, ballastFactor: 1, lampPhotometricFactor: 1, lampMultiplier: 1,
      tiltMultiplier: 1, inputWatts: 1000, luminousDimensions: [0.5, 0.5, 0.2],
      verticalAngles: [...VERTICAL_ANGLES], horizontalAngles: [0],
      candela: RELATIVE.map((r) => r * PEAK_CANDELA), symmetry: "rotational"
    },
    scale: 1
  };
}
