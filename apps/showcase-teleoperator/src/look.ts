/**
 * Grid Dispatch look table (GU47 WP-14 "Marine-layer dispatch feed", PRD §3.2 item 2): one row per sky.
 *
 * A remote operator's sensor feed over a cool bay-city avenue: a marine fog bank eats the tower tops while the street
 * stays clear, sodium #ffb15a lamps and lit bay windows against slate-teal fog #5f7f8c, red #b3262b and brass #b59449
 * cable cars, teal #3fd6c6 only for the objective and the sensor overlay. Signature: the marine layer plus a teal LiDAR
 * scan pulse. Each row names the IBL HDRI (E-A catalogue, `/hdri/<id>_1k.hdr`), the sky node, the shadowed key aligned
 * with the visible sun, the hemisphere, the height fog, the marine deck and scan pulse of the sensor pass, the output
 * (tone mapping, exposure), the post stack and the street practicals. Pure data: no DOM, no engine calls, so the unit
 * tests (tests/unit/teleoperator/look.test.ts) read it directly.
 *
 * Sky ids stay `noon | golden | fog | night` (the dock's `data-tod` values and the E-I luma targets click them);
 * `golden` is labelled "Marine dusk" and is the boot sky (GD-21), `night` is "Sodium night".
 */
import type { WeatherPreset } from "./rules";

export type SkyId = WeatherPreset;
export type HdriId = "belfast_sunset_puresky" | "outdoor-midday" | "autumn_field_puresky" | "cobblestone_street_night";

/** Sky order of the dock and the `T` key. Marine dusk first: it is the boot sky. */
export const SKY_ORDER: readonly SkyId[] = ["golden", "noon", "fog", "night"];
/** GD-21: Marine dusk is the boot sky. */
export const BOOT_SKY: SkyId = "golden";

export interface SkyRgbGrade {
  readonly contrast: number;
  readonly saturation: number;
  /** E-C white balance, [-1, 1], + warmer. */
  readonly temperature: number;
  /** E-C white balance, [-1, 1], + magenta. */
  readonly tint: number;
  readonly lift?: number;
  readonly gain?: number;
}

export type SkyNodeSpec =
  | {
      readonly model: "gradient";
      readonly zenith: string;
      readonly horizon: string;
      readonly ground: string;
      readonly exponent: number;
      readonly horizonGlow: number;
      readonly bands?: readonly { readonly elevationDeg: number; readonly widthDeg: number; readonly color: string; readonly intensity: number }[];
      readonly stars?: { readonly count: number; readonly brightness: number };
    }
  | { readonly model: "preetham"; readonly turbidity: number; readonly rayleigh: number; readonly mieCoefficient: number; readonly mieDirectionalG: number; readonly groundColor: string };

export interface SkyLook {
  readonly id: SkyId;
  readonly label: string;
  readonly timeOfDay: string;
  /** Image-based fill (never the visible background: the sky node is). `rotationDeg` turns the HDRI sun towards the key. */
  readonly hdri: { readonly id: HdriId; readonly intensity: number; readonly rotationDeg: number };
  readonly sky: SkyNodeSpec;
  /** Visible sun or moon disc; the shadowed key light shines from exactly this direction (GD-01). */
  readonly sun: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number; readonly discSize: number };
  readonly key: { readonly color: string; readonly intensity: number };
  readonly hemisphere: { readonly sky: string; readonly ground: string; readonly intensity: number };
  /**
   * Engine height fog (GD-05): distance haze that keeps the near street clear (the fog sky stays under 0.3 at 40 m).
   * `heightFalloff` is 0 on purpose: the forward fog (legacy approximation, `packLegacy`) only thins fog above
   * `heightReference`, i.e. a ground fog, so it cannot put the marine layer aloft. The deck aloft is the `marine` row,
   * drawn by the sensor pass; `heightReference` records the deck base (handoff to E-B: an aloft layer in the engine fog).
   */
  readonly fog: {
    readonly color: string;
    readonly density: number;
    readonly heightDensity: number;
    readonly heightFalloff: number;
    readonly heightReference: number;
    readonly start: number;
    readonly maxOpacity: number;
    readonly sunInscatter: number;
  };
  /** Signature marine deck (sensor pass, GD-05/GD-09): fog by world height, `base`..`top` metres above the street. */
  readonly marine: { readonly base: number; readonly top: number; readonly color: string; readonly opacity: number; readonly reach: number };
  /** GD-08: set with app.setOutput after every setScene. `fallback` is the operator used when `toneMapping` is unavailable. */
  readonly output: { readonly toneMapping: "agx" | "aces"; readonly fallback: "aces"; readonly exposure: number };
  readonly bloom: { readonly intensity: number; readonly threshold: number; readonly radius: number };
  readonly grade: SkyRgbGrade;
  readonly vignette: number;
  /** GD-06: god rays down the avenue (dusk and fog only; High tier). */
  readonly godRays: { readonly density: number; readonly color: string; readonly intensity: number } | null;
  /** GU47 phase 3: sensor-feed grain (film-grain post stage), the feed noise of a remote camera. */
  readonly grain: number;
  /** Street practicals: lamp globe emissive, sodium point lights on the nearest lamps, window glow, headlights. */
  readonly street: {
    readonly lampEmissive: number;
    readonly sodiumPoints: number;
    readonly sodiumPower: number;
    readonly lightPools: number;
    readonly windowGlow: number;
    readonly headlights: number;
    readonly asphalt: { readonly color: string; readonly roughness: number };
    readonly ground: string;
    readonly water: string;
    readonly drizzle: boolean;
  };
  /** GD-09 LiDAR pulse strength multiplier for this sky (the ring reads stronger at night). */
  readonly scanStrength: number;
}

export const SODIUM = "#ffb15a";
export const MARINE_FOG = "#5f7f8c";
export const OBJECTIVE_TEAL = "#3fd6c6";
export const CABLE_RED = "#b3262b";
export const CABLE_BRASS = "#b59449";
export const BRAKE_RED = "#ff2a1f";

export const SKY_LOOKS: Readonly<Record<SkyId, SkyLook>> = {
  golden: {
    id: "golden",
    label: "Marine dusk",
    timeOfDay: "dusk, sun 9 deg above the bay",
    hdri: { id: "belfast_sunset_puresky", intensity: 0.8, rotationDeg: 145 },
    sky: { model: "gradient", zenith: "#2b3a55", horizon: "#f2a65e", ground: "#1d222b", exponent: 1.6, horizonGlow: 0.85 },
    // GU47 phase 3 round 2: azimuth 160 -> 145 puts the low sun right of the avenue so the west facades catch the warm key
    // (r1 rubric: the dusk read came only from the haze tint, not from warm light on surfaces).
    sun: { elevationDeg: 9, azimuthDeg: 145, color: "#ffb070", intensity: 1.2, discSize: 0.035 },
    key: { color: "#ffb070", intensity: 2.2 },
    hemisphere: { sky: "#6a7488", ground: "#3a2c22", intensity: 0.42 },
    // GU47 phase 3: the orange murk started metres from the camera (rubric atmosphere 5): later start, less sun inscatter and weaker god rays.
    fog: { color: MARINE_FOG, density: 0.0025, heightDensity: 0.002, heightFalloff: 0, heightReference: 28, start: 14, maxOpacity: 0.82, sunInscatter: 0.15 },
    marine: { base: 30, top: 48, color: "#4d6672", opacity: 0.88, reach: 240 },
    // GU47 phase 3 round 2: r1 (murk removed) measured mean 60 / p95 134 (band 75-100, p95 >= 210): exposure 1.0 -> 1.3,
    // IBL 0.6 -> 0.8, warmer hemisphere and grade, brighter horizon glow.
    output: { toneMapping: "agx", fallback: "aces", exposure: 1.3 },
    bloom: { intensity: 0.32, threshold: 0.82, radius: 0.5 },
    grade: { contrast: 1.1, saturation: 1.1, temperature: 0.2, tint: -0.02 },
    vignette: 0.26,
    godRays: { density: 0.08, color: "#ffb878", intensity: 0.14 },
    grain: 0.04,
    street: { lampEmissive: 2.4, sodiumPoints: 2, sodiumPower: 900, lightPools: 0.35, windowGlow: 0.3, headlights: 1, asphalt: { color: "#1f242c", roughness: 0.78 }, ground: "#231d22", water: "#1e3a5f", drizzle: false },
    scanStrength: 1
  },
  noon: {
    id: "noon",
    label: "Sunny noon",
    timeOfDay: "noon, sun 62 deg over the west side, marine layer burnt off to a high haze",
    hdri: { id: "outdoor-midday", intensity: 1.0, rotationDeg: 215 },
    sky: { model: "preetham", turbidity: 3, rayleigh: 1.2, mieCoefficient: 0.005, mieDirectionalG: 0.8, groundColor: "#3a4654" },
    // GU47 phase 3: azimuth 200 -> 215 (sun from the west side, not down the avenue) so the west blocks throw shadow bands
    // across the street and the pod's shadow reads beside it (rubric shadows 3); elevation stays the PRD 62 deg.
    sun: { elevationDeg: 62, azimuthDeg: 215, color: "#fff4e2", intensity: 1, discSize: 0.03 },
    key: { color: "#fff4e2", intensity: 3.0 },
    hemisphere: { sky: "#9cc8ec", ground: "#3a3f46", intensity: 0.45 },
    fog: { color: "#a9c3d6", density: 0.001, heightDensity: 0.0008, heightFalloff: 0, heightReference: 70, start: 30, maxOpacity: 0.45, sunInscatter: 0.1 },
    marine: { base: 70, top: 110, color: "#c4d3dc", opacity: 0.3, reach: 320 },
    // GU47 phase 3: recap2 noon mean 84 (band 95-120): exposure 1.0 -> 1.12, IBL 0.85 -> 1.0.
    output: { toneMapping: "aces", fallback: "aces", exposure: 1.12 },
    // GD-08: threshold 0.95 keeps the white pod out of the bloom (no halo).
    bloom: { intensity: 0.18, threshold: 0.95, radius: 0.35 },
    grade: { contrast: 1.12, saturation: 1.06, temperature: 0.02, tint: 0 },
    vignette: 0.2,
    godRays: null,
    grain: 0.03,
    // GU47 phase 3 round 2: noon asphalt #252a32 -> #3a4049: the road is half the frame (r1 mean 86, band 95-120) and the key shadows need a lighter ground to read.
    street: { lampEmissive: 0.25, sodiumPoints: 0, sodiumPower: 0, lightPools: 0, windowGlow: 0, headlights: 0, asphalt: { color: "#3a4049", roughness: 0.82 }, ground: "#1e293b", water: "#0c4a6e", drizzle: false },
    scanStrength: 0.75
  },
  fog: {
    id: "fog",
    label: "Marine fog",
    timeOfDay: "grey morning under a low marine layer",
    hdri: { id: "autumn_field_puresky", intensity: 0.6, rotationDeg: 170 },
    sky: { model: "gradient", zenith: "#8193a0", horizon: "#b3c0c6", ground: "#59686f", exponent: 1.0, horizonGlow: 0.1 },
    sun: { elevationDeg: 38, azimuthDeg: 170, color: "#dfe8ee", intensity: 0, discSize: 0.03 },
    key: { color: "#dfe8ee", intensity: 0.8 },
    hemisphere: { sky: "#b8c6ce", ground: "#4a565d", intensity: 0.55 },
    // GU47 phase 3 round 2: r1 (god rays 0.16, fog 0.0048) lost the fog (mean 72, band 105-135): the engine fog carries
    // the bank now (0.0075, start 8; still < 0.3 at 40 m), god rays 0.24, exposure 1.05 -> 1.25.
    fog: { color: MARINE_FOG, density: 0.0075, heightDensity: 0.0025, heightFalloff: 0, heightReference: 12, start: 8, maxOpacity: 0.96, sunInscatter: 0.1 },
    marine: { base: 12, top: 26, color: "#6c8794", opacity: 0.97, reach: 160 },
    output: { toneMapping: "aces", fallback: "aces", exposure: 1.25 },
    bloom: { intensity: 0.12, threshold: 0.9, radius: 0.4 },
    grade: { contrast: 0.96, saturation: 0.82, temperature: -0.06, tint: 0 },
    vignette: 0.22,
    godRays: { density: 0.08, color: "#dfe8ee", intensity: 0.24 },
    grain: 0.05,
    street: { lampEmissive: 1.6, sodiumPoints: 2, sodiumPower: 600, lightPools: 0.2, windowGlow: 0.35, headlights: 1, asphalt: { color: "#272c33", roughness: 0.7 }, ground: "#334155", water: "#3b5266", drizzle: false },
    scanStrength: 0.9
  },
  night: {
    id: "night",
    label: "Sodium night",
    timeOfDay: "night, moon behind a thin marine layer lit sodium from below",
    // GU47 phase 3 round 2: r1 night facades still read sodium-orange from the warm night HDRI (mean 44, p95 132, band p95
    // >= 180): IBL 0.45 -> 0.3 darkens the blocks; headlights 1.4 -> 1.8 carry the highlights (lamp 3.0 and bloom 0.55 stay the PRD GD-02/GD-08 values).
    hdri: { id: "cobblestone_street_night", intensity: 0.3, rotationDeg: 210 },
    sky: {
      model: "gradient", zenith: "#060a14", horizon: "#1b2638", ground: "#0b0e14", exponent: 1.8, horizonGlow: 0.2,
      bands: [{ elevationDeg: 2, widthDeg: 6, color: SODIUM, intensity: 0.35 }],
      stars: { count: 220, brightness: 0.7 }
    },
    sun: { elevationDeg: 40, azimuthDeg: 210, color: "#9db4e0", intensity: 0.4, discSize: 0.02 },
    key: { color: "#9db4e0", intensity: 0.25 },
    hemisphere: { sky: "#22324a", ground: "#3a2a1c", intensity: 0.3 },
    fog: { color: "#3c4a54", density: 0.0018, heightDensity: 0.0012, heightFalloff: 0, heightReference: 36, start: 10, maxOpacity: 0.6, sunInscatter: 0 },
    marine: { base: 36, top: 60, color: "#3d3833", opacity: 0.55, reach: 220 },
    // GU47 phase 3: recap2 night p95 141 (band >= 180): exposure 1.1 -> 1.18, contrast 1.1 -> 1.18 lift the lamp highlights.
    output: { toneMapping: "aces", fallback: "aces", exposure: 1.18 },
    bloom: { intensity: 0.55, threshold: 0.72, radius: 0.55 },
    grade: { contrast: 1.18, saturation: 1.08, temperature: 0.08, tint: 0 },
    vignette: 0.3,
    godRays: null,
    grain: 0.06,
    // GU47 phase 3: windowGlow 1 -> 0.45: the whole-facade lift washed every block orange-beige (no window mask until WP-36).
    street: { lampEmissive: 3.0, sodiumPoints: 3, sodiumPower: 1400, lightPools: 0.6, windowGlow: 0.45, headlights: 1.8, asphalt: { color: "#15191f", roughness: 0.22 }, ground: "#0b0f19", water: "#081c2e", drizzle: true },
    scanStrength: 1.25
  }
};

/** Served URL of a catalogue HDRI (E-A: `/hdri/<id>_1k.hdr`). 2k copies are a handoff to E-A (EXECUTION.md). */
export const hdriUrl = (id: HdriId): string => `/hdri/${id}_1k.hdr`;

/**
 * Unit direction towards the sun, in the sky's own convention (`packages/rendering/src/atmosphere/PreethamSky.ts`
 * `sunDirection`: x = cos(el) sin(az), y = sin(el), z = cos(el) cos(az)). The scene camera looks down -z, so an azimuth
 * near 180 deg puts the sun in frame. The key light sits on this ray, so it is aligned with the visible disc (GD-01).
 */
export function sunDirection(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}

/** Key light position on the sun ray (the light shines from here towards the origin). */
export function keyLightPosition(look: SkyLook, distance = 140): [number, number, number] {
  const d = sunDirection(look.sun.elevationDeg, look.sun.azimuthDeg);
  return [d[0] * distance, d[1] * distance, d[2] * distance];
}

/**
 * CPU mirror of the engine fog this row asks for (`HeightFog.ts` `heightFogTau` with b = 0): the opacity of the haze
 * between the camera and a point `distance` metres away. Used by the tests for "clear lane lines at 40 m".
 */
export function hazeAt(look: SkyLook, distance: number): number {
  const d = Math.max(0, distance - look.fog.start);
  return Math.min(look.fog.maxOpacity, 1 - Math.exp(-(look.fog.density + look.fog.heightDensity) * d));
}

/** GD-01: one shadowed key on every sky, 2048 map, 3 cascades, PCSS. */
export const KEY_SHADOW = { mapSize: 2048, cascades: 3, filter: "pcss", maxDistance: 120, softness: 1 } as const;

/** Next sky in the `T` key cycle. */
export const nextSky = (sky: SkyId): SkyId => SKY_ORDER[(SKY_ORDER.indexOf(sky) + 1) % SKY_ORDER.length]!;

/** `?sky=` URL param (also accepts `dusk`); anything else boots Marine dusk. */
export function skyFromParam(value: string | null | undefined): SkyId {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "dusk" || v === "golden") return "golden";
  if (v === "noon" || v === "fog" || v === "night") return v;
  return BOOT_SKY;
}
