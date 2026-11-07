/**
 * A5 lab (`?ies=1`, EXPERIMENTAL in 5.0): a measured-style Type-C IES distribution for the two ring spots ("crown ring
 * key" and "crown ring fill"). A tight theatre-spot lobe with a soft shoulder replaces the scalar cone falloff.
 * Off by default: the renderer needs `renderer.photometricProfiles: true` and supports only generated, lit,
 * non-clustered forward draws; anything else reports a degradation and keeps the scalar spot.
 */
import type { AuraPhotometricProfile } from "@aura3d/engine";

/** Vertical angles in degrees from the spot axis (0 = straight at the target). */
const VERTICAL = [0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 75, 90] as const;
/** Relative output: 1 on axis, soft shoulder near the 0.46 rad (26 degree) cone edge, dark outside. */
const RELATIVE = [1, 0.99, 0.96, 0.9, 0.78, 0.55, 0.28, 0.1, 0.03, 0.005, 0, 0, 0] as const;

export function ringPhotometricProfile(peakCandela: number, scale = 1): AuraPhotometricProfile {
  return {
    scale,
    profile: {
      format: "ies-lm63",
      version: "LM-63-2002",
      photometricType: "C",
      units: "meters",
      lampCount: 1,
      lumensPerLamp: null,
      candelaMultiplier: 1,
      ballastFactor: 1,
      lampPhotometricFactor: 1,
      lampMultiplier: 1,
      tiltMultiplier: 1,
      inputWatts: 0,
      luminousDimensions: [0, 0, 0],
      verticalAngles: [...VERTICAL],
      horizontalAngles: [0],
      candela: RELATIVE.map((v) => v * peakCandela),
      symmetry: "rotational"
    }
  };
}
