/**
 * Thermal Drift sector moods (GU47 WP-13 HS-16): each named sector of a circuit falls into one of six types, and each
 * type scales the circuit's fog density, pulls the fog colour towards its own tint and scales the key light. Crossing
 * into a sector cross-fades both over 1.5 s with the E-B runtime calls (`app.atmosphere.setFog` with
 * `transitionSeconds`, `keyHandle.setLight(..., { transitionSeconds })`). Presentation only: reads the player's track
 * distance, never writes the sim. Reduced motion keeps the cross-fade (a slow change of light, not a motion).
 *
 * Sector set-dressing pieces (tunnel liners, aqueduct, foundry ladles) wait for the WP-36 assets (HS-09).
 */
import type { CircuitSpec } from "./data";
import type { CircuitLook } from "./look";

export type SectorType = "avenue" | "tunnel" | "flooded" | "foundry" | "ruin" | "open";

export interface SectorMood {
  readonly fogScale: number;
  readonly fogTint: string;
  /** Share (0..1) of `fogTint` mixed into the circuit fog colour. */
  readonly tintMix: number;
  readonly keyScale: number;
}

export const SECTOR_CROSSFADE_SECONDS = 1.5;

export const SECTOR_MOODS: Readonly<Record<SectorType, SectorMood>> = {
  avenue: { fogScale: 1, fogTint: "#2a1d14", tintMix: 0, keyScale: 1 },
  tunnel: { fogScale: 1.6, fogTint: "#120c08", tintMix: 0.55, keyScale: 0.45 },
  flooded: { fogScale: 1.35, fogTint: "#1c2a30", tintMix: 0.45, keyScale: 0.8 },
  foundry: { fogScale: 1.25, fogTint: "#5a2410", tintMix: 0.6, keyScale: 1.2 },
  ruin: { fogScale: 0.8, fogTint: "#3a3430", tintMix: 0.35, keyScale: 0.9 },
  open: { fogScale: 0.75, fogTint: "#3a2a22", tintMix: 0.15, keyScale: 1.1 }
};

/** Sector type from its name (data.ts sector names). */
export function sectorType(name: string): SectorType {
  const n = name.toUpperCase();
  if (/TUNNEL|ASCENT|WELL/.test(n)) return "tunnel";
  if (/FLOOD|AQUEDUCT|REEF/.test(n)) return "flooded";
  if (/FOUNDRY|REACTOR|RIFT/.test(n)) return "foundry";
  if (/RUIN|CIVIC|BONEWAKE|FOREST/.test(n)) return "ruin";
  if (/BASIN|BERM|CROWN/.test(n)) return "open";
  return "avenue";
}

function mixHex(a: string, b: string, t: number): string {
  const pa = Number.parseInt(a.slice(1), 16), pb = Number.parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Fog and key targets of one sector on a circuit (pure; unit-tested). */
export function sectorTargets(look: CircuitLook, sectorName: string): { type: SectorType; fog: { color: string; density: number }; keyIntensity: number } {
  const type = sectorType(sectorName);
  const mood = SECTOR_MOODS[type];
  return {
    type,
    fog: { color: mixHex(look.fog.color, mood.fogTint, mood.tintMix), density: look.fog.density * mood.fogScale },
    keyIntensity: look.key.intensity * mood.keyScale
  };
}

/** Types present on a circuit (the judge must name 4 of 5; GRAND has all five non-open types). */
export function circuitSectorTypes(circuit: CircuitSpec): readonly SectorType[] {
  return circuit.sectors.map((s) => sectorType(s.name));
}
