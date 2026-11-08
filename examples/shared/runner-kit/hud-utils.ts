/** Pure HUD helpers: WCAG contrast, the splash letterbox, and the combo-tube fill. `main.ts`/`hud.ts` write the DOM. */
import { hexSrgb } from "./look-utils";

/** WCAG relative luminance of an sRGB hex colour. */
export function luminance(hex: string): number {
  const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const [r, g, b] = hexSrgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Title letterbox: full bars during the splash rail, then they slide out over 0.5 s. */
export const LETTERBOX_OUT_SECONDS = 0.5;

export function letterbox(phase: string, phaseSeconds: number, railSeconds: number, enabled: boolean): number {
  if (!enabled || phase !== "splash") return 0;
  const out = (phaseSeconds - railSeconds) / LETTERBOX_OUT_SECONDS;
  if (out <= 0) return 1;
  if (out >= 1) return 0;
  return 1 - out * out * (3 - 2 * out);
}

/** Combo meter: how far the combo is towards the next multiplier (1 when the multiplier is at its cap). */
export function comboTubeFill(combo: number, multiplier: number, maxMult: number, comboPerMult: number): number {
  if (combo <= 0) return 0;
  if (multiplier >= maxMult) return 1;
  return (combo % comboPerMult) / comboPerMult;
}