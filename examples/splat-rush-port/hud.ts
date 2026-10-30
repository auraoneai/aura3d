/**
 * GU47 CR-H1 paint-world HUD (carnival look only; `?look=original` keeps the 4.6.0 DOM and CSS). Pure helpers so the
 * meter, swatch and contrast rules are unit-tested; `main.ts` writes them to the DOM. Every text sits in plum ink on a
 * cream paper chip, so its contrast does not depend on the sky stage behind it.
 */
import { CONFIG } from "./sim";
import { hexSrgb } from "./look";

export const HUD_INK = "#3b1f3f";
export const HUD_PAPER = "#fdf0e0";
/** Body class that scopes every carnival HUD rule in `index.html`. */
export const HUD_CARNIVAL_CLASS = "look-carnival";

/** Paint-tube combo meter: how far the combo is towards the next multiplier (1 when the multiplier is at its cap). */
export function comboTubeFill(combo: number, multiplier: number): number {
  if (combo <= 0) return 0;
  if (multiplier >= CONFIG.MAX_MULT) return 1;
  return (combo % CONFIG.COMBO_PER_MULT) / CONFIG.COMBO_PER_MULT;
}

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

/** CR-C2 title rail letterbox: full bars while the 3 s rail flies in on the title, then they slide out over 0.5 s. */
export const LETTERBOX_OUT_SECONDS = 0.5;
export function letterbox(phase: string, phaseSeconds: number, railSeconds: number, enabled: boolean): number {
  if (!enabled || phase !== "splash") return 0;
  const out = (phaseSeconds - railSeconds) / LETTERBOX_OUT_SECONDS;
  if (out <= 0) return 1;
  if (out >= 1) return 0;
  return 1 - out * out * (3 - 2 * out);
}
