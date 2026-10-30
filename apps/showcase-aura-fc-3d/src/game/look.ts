// Aura FC 3D — GU47 look table (WP-19 "Floodlight football in weather"): one row per venue.
//
// Pure data (no engine imports beyond types), so unit tests and the art-direction audit read it without a renderer.
// Each row is the PRD 3.2 look-table contract for one variant (`?venue=<id>`, tests/browser/game-luma-targets.ts):
// look preset, sky or HDRI, sun / key, the main-stand flood, rim, fog, post preset, grade, bloom, vignette / grain /
// chromatic aberration, weather and the signature-effect parameters (rain streaks, haze shafts, wet turf).
//
// Lighting design (FC47-L1/L2/L3): the four night venues are lit by ONE shadowed key, the main-stand flood (PCSS
// spot on the far-right tower, back-lighting the rain toward the broadcast camera); the look's own key is a 0.4
// unshadowed front fill; a cool unshadowed rim sits opposite the camera; the other three towers are faked with one
// instanced light-pool batch (no extra lights: the art direction allows one shadowed light, and the Low tier caps
// lights per pixel). Night IBL is a low-intensity HDRI with `background: false` (the venue sky colour goes through
// the E-A look `background` override, so no studio HDRI paints the sky). The two day venues keep a cascaded sun.

import type { AuraHdriId, AuraPostPresetId } from "@aura3d/engine";
import type { VenueId } from "./types";

/** Look presets the venues use (FC47-L1: Munich, Kyoto, Favela on night-city; Glacier on polar-night). */
export type FcLookId = "night-city" | "polar-night" | "golden-hour" | "outdoor-day";
/** Weather per venue (FC47-S3): scene weather nodes, never `weather.precipitation` (up to 90 box streaks). */
export type FcWeather = "rain" | "drizzle" | "snow" | "dust" | "none";
/** Night IBL sources: night-2k (the qwantani night sky, served at /hdri/night-2k.hdr) or a catalogue HDRI. */
export type FcNightIbl = "night-2k" | Extract<AuraHdriId, "rooftop_night" | "cobblestone_street_night">;

export interface FcVenueLook {
  readonly look: FcLookId;
  /** Time of day shown on the identity sheet. */
  readonly timeOfDay: string;
  /** Venue sky colour: the scene background AND the look `background` override (E-A handoff, scene.ts). */
  readonly background: string;
  /** Catalogue HDRI drawn as the sky on day venues (background on); undefined = the look's own environment. */
  readonly skyHdri?: AuraHdriId;
  /** Night venues: low-intensity IBL with `background: false` (FC47-L1). */
  readonly nightIbl?: { readonly source: FcNightIbl; readonly intensity: number; readonly rotationDeg: number };
  /** Glacier: a real star sky (`sky.dayNight({ hour: 23, starLimit: 120 })`, sky node only), FC47-S1. */
  readonly starSky?: { readonly hour: number; readonly starLimit: number };
  readonly exposureEv: number;
  /** Look key direction: the sun on day venues, the 0.4 front fill on night venues. */
  readonly sun: { readonly elevationDeg: number; readonly azimuthDeg: number };
  readonly key: { readonly color: string; readonly intensity: number; readonly shadowed: boolean };
  /** Main-stand flood intensity (the night key when `floodShadow`; 0 = no flood light). */
  readonly flood: number;
  readonly floodColor: string;
  /** The main-stand flood casts the scene's one production shadow (PCSS 2048) on night venues. */
  readonly floodShadow: boolean;
  /** Cool unshadowed rim opposite the camera (FC47-L3); null = none. */
  readonly rim: { readonly color: string; readonly intensity: number; readonly azimuthDeg: number } | null;
  /** Look fog density scale (night-city / polar-night carry real fog, so this now does something). */
  readonly fog: number;
  readonly fogColor: string;
  /** Output preset (FC47-P1); also rides on the look as its `output.preset` child. */
  readonly post: Extract<AuraPostPresetId, "arena-fight" | "neon-night" | "cinematic-film" | "daylight-outdoor">;
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
  readonly bloom: { readonly intensity: number; readonly threshold: number };
  readonly vignette: number;
  /** Film grain (FC47-P1: Favela only, 0 = none). */
  readonly grain: number;
  /** Chromatic aberration (FC47-P1: Kyoto only, 0 = none). */
  readonly chromaticAberration: number;
  readonly weather: FcWeather;
  /** Volumetric haze shafts at the main-stand tower (FC47-S2, god-ray density; 0 = off). */
  readonly shafts: number;
  /** Fake light-cone intensity under the towers (FC47-S2 "cones to 0.5"; 0 = no cones, day venues). */
  readonly cones: number;
  /** Turf roughness (FC47-M1: 0.35 wet on Munich and Kyoto). */
  readonly turfRoughness: number;
  /**
   * Pitch surface (FC47-M1): "grass" = the acg-grass005 set tiled 24x16 with normal and roughness maps under 30% mow
   * stripes; "ice" = clearcoat ice (Glacier); "plain" = today's flat colour (Favela dirt, Lagos sand, Uyuni salt).
   */
  readonly surface: "grass" | "ice" | "plain";
  /** FC47-M3: a planar mirror over the pitch under a thin water film (Uyuni); null = none. */
  readonly mirror: { readonly resolution: number; readonly tint: string } | null;
}

/**
 * Index (scene.ts tower list) of the main-stand flood: the far-right tower behind the main stand (-Z, opposite the
 * broadcast camera), so its shaft back-lights the rain toward the lens and its shadows fall toward the camera.
 */
export const MAIN_FLOOD_TOWER = 1;

export const VENUE_LOOKS: Readonly<Record<VenueId, FcVenueLook>> = {
  // Munich: storm navy night, cold-white floods, lime accent, rain slanting through the shafts.
  munich: {
    look: "night-city", timeOfDay: "21:30 storm night",
    background: "#0a1422", nightIbl: { source: "night-2k", intensity: 0.22, rotationDeg: 35 },
    exposureEv: 0.15, sun: { elevationDeg: 40, azimuthDeg: 15 }, key: { color: "#9fb4d6", intensity: 0.4, shadowed: false },
    flood: 3.8, floodColor: "#e4f0ff", floodShadow: true,
    rim: { color: "#8fc8ff", intensity: 1.1, azimuthDeg: 200 },
    fog: 1.3, fogColor: "#16243a",
    post: "arena-fight", grade: { contrast: 1.12, saturation: 0.92, temperature: -0.18, tint: 0 },
    bloom: { intensity: 0.24, threshold: 0.8 }, vignette: 0.25, grain: 0, chromaticAberration: 0,
    weather: "rain", shafts: 0.35, cones: 0.5, turfRoughness: 0.35, surface: "grass", mirror: null
  },
  // Kyoto: lantern red and magenta in drizzle.
  kyoto: {
    look: "night-city", timeOfDay: "22:00 drizzle",
    background: "#120814", nightIbl: { source: "cobblestone_street_night", intensity: 0.18, rotationDeg: 210 },
    exposureEv: 0.1, sun: { elevationDeg: 45, azimuthDeg: 340 }, key: { color: "#d9a3c8", intensity: 0.4, shadowed: false },
    flood: 3.4, floodColor: "#ffe2d0", floodShadow: true,
    rim: { color: "#ff5fa2", intensity: 0.9, azimuthDeg: 160 },
    fog: 1.0, fogColor: "#2a1020",
    post: "neon-night", grade: { contrast: 1.08, saturation: 1.12, temperature: 0.05, tint: 0.18 },
    bloom: { intensity: 0.3, threshold: 0.75 }, vignette: 0.25, grain: 0, chromaticAberration: 0.0015,
    weather: "drizzle", shafts: 0, cones: 0.5, turfRoughness: 0.35, surface: "grass", mirror: null
  },
  // Favela: sodium floods and dust in a walled cage.
  favela: {
    look: "night-city", timeOfDay: "20:45 dry heat",
    background: "#140d07", nightIbl: { source: "rooftop_night", intensity: 0.16, rotationDeg: 120 },
    exposureEv: 0.12, sun: { elevationDeg: 50, azimuthDeg: 30 }, key: { color: "#e0a868", intensity: 0.4, shadowed: false },
    flood: 3.5, floodColor: "#ffb066", floodShadow: true,
    rim: { color: "#ffc27a", intensity: 0.8, azimuthDeg: 190 },
    fog: 0.8, fogColor: "#3a2814",
    post: "arena-fight", grade: { contrast: 1.1, saturation: 1.05, temperature: 0.32, tint: -0.05 },
    bloom: { intensity: 0.22, threshold: 0.82 }, vignette: 0.25, grain: 0.05, chromaticAberration: 0,
    weather: "dust", shafts: 0, cones: 0.5, turfRoughness: 0.9, surface: "plain", mirror: null
  },
  // Lagos: low copper sun over the sea (golden-hour look, its own sky), cascaded sun shadow, soft floods.
  lagos: {
    look: "golden-hour", timeOfDay: "18:40 copper sunset",
    background: "#c27a4a",
    exposureEv: -0.35, sun: { elevationDeg: 8, azimuthDeg: 250 }, key: { color: "#ff9a52", intensity: 2.4, shadowed: true },
    flood: 0.9, floodColor: "#ffcf9e", floodShadow: false,
    rim: null,
    fog: 0.15, fogColor: "#c98a5a",
    post: "cinematic-film", grade: { contrast: 1.08, saturation: 1.08, temperature: 0.3, tint: 0 },
    bloom: { intensity: 0.08, threshold: 0.96 }, vignette: 0.25, grain: 0, chromaticAberration: 0,
    weather: "none", shafts: 0, cones: 0, turfRoughness: 0.95, surface: "plain", mirror: null
  },
  // Uyuni: pale dawn on a mirror flat (spruit_sunrise drawn as the sky, low warm cascaded key, exposure -0.9).
  uyuni: {
    look: "outdoor-day", timeOfDay: "06:40 pale dawn",
    background: "#c9d4e0", skyHdri: "spruit_sunrise",
    exposureEv: -0.9, sun: { elevationDeg: 7, azimuthDeg: 100 }, key: { color: "#ffd0a0", intensity: 2.2, shadowed: true },
    flood: 0, floodColor: "#f4f8ff", floodShadow: false,
    rim: null,
    fog: 0.15, fogColor: "#d6dde6",
    post: "daylight-outdoor", grade: { contrast: 1.0, saturation: 0.92, temperature: 0.12, tint: 0 },
    bloom: { intensity: 0.06, threshold: 0.97 }, vignette: 0.25, grain: 0, chromaticAberration: 0,
    weather: "none", shafts: 0, cones: 0, turfRoughness: 0.2, surface: "plain", mirror: { resolution: 256, tint: "#d6e0ea" }
  },
  // Glacier: polar night under a live aurora, with snow; real star sky.
  glacier: {
    look: "polar-night", timeOfDay: "23:00 polar night",
    background: "#050b14", nightIbl: { source: "night-2k", intensity: 0.2, rotationDeg: 300 },
    starSky: { hour: 23, starLimit: 120 },
    exposureEv: 0.1, sun: { elevationDeg: 35, azimuthDeg: 10 }, key: { color: "#8fb0d8", intensity: 0.4, shadowed: false },
    flood: 3.6, floodColor: "#cfe8ff", floodShadow: true,
    rim: { color: "#7fe8c9", intensity: 0.9, azimuthDeg: 170 },
    fog: 1.2, fogColor: "#0b1a26",
    post: "cinematic-film", grade: { contrast: 1.06, saturation: 0.95, temperature: -0.22, tint: -0.04 },
    bloom: { intensity: 0.26, threshold: 0.78 }, vignette: 0.25, grain: 0, chromaticAberration: 0,
    weather: "snow", shafts: 0.3, cones: 0.5, turfRoughness: 0.3, surface: "ice", mirror: null
  }
};

/** Night venues: the main-stand flood is the shadowed key (FC47-L2). */
export function isNightVenue(id: VenueId): boolean {
  return VENUE_LOOKS[id].floodShadow;
}
