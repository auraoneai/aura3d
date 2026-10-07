/**
 * §7.7/§17 theme registry: the seven presets as `--a3g-*` custom-property
 * records. `styles/themes/<preset>.css` carries the same values for static
 * bundlers; this map is the runtime source of truth so tests and fake-DOM
 * hosts can assert applied vars.
 */
export type HudThemePreset =
  | "arcade-neon"
  | "motorsport"
  | "sports-broadcast"
  | "sci-fi-telemetry"
  | "fighting"
  | "tabletop"
  | "plain";

export type HudThemeVars = Readonly<Record<`--a3g-${string}`, string>>;

const FONT_ORBITRON = '"A3G Orbitron", "Orbitron", system-ui, sans-serif';
const FONT_BARLOW = '"A3G Barlow Condensed", "Barlow Condensed", "Arial Narrow", sans-serif';
const FONT_PLEX = '"A3G IBM Plex Mono", "IBM Plex Mono", ui-monospace, monospace';
const FONT_RUSSO = '"A3G Russo One", "Russo One", sans-serif';
const FONT_TEKTUR = '"A3G Tektur", "Tektur", monospace, sans-serif';
const FONT_PLAIN = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const HUD_THEMES: Readonly<Record<HudThemePreset, HudThemeVars>> = Object.freeze({
  "arcade-neon": {
    "--a3g-font": FONT_ORBITRON,
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
    "--a3g-font": FONT_BARLOW,
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
    "--a3g-font": FONT_BARLOW,
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
    "--a3g-font": FONT_PLEX,
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
    "--a3g-font": FONT_RUSSO,
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
    "--a3g-font": FONT_BARLOW,
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
    "--a3g-font": FONT_PLAIN,
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
  }
});

/** woff2 faces the shell loads before the title screen (§17 ≤ 40 KB each). */
export const HUD_FONT_FACES: readonly { family: string; file: string; weight: number }[] = [
  { family: "A3G Orbitron", file: "orbitron-600.woff2", weight: 600 },
  { family: "A3G Orbitron", file: "orbitron-800.woff2", weight: 800 },
  { family: "A3G Barlow Condensed", file: "barlow-condensed-600.woff2", weight: 600 },
  { family: "A3G IBM Plex Mono", file: "ibm-plex-mono-500.woff2", weight: 500 },
  { family: "A3G Russo One", file: "russo-one-400.woff2", weight: 400 },
  { family: "A3G Tektur", file: "tektur-600.woff2", weight: 600 }
];
