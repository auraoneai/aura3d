/**
 * Gridlock Courier (5.x A5, EXPERIMENTAL lab flag `?lights=ies`): a measured-style low-beam distribution for the
 * headlight spot. A Type-C IES table with a hot spot on the axis, a wide shoulder across the road and a short
 * vertical throw, so the pool on the asphalt has the cutoff of a real dipped beam instead of the scalar cone's soft
 * disc. Profile output is absolute candela (it replaces the scalar intensity), so the table peaks at the scalar
 * `HEADLIGHT.intensity` and the beam keeps its authored strength.
 *
 * Off by default: `renderer.photometricProfiles` is EXPERIMENTAL (claims-and-boundaries). Unsupported draws fall back to
 * the scalar light and report a degradation; nothing here changes the default look.
 */
import { parseIES } from "@aura3d/assets";
import type { AuraPhotometricProfile } from "@aura3d/engine";
import { HEADLIGHT } from "./lamps";

/** Angle from the lamp axis (degrees). */
export const PROFILE_VERTICAL = [0, 4, 8, 12, 16, 20, 25, 30, 36, 45, 90] as const;
/** C-planes: 0 = across the road (wide), 90 = up and down (short throw), 180 mirrors 0. */
export const PROFILE_HORIZONTAL = [0, 90, 180] as const;
/** Relative candela per C-plane over `PROFILE_VERTICAL` (1 = the beam's hot spot). */
const ACROSS = [1.0, 0.98, 0.94, 0.86, 0.72, 0.52, 0.28, 0.1, 0.02, 0, 0];
const UPDOWN = [1.0, 0.9, 0.7, 0.45, 0.22, 0.08, 0.02, 0, 0, 0, 0];

export function headlightIesText(peakCandela: number = HEADLIGHT.intensity): string {
  const rows = [ACROSS, UPDOWN, ACROSS].map((plane) => plane.map((v) => (v * peakCandela).toFixed(3)).join(" "));
  return [
    "IESNA:LM-63-2002",
    "[TEST] gridlock-courier-low-beam",
    "TILT=NONE",
    `1 1000 1 ${PROFILE_VERTICAL.length} ${PROFILE_HORIZONTAL.length} 1 2 0 0 0`,
    "1 1 40",
    PROFILE_VERTICAL.join(" "),
    PROFILE_HORIZONTAL.join(" "),
    ...rows
  ].join("\n");
}

/** The parsed profile as the `lights.spot({ photometricProfile })` option. */
export function headlightProfile(): AuraPhotometricProfile {
  return { profile: parseIES(headlightIesText()) };
}
