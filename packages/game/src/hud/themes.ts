/**
 * §7.7/§17 theme registry: the presets as `--a3g-*` custom-property
 * records. `styles/themes/<preset>.css` carries the same values for static
 * bundlers; this map is the runtime source of truth so tests and fake-DOM
 * hosts can assert applied vars.
 *
 * Fonts (GU47 WP-10, PRD D9): every font stack starts with a licensed face
 * registered from the WOFF2 web cuts in `../fonts/` (provenance in
 * `../fonts/NOTICE.txt`). The names after it are fallbacks only: the same
 * family declared by the page, then one metric fallback and a generic. No
 * platform UI font stack is ever the face.
 *
 * Every theme carries the same keys. `--a3g-font` sets all HUD text (its
 * faces have tabular figures for counters); `--a3g-font-display` is an
 * optional title face for game CSS (banners, cards, district names) and
 * equals `--a3g-font` unless the theme pairs a distinct display face.
 */
export type HudThemePreset =
  | "arcade-neon"
  | "motorsport"
  | "sports-broadcast"
  | "sci-fi-telemetry"
  | "fighting"
  | "tabletop"
  | "plain"
  | "storybook"
  | "ink-scroll"
  | "sky-expedition";

export type HudThemeVars = Readonly<Record<`--a3g-${string}`, string>>;

/** One licensed WOFF2 web cut the theme system ships in `packages/game/src/fonts/`. */
export interface HudFontFace {
  /** `FontFace` family the theme stacks name first ("A3G <family>"). */
  readonly family: string;
  /** File name inside `packages/game/src/fonts/`. */
  readonly file: string;
  /** CSS weight the face registers at (font library README weights, not file metadata). */
  readonly weight: number;
}

// Technical geometric sans; tabular figures (arcade-neon).
const FONT_AEONIK_FONO = '"A3G Aeonik Fono", "Aeonik Fono", Arial, sans-serif';
// Narrow timing-tower grotesk; tabular figures (motorsport).
const FONT_NATIONAL_2_NARROW = '"A3G National 2 Narrow", "National 2 Narrow", "Arial Narrow", Arial, sans-serif';
// Compact broadcast grotesk; tabular figures (sports-broadcast).
const FONT_CALIBRE = '"A3G Calibre", "Calibre", Arial, sans-serif';
// Swiss instrument-readout text face; tabular figures (sci-fi-telemetry).
const FONT_NEUE_HAAS_TEXT = '"A3G Neue Haas Grotesk Text", "Neue Haas Grotesk Text", Arial, sans-serif';
// Blunt grotesk with a real Bold; tabular figures (fighting).
const FONT_UNTITLED_SANS = '"A3G Untitled Sans", "Untitled Sans", Arial, sans-serif';
// Printed-card book serif; tabular figures (tabletop).
const FONT_SUISSE_WORKS = '"A3G Suisse Works", "Suisse Works", Georgia, serif';
// Neutral licensed UI face, the repo shell face (plain).
const FONT_GRAPHIK = '"A3G Graphik", "Graphik", "Graphik Web", Arial, sans-serif';
// Friendly picture-book geometric; tabular figures (storybook text).
const FONT_GT_WALSHEIM = '"A3G GT Walsheim", "GT Walsheim", Arial, sans-serif';
// Soft flared display serif for picture-book titles (storybook display).
const FONT_CANELA = '"A3G Canela", "Canela", Georgia, serif';
// Calligraphic italic serif, brush movement on paper; tabular figures (ink-scroll text).
const FONT_SUISSE_WORKS_ITALIC = '"A3G Suisse Works Italic", "Suisse Works", Georgia, serif';
// Sharp wedge-serif display with ink-stroke contrast (ink-scroll display).
const FONT_DOMAINE_DISPLAY = '"A3G Domaine Display", "Domaine Display", Georgia, serif';
// Open, soft geometric sans with a real Bold; tabular figures (sky-expedition).
const FONT_ROOBERT = '"A3G Roobert", "Roobert", Arial, sans-serif';

export const HUD_THEMES: Readonly<Record<HudThemePreset, HudThemeVars>> = Object.freeze({
  "arcade-neon": {
    "--a3g-font": FONT_AEONIK_FONO,
    "--a3g-font-display": FONT_AEONIK_FONO,
    "--a3g-fg": "#e8fbff",
    "--a3g-fg-dim": "#9ad9e6",
    "--a3g-accent": "#39f5ff",
    "--a3g-accent2": "#ff42c8",
    "--a3g-warn": "#ffd166",
    "--a3g-danger": "#ff4d6d",
    "--a3g-bg": "rgba(6,10,26,0.72)",
    "--a3g-edge": "rgba(57,245,255,0.55)",
    "--a3g-glow": "0 0 12px rgba(57,245,255,0.6)",
    "--a3g-radius": "4px"
  },
  motorsport: {
    "--a3g-font": FONT_NATIONAL_2_NARROW,
    "--a3g-font-display": FONT_NATIONAL_2_NARROW,
    "--a3g-fg": "#f5f7fa",
    "--a3g-fg-dim": "#aab4c0",
    "--a3g-accent": "#ffcf3f",
    "--a3g-accent2": "#2ec4ff",
    "--a3g-warn": "#ff9f1c",
    "--a3g-danger": "#ef233c",
    "--a3g-bg": "rgba(10,12,16,0.78)",
    "--a3g-edge": "rgba(255,207,63,0.5)",
    "--a3g-glow": "none",
    "--a3g-radius": "2px"
  },
  "sports-broadcast": {
    "--a3g-font": FONT_CALIBRE,
    "--a3g-font-display": FONT_CALIBRE,
    "--a3g-fg": "#ffffff",
    "--a3g-fg-dim": "#cfd8e3",
    "--a3g-accent": "#00e06d",
    "--a3g-accent2": "#2b7fff",
    "--a3g-warn": "#ffc93c",
    "--a3g-danger": "#ff3b30",
    "--a3g-bg": "rgba(8,14,26,0.85)",
    "--a3g-edge": "rgba(255,255,255,0.28)",
    "--a3g-glow": "none",
    "--a3g-radius": "6px"
  },
  "sci-fi-telemetry": {
    "--a3g-font": FONT_NEUE_HAAS_TEXT,
    "--a3g-font-display": FONT_NEUE_HAAS_TEXT,
    "--a3g-fg": "#c9ffe8",
    "--a3g-fg-dim": "#6fbf9d",
    "--a3g-accent": "#00ff9f",
    "--a3g-accent2": "#7bd5ff",
    "--a3g-warn": "#f7b32b",
    "--a3g-danger": "#ff5c5c",
    "--a3g-bg": "rgba(4,16,12,0.7)",
    "--a3g-edge": "rgba(0,255,159,0.4)",
    "--a3g-glow": "0 0 8px rgba(0,255,159,0.35)",
    "--a3g-radius": "0px"
  },
  fighting: {
    "--a3g-font": FONT_UNTITLED_SANS,
    "--a3g-font-display": FONT_UNTITLED_SANS,
    "--a3g-fg": "#fff6e8",
    "--a3g-fg-dim": "#d9c9a8",
    "--a3g-accent": "#ffcc00",
    "--a3g-accent2": "#ff5722",
    "--a3g-warn": "#ffa726",
    "--a3g-danger": "#ff1744",
    "--a3g-bg": "rgba(20,8,4,0.78)",
    "--a3g-edge": "rgba(255,204,0,0.6)",
    "--a3g-glow": "0 2px 0 rgba(0,0,0,0.6)",
    "--a3g-radius": "3px"
  },
  tabletop: {
    "--a3g-font": FONT_SUISSE_WORKS,
    "--a3g-font-display": FONT_SUISSE_WORKS,
    "--a3g-fg": "#f2ead9",
    "--a3g-fg-dim": "#b9ab8d",
    "--a3g-accent": "#7ce8ff",
    "--a3g-accent2": "#d4a94f",
    "--a3g-warn": "#e0a63f",
    "--a3g-danger": "#e0523f",
    "--a3g-bg": "rgba(24,18,10,0.8)",
    "--a3g-edge": "rgba(212,169,79,0.45)",
    "--a3g-glow": "none",
    "--a3g-radius": "8px"
  },
  plain: {
    "--a3g-font": FONT_GRAPHIK,
    "--a3g-font-display": FONT_GRAPHIK,
    "--a3g-fg": "#e6e6e6",
    "--a3g-fg-dim": "#9aa0a8",
    "--a3g-accent": "#8ab4ff",
    "--a3g-accent2": "#a78bfa",
    "--a3g-warn": "#fbbf24",
    "--a3g-danger": "#f87171",
    "--a3g-bg": "rgba(0,0,0,0.65)",
    "--a3g-edge": "rgba(255,255,255,0.2)",
    "--a3g-glow": "none",
    "--a3g-radius": "4px"
  },
  // Warm picture-book: birch-cream paper chips, umber ink, toadstool-red
  // accent, moss secondary, soft paper drop, round corners.
  storybook: {
    "--a3g-font": FONT_GT_WALSHEIM,
    "--a3g-font-display": FONT_CANELA,
    "--a3g-fg": "#3d2a17",
    "--a3g-fg-dim": "#6b4f30",
    "--a3g-accent": "#c8432f",
    "--a3g-accent2": "#4f7a3a",
    "--a3g-warn": "#8a4508",
    "--a3g-danger": "#a8241c",
    "--a3g-bg": "rgba(247,236,212,0.92)",
    "--a3g-edge": "rgba(107,79,48,0.45)",
    "--a3g-glow": "0 2px 0 rgba(61,42,23,0.35)",
    "--a3g-radius": "14px"
  },
  // Brush-and-paper scroll: rice-paper panels, sumi ink, vermilion seal
  // accent, indigo secondary, ink hairline edges, cut-paper corners.
  "ink-scroll": {
    "--a3g-font": FONT_SUISSE_WORKS_ITALIC,
    "--a3g-font-display": FONT_DOMAINE_DISPLAY,
    "--a3g-fg": "#1f1d24",
    "--a3g-fg-dim": "#524f5b",
    "--a3g-accent": "#c23b22",
    "--a3g-accent2": "#2b3550",
    "--a3g-warn": "#874610",
    "--a3g-danger": "#9e1b1b",
    "--a3g-bg": "rgba(237,230,214,0.94)",
    "--a3g-edge": "rgba(31,29,36,0.6)",
    "--a3g-glow": "0 1px 0 rgba(31,29,36,0.45)",
    "--a3g-radius": "2px"
  },
  // Airy adventure: translucent cloud-white panels, deep cobalt ink, burnt
  // amber accent, sky-cobalt secondary, soft lifted shadow.
  "sky-expedition": {
    "--a3g-font": FONT_ROOBERT,
    "--a3g-font-display": FONT_ROOBERT,
    "--a3g-fg": "#13365e",
    "--a3g-fg-dim": "#3f5f84",
    "--a3g-accent": "#c45f0c",
    "--a3g-accent2": "#2f6fb8",
    "--a3g-warn": "#934307",
    "--a3g-danger": "#a82c25",
    "--a3g-bg": "rgba(244,249,255,0.9)",
    "--a3g-edge": "rgba(47,111,184,0.38)",
    "--a3g-glow": "0 2px 6px rgba(19,54,94,0.35)",
    "--a3g-radius": "12px"
  }
});

/**
 * Licensed WOFF2 faces the shell loads before the title screen (§17 ≤ 40 KiB
 * each). Each family ships only the weights its themes use.
 */
export const HUD_FONT_FACES: readonly HudFontFace[] = Object.freeze([
  { family: "A3G Aeonik Fono", file: "aeonik-fono-400.woff2", weight: 400 },
  { family: "A3G Aeonik Fono", file: "aeonik-fono-700.woff2", weight: 700 },
  { family: "A3G National 2 Narrow", file: "national-2-narrow-400.woff2", weight: 400 },
  { family: "A3G National 2 Narrow", file: "national-2-narrow-700.woff2", weight: 700 },
  { family: "A3G Calibre", file: "calibre-400.woff2", weight: 400 },
  { family: "A3G Calibre", file: "calibre-600.woff2", weight: 600 },
  { family: "A3G Neue Haas Grotesk Text", file: "neue-haas-grotesk-text-400.woff2", weight: 400 },
  { family: "A3G Neue Haas Grotesk Text", file: "neue-haas-grotesk-text-500.woff2", weight: 500 },
  { family: "A3G Untitled Sans", file: "untitled-sans-400.woff2", weight: 400 },
  { family: "A3G Untitled Sans", file: "untitled-sans-700.woff2", weight: 700 },
  { family: "A3G Suisse Works", file: "suisse-works-400.woff2", weight: 400 },
  { family: "A3G Graphik", file: "graphik-400.woff2", weight: 400 },
  { family: "A3G Graphik", file: "graphik-500.woff2", weight: 500 },
  { family: "A3G GT Walsheim", file: "gt-walsheim-400.woff2", weight: 400 },
  { family: "A3G Canela", file: "canela-400.woff2", weight: 400 },
  { family: "A3G Suisse Works Italic", file: "suisse-works-italic-400.woff2", weight: 400 },
  { family: "A3G Domaine Display", file: "domaine-display-700.woff2", weight: 700 },
  { family: "A3G Roobert", file: "roobert-400.woff2", weight: 400 },
  { family: "A3G Roobert", file: "roobert-700.woff2", weight: 700 }
]);

/** First family named by a CSS font stack, without quotes. */
function leadFamily(stack: string): string {
  return (stack.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}

/**
 * The faces one theme needs (its `--a3g-font` and `--a3g-font-display`
 * families), in `HUD_FONT_FACES` order: the files a game copies into its app
 * folder and passes to `registerGameFonts`.
 */
export function hudThemeFontFaces(theme: HudThemePreset): readonly HudFontFace[] {
  const vars = HUD_THEMES[theme];
  const families = new Set([leadFamily(vars["--a3g-font"] ?? ""), leadFamily(vars["--a3g-font-display"] ?? "")]);
  return HUD_FONT_FACES.filter((face) => families.has(face.family));
}
