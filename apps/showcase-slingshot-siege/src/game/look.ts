/**
 * Slingshot Siege — the GU47 look table (WP-22, PRD §3.2 item 2): one row per
 * chapter variant (`?level=5c` opens chapter c), "a painted wooden toy siege
 * diorama through one day". Presentation only: nothing here feeds the sim.
 *
 * Every row names its look preset and catalogue HDRI (E-A look override, image
 * lighting only: the visible sky is the row's sky node), one shadowed sun
 * (SS47-L1 elevations 35/62/48/14/8/30), fog (back on, SS47-E1), the real sky
 * (gradient by day, Preetham at golden hour and sunset, stars at night,
 * SS47-E2), the output preset and grade (SS47-P2), bloom and vignette
 * (SS47-P3), the signature miniature depth-of-field band (SS47-P1), the
 * chapter practicals (SS47-L3) and weather (SS47-E4).
 *
 * The island keeps one albedo set all day (bleached sand, sea-meadow turf,
 * chalk cliffs, sea teal); light, sky and grade carry the time of day.
 */
import type { AuraColor, AuraHdriId, AuraLookId, AuraPostPresetId, AuraSkySpec } from "@aura3d/engine";

export type ChapterWeather = "none" | "dust" | "mist" | "drizzle";

export interface ChapterSun {
  /** Degrees above the horizon (SS47-L1). */
  readonly elevationDeg: number;
  /** Degrees clockwise from +Z (the camera side); 180 puts the sun over the sea horizon. */
  readonly azimuthDeg: number;
  readonly color: AuraColor;
  readonly intensity: number;
}

export interface ChapterTerrain {
  readonly turf: string;
  readonly sand: string;
  readonly chalk: string;
  readonly wetRock: string;
  readonly shallows: string;
  readonly sea: string;
  readonly driftwood: string;
}

export interface ChapterLook {
  readonly chapter: number;
  readonly timeOfDay: string;
  readonly preset: AuraLookId;
  /** E-A catalogue HDRI for image lighting; undefined keeps the preset's own environment. */
  readonly hdri?: AuraHdriId;
  readonly environmentIntensity: number;
  readonly environmentRotationDeg: number;
  readonly exposureEv: number;
  readonly sun: ChapterSun;
  /** PCSS light size: larger is softer (overcast). */
  readonly shadowSoftness: number;
  /**
   * Look fog range in metres (density 24 / far); the horizon colour hides the sea edge. GU47 phase 2: far is
   * 800-1500 m (density 0.016-0.03); the first table (far 150-320, density 0.075-0.16 exp2) buried the island in haze.
   */
  readonly fog: { readonly color: AuraColor; readonly near: number; readonly far: number };
  /** Scene clear colour behind the sky node (the horizon colour, so a frame before the sky draws is not blue). */
  readonly horizon: AuraColor;
  readonly sky: AuraSkySpec;
  readonly post: AuraPostPresetId;
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
  readonly bloom: { readonly threshold: number; readonly intensity: number };
  readonly vignette: number;
  /** Signature miniature DOF: band (frame-height units, 0 top) used before the camera reports its own. */
  readonly dof: { readonly maxBlur: number; readonly bandWidth: number };
  readonly accent: AuraColor;
  readonly practicals: { readonly windows: boolean; readonly lighthouse: boolean; readonly lanterns: boolean };
  readonly flare: boolean;
  readonly weather: ChapterWeather;
  readonly terrain: ChapterTerrain;
}

/** Brand palette (PRD WP-22 identity). */
export const SIEGE_PALETTE = {
  seaTeal: "#2f8f9d",
  bleachedSand: "#e9d6a8",
  chalk: "#ece7da",
  driftwood: "#a08466",
  pennantRed: "#e2483d",
  lanternAmber: "#ffb347"
} as const;

const ISLAND: ChapterTerrain = {
  turf: "#4f8a3e",
  sand: SIEGE_PALETTE.bleachedSand,
  chalk: SIEGE_PALETTE.chalk,
  wetRock: "#5f5b52",
  shallows: "#5fb3ae",
  sea: SIEGE_PALETTE.seaTeal,
  driftwood: SIEGE_PALETTE.driftwood
};

/** Six chapters, one day: crisp morning to a starry night. */
export const CHAPTER_LOOKS: readonly ChapterLook[] = [
  {
    chapter: 0,
    timeOfDay: "crisp morning",
    preset: "outdoor-day",
    hdri: "spruit_sunrise",
    environmentIntensity: 1.0,
    environmentRotationDeg: 118,
    exposureEv: -0.05,
    sun: { elevationDeg: 35, azimuthDeg: 118, color: "#ffe2c2", intensity: 3.2 },
    shadowSoftness: 1.2,
    fog: { color: "#e6dccd", near: 90, far: 1500 },
    horizon: "#efdcc4",
    sky: {
      model: "gradient",
      zenith: "#4a8fd0",
      horizon: "#f2dcc2",
      ground: SIEGE_PALETTE.seaTeal,
      exponent: 0.55,
      horizonGlow: 0.35,
      sun: { elevationDeg: 35, azimuthDeg: 118, intensity: 1.2, color: "#fff1dc", discSize: 0.02 },
      clouds: { coverage: 0.22, speed: 0.6, color: "#fff6ec" }
    },
    post: "daylight-outdoor",
    grade: { contrast: 1.06, saturation: 1.05, temperature: 0.04, tint: 0 },
    bloom: { threshold: 0.9, intensity: 0.22 },
    vignette: 0.18,
    dof: { maxBlur: 5, bandWidth: 0.34 },
    accent: SIEGE_PALETTE.pennantRed,
    practicals: { windows: false, lighthouse: false, lanterns: false },
    flare: false,
    weather: "none",
    terrain: ISLAND
  },
  {
    chapter: 1,
    timeOfDay: "dusty noon",
    preset: "outdoor-day",
    hdri: "outdoor-midday",
    environmentIntensity: 1.0,
    environmentRotationDeg: 160,
    exposureEv: -0.15,
    sun: { elevationDeg: 62, azimuthDeg: 160, color: "#fff5e4", intensity: 3.6 },
    shadowSoftness: 0.9,
    fog: { color: "#dcd3bd", near: 80, far: 1300 },
    horizon: "#dcd8c8",
    sky: {
      model: "gradient",
      zenith: "#2e6fb8",
      horizon: "#dcd8c6",
      ground: SIEGE_PALETTE.seaTeal,
      exponent: 0.8,
      horizonGlow: 0.2,
      sun: { elevationDeg: 62, azimuthDeg: 160, intensity: 1.4, color: "#fffaf0", discSize: 0.018 },
      clouds: { coverage: 0.12, speed: 0.4, color: "#f5eee0" }
    },
    post: "daylight-outdoor",
    grade: { contrast: 1.1, saturation: 0.95, temperature: 0.08, tint: 0.02 },
    bloom: { threshold: 0.9, intensity: 0.2 },
    vignette: 0.18,
    dof: { maxBlur: 4.5, bandWidth: 0.36 },
    accent: SIEGE_PALETTE.pennantRed,
    practicals: { windows: false, lighthouse: false, lanterns: false },
    flare: false,
    weather: "dust",
    terrain: { ...ISLAND, turf: "#6a9446" }
  },
  {
    chapter: 2,
    timeOfDay: "misty overcast",
    preset: "overcast",
    environmentIntensity: 1.6,
    environmentRotationDeg: 40,
    exposureEv: 0.1,
    sun: { elevationDeg: 48, azimuthDeg: 100, color: "#e4eaf0", intensity: 1.5 },
    shadowSoftness: 3.2,
    fog: { color: "#c8cfd2", near: 50, far: 800 },
    horizon: "#cbd1d4",
    sky: {
      model: "gradient",
      zenith: "#97a3ac",
      horizon: "#ced4d7",
      ground: "#55807f",
      exponent: 1.0,
      horizonGlow: 0.1,
      clouds: { coverage: 0.9, speed: 0.3, color: "#dadfe2" }
    },
    post: "daylight-outdoor",
    grade: { contrast: 0.97, saturation: 0.86, temperature: -0.06, tint: 0 },
    bloom: { threshold: 0.9, intensity: 0.16 },
    vignette: 0.2,
    dof: { maxBlur: 5, bandWidth: 0.32 },
    accent: SIEGE_PALETTE.pennantRed,
    practicals: { windows: false, lighthouse: false, lanterns: false },
    flare: false,
    weather: "mist",
    terrain: ISLAND
  },
  {
    chapter: 3,
    timeOfDay: "golden hour",
    preset: "golden-hour",
    hdri: "kloppenheim_06_puresky",
    environmentIntensity: 1.0,
    environmentRotationDeg: 145,
    exposureEv: 0,
    sun: { elevationDeg: 14, azimuthDeg: 145, color: "#ffb26a", intensity: 2.8 },
    shadowSoftness: 1.4,
    fog: { color: "#e2aa7c", near: 80, far: 1300 },
    horizon: "#eab487",
    sky: {
      model: "preetham",
      sun: { elevationDeg: 14, azimuthDeg: 145, intensity: 1.2, color: "#ffcf96" },
      turbidity: 4.5,
      rayleigh: 1.6,
      mieCoefficient: 0.006,
      mieDirectionalG: 0.85,
      clouds: { coverage: 0.3, speed: 0.5, color: "#ffd3a2" },
      groundColor: "#4c6f6c"
    },
    post: "cinematic-film",
    grade: { contrast: 1.08, saturation: 1.08, temperature: 0.28, tint: 0.02 },
    bloom: { threshold: 0.85, intensity: 0.3 },
    vignette: 0.22,
    dof: { maxBlur: 5.5, bandWidth: 0.32 },
    accent: SIEGE_PALETTE.pennantRed,
    practicals: { windows: false, lighthouse: false, lanterns: false },
    // GU47 phase 2: off; on software WebGL2 the sun flare drew a screen-wide glow blob over the fort or the sling.
    flare: false,
    weather: "none",
    terrain: ISLAND
  },
  {
    chapter: 4,
    timeOfDay: "stormy red sunset with drizzle",
    preset: "golden-hour",
    hdri: "belfast_sunset_puresky",
    environmentIntensity: 2.2,
    environmentRotationDeg: 215,
    // GU47 phase 2: -0.35 EV and a softer bloom; at +0.05 EV the island and sea washed out white (mean 128, p95 218).
    exposureEv: -0.35,
    sun: { elevationDeg: 8, azimuthDeg: 215, color: "#ff7c4c", intensity: 2.4 },
    shadowSoftness: 2.0,
    fog: { color: "#b56c5e", near: 70, far: 1000 },
    horizon: "#c27a62",
    sky: {
      model: "preetham",
      sun: { elevationDeg: 8, azimuthDeg: 215, intensity: 1.1, color: "#ff9a6a" },
      turbidity: 9,
      rayleigh: 3,
      mieCoefficient: 0.012,
      mieDirectionalG: 0.9,
      clouds: { coverage: 0.65, speed: 1.4, color: "#9c5a52" },
      groundColor: "#3a4a4e"
    },
    post: "cinematic-film",
    grade: { contrast: 1.12, saturation: 1.1, temperature: 0.35, tint: 0.05 },
    bloom: { threshold: 0.9, intensity: 0.2 },
    vignette: 0.26,
    dof: { maxBlur: 6, bandWidth: 0.3 },
    accent: SIEGE_PALETTE.pennantRed,
    practicals: { windows: true, lighthouse: false, lanterns: false },
    // GU47 phase 2: off; on software WebGL2 the sun flare drew a screen-wide glow blob over the fort or the sling.
    flare: false,
    weather: "drizzle",
    terrain: ISLAND
  },
  {
    chapter: 5,
    timeOfDay: "starry night with lantern light",
    preset: "polar-night",
    hdri: "deep_space_starfield",
    // GU47 phase 2: the 4.6.2-era island read at night needs a strong moon and +1.2 EV (mean 9.6 at +0.15 EV, 1.1 moon).
    environmentIntensity: 1.8,
    environmentRotationDeg: 0,
    exposureEv: 1.2,
    sun: { elevationDeg: 30, azimuthDeg: 300, color: "#9db8e8", intensity: 2.8 },
    shadowSoftness: 1.6,
    fog: { color: "#0e1729", near: 80, far: 1200 },
    horizon: "#16233f",
    sky: {
      model: "gradient",
      zenith: "#050a1a",
      horizon: "#1a2848",
      ground: "#050912",
      exponent: 0.7,
      horizonGlow: 0.15,
      stars: { count: 1400, brightness: 1.3 }
    },
    post: "neon-night",
    grade: { contrast: 1.08, saturation: 0.9, temperature: -0.22, tint: 0 },
    bloom: { threshold: 0.6, intensity: 0.45 },
    vignette: 0.3,
    dof: { maxBlur: 5, bandWidth: 0.32 },
    accent: SIEGE_PALETTE.lanternAmber,
    practicals: { windows: true, lighthouse: true, lanterns: true },
    flare: false,
    weather: "none",
    terrain: ISLAND
  }
];

/** The look row of a chapter (clamped, so the sandbox and bad ids fall back to chapter 0). */
export function chapterLook(chapter: number): ChapterLook {
  return CHAPTER_LOOKS[Math.min(Math.max(0, Math.trunc(chapter) || 0), CHAPTER_LOOKS.length - 1)]!;
}

/** Unit vector from the island towards the sun (same convention as the look's sun angles). */
export function sunDirection(sun: Pick<ChapterSun, "elevationDeg" | "azimuthDeg">): readonly [number, number, number] {
  const el = (sun.elevationDeg * Math.PI) / 180;
  const az = (sun.azimuthDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}

/**
 * GU47 blind-panel fix pass: chapters whose default is the 4.6.2 look. Three blind judges picked the 4.6.2 frame
 * over the GU47 look on default and chapters 0-4 (0/3 each); only the starry night (ch5) was judged better.
 */
export const ORIGINAL_LOOK_CHAPTERS: ReadonlySet<number> = new Set([0, 1, 2, 3, 4]);

/** `?look=original` forces the 4.6.2 look, `?look=gu47` the look table; otherwise the per-chapter default. */
export function useOriginalLook(chapter: number, param: string | null): boolean {
  if (param === "original") return true;
  if (param === "gu47" || param === "new") return false;
  return ORIGINAL_LOOK_CHAPTERS.has(chapterLook(chapter).chapter);
}
