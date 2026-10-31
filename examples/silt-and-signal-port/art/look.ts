/**
 * GU47 WP-34 (G24) look table: seven chapters are seven hours of one long day, a hand-inked gouache travel poster.
 *
 * One row per chapter (the variants `?chapter=0..6&start=1`). Every visual knob the inked look changes lives here:
 * the key light (elevation, azimuth, colour, intensity; DG-L1), the IBL source (DG-L2), the rim (DG-L3), night
 * practicals (DG-L4), the sky dome (DG-S1), height fog (DG-S3), the ink pass (DG-P1), the grade (DG-P2), bloom (DG-P3)
 * and the signature sand wake (DG-V1). `?look=original` keeps today's look (world.ts `rigOf`, no tone mapping).
 *
 * Azimuth is degrees clockwise from north (-Z) toward east (+X); elevation is degrees above the horizon. The sky's
 * sun disc, the water glint and the shadowed key all read the same vector (`keyDirection`).
 */
import type { AuraHdriId } from "@aura3d/engine";

export type SiltLookMode = "inked" | "original";

/**
 * GU47 phase 2 (PRD D11, no regression ships): chapters whose inked frame did not beat the 4.6.2 frame after two
 * remote capture rounds (software WebGL2) open in the original look by default; `?look=inked` still opts in.
 * Blind-panel fix pass: ch4 storm (grey, muddy, horizon halo) and the bare entry URL (no `chapter` param: sepia wash,
 * tiny rider) were judged worse than 4.6.2 and shipped the 4.6.2 look. Phase 3 (4.7.1) reworked both (storm light over
 * green orchard grass with dark ridges under a bright horizon gap; a closer title orbit and a cleaner dusk grade), so
 * they open in the inked look again (blind-panel tally in lanes/g24.md).
 */
export const ORIGINAL_DEFAULT_CHAPTERS: ReadonlySet<number> = new Set([1, 6]);

/** The bare entry URL (no `chapter` param) opens the 4.6.2 look when true (blind-panel fallback). */
export const BARE_ENTRY_ORIGINAL = false;

/**
 * `?look=original` is today's look (PRD §6.1 ports keep it); `?look=inked` is the inked poster look. Without a `look`
 * param the chapter decides: inked, except the ORIGINAL_DEFAULT_CHAPTERS; the bare entry URL (no `chapter`) is chapter 0.
 */
export function siltLookMode(search: string | URLSearchParams | undefined): SiltLookMode {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const look = params?.get("look");
  if (look === "original") return "original";
  if (look === "inked") return "inked";
  const raw = params?.get("chapter");
  if (BARE_ENTRY_ORIGINAL && (raw === null || raw === undefined)) return "original";
  const chapter = Math.trunc(Number(raw ?? 0));
  return ORIGINAL_DEFAULT_CHAPTERS.has(Number.isFinite(chapter) ? chapter : 0) ? "original" : "inked";
}

export type AmbientMotes = "sand" | "fireflies" | "wick-glow" | "pollen" | "embers";

export interface ChapterLook {
  readonly chapter: number;
  /** Hour of the one long day this chapter shows. */
  readonly hour: string;
  readonly night: boolean;
  /** DG-L1: the one shadowed key (sun by day, moon by night). */
  readonly key: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number };
  /** DG-L3: unshadowed jade-white rim opposite the key, always below it. */
  readonly rim: { readonly color: string; readonly intensity: number };
  /** DG-L2: IBL only (the custom dome stays the visible sky). Night chapters keep the neutral probe at 0.35. */
  readonly hdri: AuraHdriId | null;
  readonly environmentIntensity: number;
  readonly environmentRotationDeg: number;
  /** DG-L4: amber point lights along the ring route (night chapters only; the art direction caps practicals at 6). */
  readonly practicals: number;
  /** DG-L5: PCSS long shadows (low-sun chapters). */
  readonly pcss: boolean;
  /** DG-S1: dome colours (sRGB hex), sun or moon disc, inked cirrus bands, horizon dust band, storm cover. */
  readonly sky: { readonly top: string; readonly horizon: string; readonly discSize: number; readonly glow: number; readonly cirrus: number; readonly dust: number; readonly storm: number; readonly stars: number };
  /** DG-S3: height-fog ground haze (A3D_QR_VFX_FOG, default-on). */
  readonly fog: { readonly color: string; readonly density: number; readonly heightFalloff: number; readonly heightReference: number; readonly maxOpacity: number };
  /** DG-P2: ACES output exposure plus the grade. */
  readonly grade: { readonly exposure: number; readonly contrast: number; readonly saturation: number; readonly temperature: number };
  /** DG-P3: bloom only on HDR emissives (threshold 1.0). */
  readonly bloom: { readonly intensity: number; readonly threshold: 1 };
  /** DG-P1: ink colour (umber by day, indigo at night) and luma bands (4 by day, 6 at night). */
  readonly ink: { readonly color: string; readonly bands: number };
  /** DG-V1 signature: sand wake colour and per-second emission at full speed. */
  readonly wake: { readonly color: string; readonly rate: number };
  /** DG-V4: the chapter's ambient emitter. */
  readonly motes: { readonly kind: AmbientMotes; readonly color: string };
  /** DG-S5: rain in the storm chapter only. */
  readonly rain: boolean;
  /** Ground set in the inked look: warm sand (DG-M1) or the storm chapter's rain-green orchard grass. */
  readonly ground: "sand" | "orchard";
  /** Colour the DG-S2 horizon rings fade into (defaults to the fog colour); the storm darkens them into ridges. */
  readonly ridge?: string;
  /** DG-S4: god rays from the low sun (ch0) or moon shafts (ch2). */
  readonly godRays: boolean;
  /** DG-L6: low-sun lens flare (ch0, ch6). */
  readonly lensFlare: boolean;
}

/** The poster palette (sRGB). Jade is reserved for rings, the board strips and the HUD. */
export const SILT_PALETTE = {
  sandstone: "#d6a467",
  terracotta: "#b4532f",
  bone: "#efe4cf",
  indigo: "#2a2e5c",
  jade: "#2fae86",
  jadeWhite: "#c9f2e1",
  umber: "#5a3a22",
  inkIndigo: "#1f2550"
} as const;

const DAY_INK = { color: SILT_PALETTE.umber, bands: 4 } as const;
const NIGHT_INK = { color: SILT_PALETTE.inkIndigo, bands: 6 } as const;

export const CHAPTER_LOOKS: readonly ChapterLook[] = [
  {
    chapter: 0, hour: "amber dusk (19:10)", night: false,
    key: { elevationDeg: 9, azimuthDeg: 250, color: "#ffb26a", intensity: 2.6 },
    rim: { color: SILT_PALETTE.jadeWhite, intensity: 0.55 },
    hdri: "belfast_sunset_puresky", environmentIntensity: 0.9, environmentRotationDeg: 250, practicals: 0, pcss: true,
    sky: { top: "#6d7ca6", horizon: "#f2a35c", discSize: 0.035, glow: 0.9, cirrus: 0.75, dust: 0.7, storm: 0, stars: 0 },
    fog: { color: "#dcb58e", density: 0.00052, heightFalloff: 0.05, heightReference: 0, maxOpacity: 0.4 },
    grade: { exposure: 1.0, contrast: 1.14, saturation: 1.16, temperature: 0.05 },
    bloom: { intensity: 0.38, threshold: 1 }, ink: DAY_INK,
    wake: { color: "#e8b678", rate: 140 }, motes: { kind: "sand", color: "#f0c58a" },
    ground: "sand", rain: false, godRays: true, lensFlare: true
  },
  {
    chapter: 1, hour: "white-hot noon (12:40)", night: false,
    key: { elevationDeg: 64, azimuthDeg: 160, color: "#fff3df", intensity: 2.8 },
    rim: { color: SILT_PALETTE.jadeWhite, intensity: 0.45 },
    hdri: "outdoor-midday", environmentIntensity: 1.0, environmentRotationDeg: 160, practicals: 0, pcss: false,
    sky: { top: "#5f9ad0", horizon: "#e6d2aa", discSize: 0.028, glow: 0.6, cirrus: 0.45, dust: 0.4, storm: 0, stars: 0 },
    fog: { color: "#d9c39a", density: 0.0003, heightFalloff: 0.035, heightReference: 0, maxOpacity: 0.35 },
    grade: { exposure: 0.85, contrast: 1.14, saturation: 1.06, temperature: 0.08 },
    bloom: { intensity: 0.3, threshold: 1 }, ink: DAY_INK,
    wake: { color: "#f1d6a8", rate: 160 }, motes: { kind: "sand", color: "#f4e2c0" },
    ground: "sand", rain: false, godRays: false, lensFlare: false
  },
  {
    chapter: 2, hour: "indigo moonlight under the roots (23:30)", night: true,
    key: { elevationDeg: 28, azimuthDeg: 40, color: "#9fb4ff", intensity: 0.75 },
    rim: { color: SILT_PALETTE.jadeWhite, intensity: 0.35 },
    hdri: null, environmentIntensity: 0.35, environmentRotationDeg: 0, practicals: 5, pcss: false,
    sky: { top: "#0b1131", horizon: "#2a3470", discSize: 0.02, glow: 0.5, cirrus: 0.3, dust: 0.15, storm: 0, stars: 1 },
    fog: { color: "#26305e", density: 0.00096, heightFalloff: 0.05, heightReference: 0, maxOpacity: 0.55 },
    grade: { exposure: 1.3, contrast: 1.06, saturation: 1.0, temperature: -0.18 },
    bloom: { intensity: 0.6, threshold: 1 }, ink: NIGHT_INK,
    wake: { color: "#8ea6d8", rate: 110 }, motes: { kind: "fireflies", color: "#d9f06a" },
    ground: "sand", rain: false, godRays: true, lensFlare: false
  },
  {
    chapter: 3, hour: "teal lantern-dusk over the reef (18:20)", night: false,
    key: { elevationDeg: 14, azimuthDeg: 290, color: "#ff9a5e", intensity: 1.8 },
    rim: { color: SILT_PALETTE.jadeWhite, intensity: 0.5 },
    hdri: "industrial_sunset_puresky", environmentIntensity: 0.8, environmentRotationDeg: 290, practicals: 0, pcss: true,
    sky: { top: "#1f4f62", horizon: "#e48c5c", discSize: 0.032, glow: 0.8, cirrus: 0.6, dust: 0.4, storm: 0, stars: 0.2 },
    fog: { color: "#4f8a86", density: 0.00055, heightFalloff: 0.05, heightReference: 0, maxOpacity: 0.4 },
    grade: { exposure: 1.18, contrast: 1.1, saturation: 1.12, temperature: -0.02 },
    bloom: { intensity: 0.45, threshold: 1 }, ink: DAY_INK,
    wake: { color: "#cfa57a", rate: 130 }, motes: { kind: "wick-glow", color: "#ffbf6a" },
    ground: "sand", rain: false, godRays: false, lensFlare: false
  },
  {
    chapter: 4, hour: "slate storm in the orchard (15:00)", night: false,
    // phase 3: storm light, a warm sun breaking under the slate deck onto rain-green orchard grass, the deck lifting
    // into a bright horizon gap behind dark ridges (no pale plateau band, no grey wash)
    key: { elevationDeg: 24, azimuthDeg: 205, color: "#ffdcaa", intensity: 2.3 },
    rim: { color: SILT_PALETTE.jadeWhite, intensity: 0.4 },
    hdri: "kloppenheim_02", environmentIntensity: 0.75, environmentRotationDeg: 205, practicals: 0, pcss: false,
    sky: { top: "#26324a", horizon: "#d9c8a4", discSize: 0.022, glow: 0.45, cirrus: 0.2, dust: 0.15, storm: 1, stars: 0 },
    fog: { color: "#7c8aa0", density: 0.00042, heightFalloff: 0.05, heightReference: 0, maxOpacity: 0.3 },
    grade: { exposure: 1.08, contrast: 1.2, saturation: 1.18, temperature: 0.03 },
    bloom: { intensity: 0.35, threshold: 1 }, ink: DAY_INK,
    wake: { color: "#b8b39a", rate: 120 }, motes: { kind: "pollen", color: "#f2e08a" },
    ground: "orchard", ridge: "#3c4860",
    rain: true, godRays: false, lensFlare: false
  },
  {
    chapter: 5, hour: "violet night at the crown (02:10)", night: true,
    key: { elevationDeg: 22, azimuthDeg: 330, color: "#c6b5ff", intensity: 0.65 },
    rim: { color: SILT_PALETTE.jadeWhite, intensity: 0.3 },
    hdri: null, environmentIntensity: 0.35, environmentRotationDeg: 0, practicals: 5, pcss: false,
    sky: { top: "#191233", horizon: "#4c3b70", discSize: 0.024, glow: 0.55, cirrus: 0.35, dust: 0.1, storm: 0, stars: 1 },
    fog: { color: "#3e3360", density: 0.0009, heightFalloff: 0.05, heightReference: 0, maxOpacity: 0.55 },
    grade: { exposure: 1.3, contrast: 1.05, saturation: 1.05, temperature: -0.1 },
    bloom: { intensity: 0.6, threshold: 1 }, ink: NIGHT_INK,
    wake: { color: "#a79ad0", rate: 110 }, motes: { kind: "embers", color: "#ff9c5a" },
    ground: "sand", rain: false, godRays: false, lensFlare: false
  },
  {
    chapter: 6, hour: "rose dawn on the long return (06:05)", night: false,
    key: { elevationDeg: 6, azimuthDeg: 80, color: "#ffad9a", intensity: 2.3 },
    rim: { color: SILT_PALETTE.jadeWhite, intensity: 0.5 },
    hdri: "spruit_sunrise", environmentIntensity: 0.85, environmentRotationDeg: 80, practicals: 0, pcss: true,
    sky: { top: "#7d8cc0", horizon: "#f0a090", discSize: 0.034, glow: 0.55, cirrus: 0.7, dust: 0.3, storm: 0, stars: 0 },
    fog: { color: "#d9a08e", density: 0.0004, heightFalloff: 0.045, heightReference: 0, maxOpacity: 0.3 },
    grade: { exposure: 0.94, contrast: 1.18, saturation: 1.15, temperature: 0.06 },
    bloom: { intensity: 0.26, threshold: 1 }, ink: DAY_INK,
    wake: { color: "#eab69a", rate: 140 }, motes: { kind: "sand", color: "#f3c7b4" },
    ground: "sand", rain: false, godRays: false, lensFlare: true
  }
];

export function chapterLook(chapter: number): ChapterLook {
  return CHAPTER_LOOKS[Math.max(0, Math.min(CHAPTER_LOOKS.length - 1, Math.trunc(chapter)))]!;
}

/** Unit vector toward the key (sun or moon), from the table's elevation and azimuth. */
export function keyDirection(look: ChapterLook): [number, number, number] {
  const el = (look.key.elevationDeg * Math.PI) / 180;
  const az = (look.key.azimuthDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

/** Angle in degrees between two chapters' key directions (DG-L1 acceptance: >= 15). */
export function keyAngleDeg(a: ChapterLook, b: ChapterLook): number {
  const u = keyDirection(a), v = keyDirection(b);
  const dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
  return (Math.acos(dot) * 180) / Math.PI;
}

/**
 * The served catalogue file for a chapter's IBL HDRI (lane E-A ships `/hdri/<id>_1k.hdr`), with the file's sha256 so the
 * production bridge treats it as a manifest asset. Night chapters return null (neutral probe).
 */
export const HDRI_HASHES: Readonly<Partial<Record<AuraHdriId, string>>> = {
  belfast_sunset_puresky: "sha256-f5c14eb2ca1e2e7e281e39d3bf1a2898f43cc2b2db3232ab40c0c147e7d1c7a3",
  "outdoor-midday": "sha256-206c67e3a1b992282821cf06662bdd69bbb4915c1c4444a66338a40d6a7d4e34",
  industrial_sunset_puresky: "sha256-988320101df317784b2a869b40b0e23519726bf8827def4ed8eef806df2601cd",
  kloppenheim_02: "sha256-c122eb29c259d8c2ef0093c20130faa67ea216f5a1407c409ee4fc97cd5ba002",
  spruit_sunrise: "sha256-3ac30651cde16d2a80521273ec917ba3feca172ea4b842335431201879f39593"
};

export function chapterHdri(look: ChapterLook): { readonly kind: "aura-asset-ref"; readonly id: string; readonly type: "texture"; readonly format: "hdr"; readonly url: string; readonly hash?: string } | null {
  if (!look.hdri) return null;
  const hash = HDRI_HASHES[look.hdri];
  return { kind: "aura-asset-ref", id: `siltHdri-${look.hdri}`, type: "texture", format: "hdr", url: `/hdri/${look.hdri}_1k.hdr`, ...(hash ? { hash } : {}) };
}

/** PRD §6.3: reduced motion halves particle emission and zeroes camera roll, FOV kicks and sway. */
export function motionScale(reducedMotion: boolean): { readonly emission: number; readonly roll: number; readonly fovKick: number; readonly sway: number; readonly rail: boolean } {
  return reducedMotion ? { emission: 0.5, roll: 0, fovKick: 0, sway: 0.3, rail: false } : { emission: 1, roll: 1, fovKick: 1, sway: 1, rail: true };
}

/** sRGB "#rrggbb" to a linear RGB triple (custom shader uniforms are linear). */
export function linearOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number): number => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)];
}

/** DG-P1 ink fade: the ink reaches zero at this view distance (metres), full strength up to half of it. */
export const INK_FADE_METRES = 600;

/**
 * DG-P1: the silt-ink pass options for `effects.toon` (lane E-E depth-aware ink): depth plus colour edges in the
 * chapter's ink colour, fading to 0 by 600 m, 4 bands by day and 6 at night. Same pass name as the original cel pass,
 * so `setPassUniform("silt-cel", "u_texel", ...)` on resize keeps working. `?toon=0` turns it off.
 */
export function inkPassOptions(chapter: number, size: readonly [number, number]) {
  const look = chapterLook(chapter);
  return {
    name: "silt-cel",
    bands: look.ink.bands,
    bandMix: look.night ? 0.45 : 0.5,
    outline: 0.85,
    inkSource: "both" as const,
    fadeDistance: INK_FADE_METRES,
    inkColor: look.ink.color,
    size
  };
}
