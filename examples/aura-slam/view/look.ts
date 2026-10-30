/**
 * GU47 WP-11 (G01) "World Tour broadcast": the venue look table (PRD §3.2 item 2). One row per venue: its hour and climate,
 * HDRI, sun (elevation / azimuth / colour / intensity / PCSS light size) or floodlights, fog, output preset and grade, bloom
 * and the signature-effect parameters (surface-coloured ball marks and bounce puffs). Presentation only (PRD D8): nothing
 * here is read by the sim, physics, scoring, input or replay.
 *
 * Sun angles use the engine look basis (`agent-api/looks/looks.ts` sunPosition): azimuth 0 = +Z (toward the broadcast
 * camera), 90 = +X. `?look=original` keeps today's four-light rig, flat backdrop and post stack (the 4.6.1 frame).
 */
import type { AuraColor, AuraHdriId, AuraPostPresetId, AuraVec3 } from "@aura3d/engine";
import { VENUES, type VenueId } from "../contract/venues";
import type { VenueHdriKey } from "./assets";

/** The six venue HDRIs are E-A catalogue ids (compile-time check). */
type CatalogueHdri<K extends AuraHdriId> = K;
export type VenueHdri = CatalogueHdri<VenueHdriKey>;

export interface VenueSun {
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly color: AuraColor;
  readonly intensity: number;
  /** PCSS penumbra light size (world units at the receiver; larger = softer). */
  readonly lightSize: number;
  /** Approximate correlated colour temperature, for the art direction and the identity sheet. */
  readonly colorTemperatureK: number;
}

export interface VenueFloodlight {
  readonly name: string;
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly color: AuraColor;
  readonly intensity: number;
  readonly angle: number;
  readonly penumbra: number;
  readonly distance: number;
  readonly shadow: boolean;
}

export interface VenueFog {
  readonly color: AuraColor;
  /** exp2 density (per metre; a bare density fog compiles to exp2). The broadcast camera sits about 45 m from the court centre. */
  readonly density: number;
  /** Volumetric fog stage at High and above only (TT-E2: desert). */
  readonly volumetricAtHigh: boolean;
  /** Visible floodlight cones (TT-E2: hard court, 4). */
  readonly lightCones: number;
}

export interface VenueGrade {
  readonly preset: AuraPostPresetId;
  /** Linear output exposure multiplier (1 = the preset's own). */
  readonly exposure: number;
  readonly contrast: number;
  readonly saturation: number;
  /** White balance, -1 (cool) .. 1 (warm). */
  readonly temperature: number;
  /** -1 (green) .. 1 (magenta). */
  readonly tint: number;
  readonly bloom: { readonly intensity: number; readonly threshold: number };
  readonly vignette: number;
  /** TT-P3: an authored .cube per venue (`null` until the LUT asset exists; contrast/saturation carry the grade until then). */
  readonly lut: string | null;
}

export type VenueBurstKind = "clay-puff" | "grass-flick" | "hard-skid" | "regolith-drift";

export interface VenueSignature {
  /** Registered bounce-puff preset (view/vfx.ts). */
  readonly burst: VenueBurstKind;
  /** Puff colour: the contract's `VENUES[].particleColor` (TT-V1 acceptance: burst within 20 dE of it). */
  readonly burstColor: AuraColor;
  /** Ball-mark decal colour (a darker or lighter take on the surface). */
  readonly markColor: AuraColor;
  readonly markOpacity: number;
  /** Seconds a mark stays; clay marks last the set. */
  readonly markLifetime: number;
}

export interface VenueLook {
  readonly id: VenueId;
  readonly city: string;
  readonly timeOfDay: string;
  readonly hdri: VenueHdri;
  /** The size the row asks for; 2k copies are an E-A handoff (only 1k ships today, `public/hdri/<id>_1k.hdr`). */
  readonly hdriSize: "1k" | "2k";
  readonly environmentIntensity: number;
  readonly environmentRotationDeg: number;
  /** Background where the sky shows: the HDRI itself, or a solid colour. */
  readonly background: "hdri" | AuraColor;
  /** The sun; `null` on the night court. */
  readonly sun: VenueSun | null;
  /**
   * Night court only: the shadowed directional key standing in for the floodlight bank. The engine selects shadowed spots
   * (E-B multi-caster), but the default forward path renders sun cascades only (`Prd02ShadowBridge` `localLights: []`), so
   * hiding the directional at night would leave the athletes without a cast shadow. Swap point (one line each): set
   * `shadow: true` on the two far FLOODLIGHTS rows and `nightKey: null` once local tiles render (E-B handoff).
   */
  readonly nightKey?: VenueSun | null;
  readonly floodlights: readonly VenueFloodlight[];
  readonly fog: VenueFog | null;
  readonly grade: VenueGrade;
  readonly signature: VenueSignature;
  /** Seated crowd present (none on the Moon). */
  readonly crowd: boolean;
  /** Wind on palms and planters (TT-AN2); 0 on the Moon. */
  readonly wind: number;
}

const particle = (id: VenueId): AuraColor => VENUES.find((v) => v.id === id)?.particleColor ?? "#ffffff";

/**
 * Hard court: four corner masts aimed at the court quadrants so the court lights evenly (TT-L1: no centre hotspot). TT-L1
 * asks for the two far ones shadowed; until the forward path renders local shadow tiles they stay unshadowed and the night
 * key below casts (see `VenueLook.nightKey`).
 */
const FLOOD_COLOR = "#e6eeff";
export const FLOODLIGHTS: readonly VenueFloodlight[] = [
  { name: "flood-far-left", position: [-12.5, 15, -14.5], target: [-3.2, 0, -4.5], color: FLOOD_COLOR, intensity: 260, angle: 0.62, penumbra: 0.55, distance: 52, shadow: false },
  { name: "flood-far-right", position: [12.5, 15, -14.5], target: [3.2, 0, -4.5], color: FLOOD_COLOR, intensity: 260, angle: 0.62, penumbra: 0.55, distance: 52, shadow: false },
  { name: "flood-near-left", position: [-12.5, 15, 14.5], target: [-3.2, 0, 4.5], color: FLOOD_COLOR, intensity: 230, angle: 0.62, penumbra: 0.55, distance: 52, shadow: false },
  { name: "flood-near-right", position: [12.5, 15, 14.5], target: [3.2, 0, 4.5], color: FLOOD_COLOR, intensity: 230, angle: 0.62, penumbra: 0.55, distance: 52, shadow: false }
];

/** TT-E2: one visible haze cone per floodlight (night court only), from the lamp toward its aim point. */
export interface FloodCone { readonly id: string; readonly position: AuraVec3; readonly direction: AuraVec3; readonly length: number }
export const FLOOD_CONES: readonly FloodCone[] = FLOODLIGHTS.map((f, i) => {
  const d: AuraVec3 = [f.target[0] - f.position[0], f.target[1] - f.position[1], f.target[2] - f.position[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return { id: `flood-cone-${i}`, position: f.position, direction: [d[0] / len, d[1] / len, d[2] / len], length: len * 0.92 };
});

/**
 * TT-E3: the Earth beyond the lunar court (sphere + `material.atmosphere` shell), 150 m from the broadcast eye (PRD).
 * With the TT-C1 v2 camera (eye [0, 15.5, 33.5], 26 degrees) the landscape frame's top edge is 10.9 degrees below the eye's
 * horizontal and the ground ends 13.9 degrees below it, so the starfield shows in that band; the Moon hides the
 * grandstand and the scoreboard gantry covers +-4 degrees of azimuth, so the Earth sits at azimuth -9, elevation -12.3
 * degrees: inside the 1280 x 720 frame (5.1% of its width) and the 390 x 844 one (8.3%). `classicPosition` is where the
 * 4.6.1 camera (`?cam=classic`) sees it on tall canvases (its landscape frame shows no sky).
 */
export const EARTH = {
  position: [-22.9, -16.5, -111.3] as AuraVec3,
  classicPosition: [-20, -18, -125] as AuraVec3,
  radius: 3,
  atmosphere: 1.07,
  ids: { planet: "moon-earth", shell: "moon-earth-atmosphere" }
} as const;

/** The night court's shadowed key: the far floodlight bank, high and cold, casting short shadows toward the camera. */
const NIGHT_KEY: VenueSun = { elevationDeg: 58, azimuthDeg: 180, color: FLOOD_COLOR, intensity: 1.2, lightSize: 1.4, colorTemperatureK: 6500 };

export const VENUE_LOOKS: Readonly<Record<VenueId, VenueLook>> = {
  hard: {
    id: "hard", city: "New York", timeOfDay: "floodlit night (21:30), cold-white floods on navy acrylic",
    hdri: "rooftop_night", hdriSize: "1k", environmentIntensity: 0.35, environmentRotationDeg: 0, background: "hdri",
    sun: null, nightKey: NIGHT_KEY,
    floodlights: FLOODLIGHTS,
    fog: { color: "#0b1426", density: 0.008, volumetricAtHigh: false, lightCones: 4 },
    grade: { preset: "arena-fight", exposure: 1, contrast: 1.12, saturation: 1.04, temperature: -0.18, tint: 0, bloom: { intensity: 0.22, threshold: 0.92 }, vignette: 0.24, lut: null },
    signature: { burst: "hard-skid", burstColor: particle("hard"), markColor: "#c9d6e3", markOpacity: 0.42, markLifetime: 9 },
    crowd: true, wind: 0
  },
  grass: {
    id: "grass", city: "London", timeOfDay: "late morning (11:00), soft sun on striped turf",
    hdri: "kloppenheim_02", hdriSize: "1k", environmentIntensity: 0.9, environmentRotationDeg: 0, background: "hdri",
    sun: { elevationDeg: 40, azimuthDeg: 120, color: "#fff1dc", intensity: 2.6, lightSize: 0.9, colorTemperatureK: 5600 },
    floodlights: [],
    fog: { color: "#cfdbe6", density: 0.005, volumetricAtHigh: false, lightCones: 0 },
    grade: { preset: "daylight-outdoor", exposure: 1, contrast: 1.06, saturation: 1.06, temperature: 0.04, tint: -0.02, bloom: { intensity: 0.12, threshold: 0.95 }, vignette: 0.14, lut: null },
    signature: { burst: "grass-flick", burstColor: particle("grass"), markColor: "#cfe0b4", markOpacity: 0.32, markLifetime: 12 },
    crowd: true, wind: 0.35
  },
  clay: {
    id: "clay", city: "Paris", timeOfDay: "late afternoon (18:30), 18-degree golden raking light on terracotta",
    hdri: "venice_sunset", hdriSize: "1k", environmentIntensity: 0.8, environmentRotationDeg: 0, background: "hdri",
    sun: { elevationDeg: 18, azimuthDeg: 250, color: "#ffc27a", intensity: 3.1, lightSize: 0.6, colorTemperatureK: 3400 },
    floodlights: [],
    fog: { color: "#e3a46a", density: 0.008, volumetricAtHigh: false, lightCones: 0 },
    grade: { preset: "cinematic-film", exposure: 1, contrast: 1.1, saturation: 1.12, temperature: 0.16, tint: 0.02, bloom: { intensity: 0.16, threshold: 0.9 }, vignette: 0.26, lut: null },
    signature: { burst: "clay-puff", burstColor: particle("clay"), markColor: "#8e3e1f", markOpacity: 0.55, markLifetime: 900 },
    crowd: true, wind: 0.2
  },
  desert: {
    id: "desert", city: "Dubai", timeOfDay: "noon (12:30), white-hot sun through dust haze",
    hdri: "outdoor-midday", hdriSize: "2k", environmentIntensity: 1.1, environmentRotationDeg: 0, background: "hdri",
    sun: { elevationDeg: 72, azimuthDeg: 10, color: "#fffaf0", intensity: 4, lightSize: 0.4, colorTemperatureK: 6200 },
    floodlights: [],
    fog: { color: "#e8d2b0", density: 0.016, volumetricAtHigh: true, lightCones: 0 },
    grade: { preset: "daylight-outdoor", exposure: 1.3, contrast: 1.04, saturation: 0.94, temperature: 0.08, tint: 0, bloom: { intensity: 0.18, threshold: 0.88 }, vignette: 0.12, lut: null },
    signature: { burst: "hard-skid", burstColor: particle("desert"), markColor: "#d7c19c", markOpacity: 0.4, markLifetime: 9 },
    crowd: true, wind: 0.5
  },
  beach: {
    id: "beach", city: "Tropical Beach", timeOfDay: "sunset (19:10), magenta sky over the sea",
    hdri: "sunset-dramatic", hdriSize: "2k", environmentIntensity: 0.85, environmentRotationDeg: 0, background: "hdri",
    sun: { elevationDeg: 8, azimuthDeg: 290, color: "#ff8f72", intensity: 2.4, lightSize: 0.8, colorTemperatureK: 2600 },
    floodlights: [],
    fog: { color: "#e09a86", density: 0.01, volumetricAtHigh: false, lightCones: 0 },
    grade: { preset: "cinematic-film", exposure: 1, contrast: 1.08, saturation: 1.16, temperature: 0.1, tint: 0.12, bloom: { intensity: 0.2, threshold: 0.86 }, vignette: 0.28, lut: null },
    signature: { burst: "hard-skid", burstColor: particle("beach"), markColor: "#b9e3df", markOpacity: 0.38, markLifetime: 9 },
    crowd: true, wind: 0.6
  },
  moon: {
    id: "moon", city: "The Moon", timeOfDay: "lunar day, one hard sun on grey regolith, Earth in view",
    hdri: "deep_space_starfield", hdriSize: "2k", environmentIntensity: 0.05, environmentRotationDeg: 0, background: "hdri",
    sun: { elevationDeg: 25, azimuthDeg: 60, color: "#ffffff", intensity: 4.4, lightSize: 0.05, colorTemperatureK: 5800 },
    floodlights: [],
    fog: null,
    grade: { preset: "space", exposure: 1, contrast: 1.16, saturation: 0.86, temperature: -0.04, tint: 0, bloom: { intensity: 0.1, threshold: 0.95 }, vignette: 0.2, lut: null },
    signature: { burst: "regolith-drift", burstColor: particle("moon"), markColor: "#6f747a", markOpacity: 0.5, markLifetime: 30 },
    crowd: false, wind: 0
  }
};

export const VENUE_LOOK_ORDER: readonly VenueId[] = ["hard", "grass", "clay", "desert", "beach", "moon"];

/** The row for a venue id (unknown ids fall back to the hard court, like `venueKey`). */
export function venueLook(venue: string | null | undefined): VenueLook {
  return (venue && (VENUE_LOOKS as Record<string, VenueLook>)[venue]) || VENUE_LOOKS.hard;
}

/** Directional key position from the row's sun angles (engine look basis). */
export function sunPosition(sun: Pick<VenueSun, "elevationDeg" | "azimuthDeg">, distance = 40): AuraVec3 {
  const el = (sun.elevationDeg * Math.PI) / 180;
  const az = (sun.azimuthDeg * Math.PI) / 180;
  return [distance * Math.cos(el) * Math.sin(az), distance * Math.sin(el), distance * Math.cos(el) * Math.cos(az)];
}

/** Served path of a catalogue HDRI (E-A ships one 1k copy per id; 2k copies are requested in the lane report). */
export function venueHdriUrl(look: Pick<VenueLook, "hdri">): string {
  return `/hdri/${look.hdri}_1k.hdr`;
}

/** `?look=original` keeps today's look (the 4.6.1 frame) for before/after captures. */
export function lookMode(search?: string): "world-tour" | "original" {
  const raw = search ?? (typeof location !== "undefined" ? location.search : "");
  return new URLSearchParams(raw).get("look") === "original" ? "original" : "world-tour";
}
