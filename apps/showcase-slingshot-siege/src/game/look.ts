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
  /** The island's side wall under the turf (the lip the camera sees along the front edge). */
  readonly lip: string;
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
  /**
   * GU47 phase 3 (4.7.1): the animated world-water ocean. Off on the day chapters: on software WebGL2 its waves and
   * foam drew through the island near the arch and the windmill (blind panel p2b); the flat seabed sea shows instead.
   */
  readonly worldWater: boolean;
  /**
   * GU47 phase 3: the rock GLBs keep their authored rock texture under a multiply tint (true) instead of a flat
   * replacement colour (false). The flat colour lost every surface detail on the cliffs (blind panel p2b).
   */
  readonly rockTexture: boolean;
  /** Rock tint: the multiply colour when `rockTexture`, else the flat replacement colour (undefined: wet rock/chalk). */
  readonly rockTint?: AuraColor;
  /**
   * GU47 phase 3: fortress "block" pieces draw as rounded solid blocks with the per-material look (exactly the sim's
   * box half extents) instead of the scaled stone-bridge GLB, whose open arches read as floating domes.
   */
  readonly solidBlocks: boolean;
  /**
   * GU47 phase 3: whether the look fog tints the sky node. With fog on, a sky at infinite distance takes the full fog
   * colour, which is why the GU47 day skies read as a flat grey-beige wall (blind panel p2b); the day rows draw the
   * gradient and clouds unfogged.
   */
  readonly skyFog: boolean;
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
  driftwood: SIEGE_PALETTE.driftwood,
  lip: SIEGE_PALETTE.chalk
};

/**
 * The day island after the GU47 phase-3 relight: richer turf and an earth-brown lip (the chalk lip read as a white
 * rim under a front sun).
 */
const DAY_ISLAND: ChapterTerrain = { ...ISLAND, turf: "#4c8c3c", lip: "#6b5a44" };

/**
 * Six chapters, one day: a crisp morning to a starry night.
 *
 * GU47 phase 3 (4.7.1): chapters 0-4 are relit after the blind panel p2b picked the 4.6.2 frame 0/3 on each (cliffs
 * crushed to black by a sun behind the island, a flat grey-beige sky, sun glare beside the windmill and behind the
 * arch, green fog over the right half, orange haze over the sling, the sea through the island). Every day sun now
 * sits on the camera side (azimuth 295-340, so it lights the cliff faces and never enters the frame), fog is pushed
 * past the horizon, every sky is a blue gradient with clouds whose horizon carries the time of day, the image light
 * is the fill, the rocks keep their texture, and the world-water sea is off. Chapter 5 is unchanged (panel: better).
 */
export const CHAPTER_LOOKS: readonly ChapterLook[] = [
  {
    chapter: 0,
    timeOfDay: "crisp morning",
    preset: "outdoor-day",
    hdri: "spruit_sunrise",
    environmentIntensity: 1.0,
    environmentRotationDeg: 330,
    exposureEv: -0.35,
    sun: { elevationDeg: 38, azimuthDeg: 325, color: "#ffe6c8", intensity: 3.0 },
    shadowSoftness: 1.2,
    fog: { color: "#d8e6f0", near: 400, far: 4000 },
    horizon: "#cfe2f0",
    sky: {
      model: "gradient",
      zenith: "#3f82cf",
      horizon: "#d6e8f4",
      ground: SIEGE_PALETTE.seaTeal,
      exponent: 0.6,
      horizonGlow: 0.15,
      clouds: { coverage: 0.38, speed: 0.6, color: "#ffffff" }
    },
    post: "daylight-outdoor",
    grade: { contrast: 1.08, saturation: 1.06, temperature: 0.04, tint: 0 },
    bloom: { threshold: 0.95, intensity: 0.12 },
    vignette: 0.18,
    dof: { maxBlur: 2.5, bandWidth: 0.5 },
    accent: SIEGE_PALETTE.pennantRed,
    practicals: { windows: false, lighthouse: false, lanterns: false },
    flare: false,
    weather: "none",
    terrain: DAY_ISLAND,
    worldWater: false,
    rockTexture: true,
    rockTint: "#ffffff",
    solidBlocks: true,
    skyFog: false
  },
  {
    chapter: 1,
    timeOfDay: "bright noon",
    preset: "outdoor-day",
    hdri: "outdoor-midday",
    environmentIntensity: 1.0,
    environmentRotationDeg: 340,
    exposureEv: -0.4,
    sun: { elevationDeg: 62, azimuthDeg: 340, color: "#fff6e6", intensity: 3.2 },
    shadowSoftness: 0.9,
    fog: { color: "#d4e2ee", near: 400, far: 4000 },
    horizon: "#c8def0",
    sky: {
      model: "gradient",
      zenith: "#2a68b6",
      horizon: "#c9e0f2",
      ground: SIEGE_PALETTE.seaTeal,
      exponent: 0.8,
      horizonGlow: 0.1,
      clouds: { coverage: 0.26, speed: 0.4, color: "#fbfaf6" }
    },
    post: "daylight-outdoor",
    grade: { contrast: 1.1, saturation: 1.08, temperature: 0.07, tint: 0.01 },
    bloom: { threshold: 0.95, intensity: 0.12 },
    vignette: 0.18,
    dof: { maxBlur: 2.5, bandWidth: 0.5 },
    accent: SIEGE_PALETTE.pennantRed,
    practicals: { windows: false, lighthouse: false, lanterns: false },
    flare: false,
    weather: "dust",
    terrain: { ...DAY_ISLAND, turf: "#5b9140" },
    worldWater: false,
    rockTexture: true,
    rockTint: "#ffffff",
    solidBlocks: true,
    skyFog: false
  },
  {
    chapter: 2,
    timeOfDay: "breezy late morning after rain",
    preset: "outdoor-day",
    hdri: "spruit_sunrise",
    environmentIntensity: 1.0,
    environmentRotationDeg: 315,
    exposureEv: -0.3,
    sun: { elevationDeg: 48, azimuthDeg: 315, color: "#f4f6ff", intensity: 2.8 },
    shadowSoftness: 2.0,
    fog: { color: "#d2e2ec", near: 400, far: 4000 },
    horizon: "#d4e6ef",
    sky: {
      model: "gradient",
      zenith: "#4a8bd2",
      horizon: "#dceaf2",
      ground: "#3f8a90",
      exponent: 0.7,
      horizonGlow: 0.08,
      clouds: { coverage: 0.58, speed: 0.9, color: "#ffffff" }
    },
    post: "daylight-outdoor",
    grade: { contrast: 1.08, saturation: 1.04, temperature: -0.04, tint: 0 },
    bloom: { threshold: 0.95, intensity: 0.12 },
    vignette: 0.18,
    dof: { maxBlur: 2.5, bandWidth: 0.5 },
    accent: SIEGE_PALETTE.pennantRed,
    practicals: { windows: false, lighthouse: false, lanterns: false },
    flare: false,
    weather: "none",
    terrain: { ...DAY_ISLAND, turf: "#438a45" },
    worldWater: false,
    rockTexture: true,
    rockTint: "#ffffff",
    solidBlocks: true,
    skyFog: false
  },
  {
    chapter: 3,
    timeOfDay: "golden hour",
    preset: "golden-hour",
    hdri: "kloppenheim_06_puresky",
    environmentIntensity: 1.0,
    environmentRotationDeg: 300,
    exposureEv: -0.3,
    sun: { elevationDeg: 22, azimuthDeg: 300, color: "#ffc183", intensity: 3.0 },
    shadowSoftness: 1.4,
    fog: { color: "#f0c9a2", near: 400, far: 4000 },
    horizon: "#f3c79a",
    sky: {
      model: "gradient",
      zenith: "#4f77b8",
      horizon: "#f6c99a",
      ground: "#3f7c80",
      exponent: 0.55,
      horizonGlow: 0.25,
      clouds: { coverage: 0.34, speed: 0.5, color: "#ffdcb4" }
    },
    post: "cinematic-film",
    grade: { contrast: 1.1, saturation: 1.08, temperature: 0.24, tint: 0.02 },
    bloom: { threshold: 0.95, intensity: 0.14 },
    vignette: 0.2,
    dof: { maxBlur: 2.5, bandWidth: 0.5 },
    accent: SIEGE_PALETTE.pennantRed,
    practicals: { windows: false, lighthouse: false, lanterns: false },
    flare: false,
    weather: "none",
    terrain: DAY_ISLAND,
    worldWater: false,
    rockTexture: true,
    rockTint: "#ffffff",
    solidBlocks: true,
    skyFog: false
  },
  {
    chapter: 4,
    timeOfDay: "red sunset",
    preset: "golden-hour",
    hdri: "belfast_sunset_puresky",
    environmentIntensity: 1.0,
    environmentRotationDeg: 295,
    exposureEv: -0.35,
    sun: { elevationDeg: 16, azimuthDeg: 295, color: "#ff9a62", intensity: 3.0 },
    shadowSoftness: 1.6,
    fog: { color: "#d99a86", near: 400, far: 4000 },
    horizon: "#f0a27c",
    sky: {
      model: "gradient",
      zenith: "#2e4a8a",
      horizon: "#f2a07a",
      ground: "#33606a",
      exponent: 0.5,
      horizonGlow: 0.3,
      clouds: { coverage: 0.42, speed: 0.8, color: "#f3b39a" }
    },
    post: "cinematic-film",
    grade: { contrast: 1.12, saturation: 1.1, temperature: 0.3, tint: 0.04 },
    bloom: { threshold: 0.95, intensity: 0.14 },
    vignette: 0.22,
    dof: { maxBlur: 2.5, bandWidth: 0.5 },
    accent: SIEGE_PALETTE.pennantRed,
    practicals: { windows: true, lighthouse: false, lanterns: false },
    flare: false,
    weather: "none",
    terrain: DAY_ISLAND,
    worldWater: false,
    rockTexture: true,
    rockTint: "#ffffff",
    solidBlocks: true,
    skyFog: false
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
    terrain: ISLAND,
    worldWater: true,
    rockTexture: false,
    solidBlocks: false,
    skyFog: true
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
 * Chapters whose default is the 4.6.2 look. GU47 blind-panel fix pass: default and chapters 0-4 lost 0/3 to the
 * 4.6.2 frame (round p2b) and went back to the 4.6.2 look. GU47 phase 3 (4.7.1): the relit rows above are the
 * candidate look; a chapter leaves this set only after a blind panel picks its new frame (at least 2 of 3 judges).
 */
export const ORIGINAL_LOOK_CHAPTERS: ReadonlySet<number> = new Set([]);

/** `?look=original` forces the 4.6.2 look, `?look=gu47` the look table; otherwise the per-chapter default. */
export function useOriginalLook(chapter: number, param: string | null): boolean {
  if (param === "original") return true;
  if (param === "gu47" || param === "new") return false;
  return ORIGINAL_LOOK_CHAPTERS.has(chapterLook(chapter).chapter);
}
