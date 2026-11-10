/**
 * GU47 CR-H1 & WP-26 AuraOne HUD helpers (carnival look + shared tokens; `?look=original` keeps the 4.6.0 look).
 * Pure helpers (`comboTubeFill`, `luminance`, `contrastRatio`, `letterbox`) are unit-tested; inline 1.5px-stroke SVGs
 * and `upgradeRuntimeHudDom` keep zero raw OS emojis and enforce licensed Whitney + DIN Pro tabular-nums typography.
 */
import { CONFIG } from "./sim";
import { hexSrgb } from "./look";

export const HUD_INK = "#3b1f3f";
export const HUD_PAPER = "#fdf0e0";
/** Body class that scopes every carnival HUD rule in `index.html`. */
export const HUD_CARNIVAL_CLASS = "look-carnival";

/** Colour-blind shape glyphs matching `SYMBOL_FOR_COLOR` (red circle, yellow triangle, blue square, purple cross). */
export const SHAPE_GLYPHS = ["\u25CF", "\u25B2", "\u25A0", "\u271A"] as const;

/* Crisp 1.5px-stroke inline SVGs replacing raw OS emojis across buttons, pills, and cards */
export const ICON_SOUND_ON =
  '<svg class="hud-svg" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 7.8H6.6L10.8 4.4V15.6L6.6 12.2H3.5Z"/><path d="M13.5 7.4C14.5 8.4 14.5 11.6 13.5 12.6"/><path d="M15.6 5.4C17.4 7.3 17.4 12.7 15.6 14.6"/></svg>';

export const ICON_SOUND_OFF =
  '<svg class="hud-svg" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 7.8H6.6L10.8 4.4V15.6L6.6 12.2H3.5Z"/><path d="M13.6 7.6L17.2 12.4"/><path d="M17.2 7.6L13.6 12.4"/></svg>';

export const ICON_PAUSE =
  '<svg class="hud-svg" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7.2 5V15"/><path d="M12.8 5V15"/></svg>';

export const ICON_RAINBOW =
  '<svg class="pu-svg" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2.2 11.8A5.8 5.8 0 0 1 13.8 11.8"/><path d="M4.4 11.8A3.6 3.6 0 0 1 11.6 11.8"/><path d="M6.6 11.8A1.4 1.4 0 0 1 9.4 11.8"/></svg>';

export const ICON_SHIELD =
  '<svg class="pu-svg" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.1L13 4.1V7.8C13 10.9 10.9 13.1 8 14.1C5.1 13.1 3 10.9 3 7.8V4.1L8 2.1Z"/></svg>';

export const ICON_X2 =
  '<svg class="pu-svg" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2L9.6 6.4L14 8L9.6 9.6L8 14L6.4 9.6L2 8L6.4 6.4Z"/></svg>';

export const ICON_SWITCH =
  '<svg class="pu-svg" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><circle cx="6.2" cy="6.6" r="0.9" fill="currentColor"/><circle cx="9.8" cy="6.6" r="0.9" fill="currentColor"/><circle cx="8" cy="10.2" r="0.9" fill="currentColor"/></svg>';

export const ICON_STEER_ARROWS =
  '<svg class="steer-svg" viewBox="0 0 28 14" width="24" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 2.5L2 7L6.5 11.5"/><path d="M21.5 2.5L26 7L21.5 11.5"/><path d="M4 7H24" stroke-dasharray="2.5 2.5"/></svg>';

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

/**
 * Idempotently upgrades live HUD DOM & injects AuraOne typography/glass rules so both `examples/splat-rush-port/index.html`
 * and wrapper routes share identical Whitney + DIN Pro styling, crisp SVG icons, and diegetic lane-steer cue.
 */
export function upgradeRuntimeHudDom(): void {
  if (typeof document === "undefined") return;
  if (!document.getElementById("splat-aura-hud-upgrade")) {
    const style = document.createElement("style");
    style.id = "splat-aura-hud-upgrade";
    style.textContent = `
      .game-ui, .popup-text, .btn, .toggle { font-family: var(--font-ui); font-synthesis: none; }
      .hud-kicker { font-family: var(--font-ui); font-size: 12px; font-weight: 600; font-variant-caps: all-small-caps; letter-spacing: 0.05em; opacity: 0.78; margin-right: 6px; }
      .hud-num { font-family: var(--font-metric); font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
      .hud-unit { font-family: var(--font-ui); font-size: 12px; font-weight: 500; opacity: 0.85; margin-left: 1px; }
      .hud-svg, .pu-svg, .steer-svg { display: inline-block; vertical-align: -2px; flex: none; }
      .icon-btn { display: inline-flex; align-items: center; justify-content: center; color: #3b1f3f; touch-action: manipulation; }
      .pu { gap: 5px; font-weight: 600; font-size: 13px; letter-spacing: 0.02em; -webkit-text-stroke: 0; text-shadow: 0 1px 2px rgba(24,10,28,0.45); }
      .pu-shield, .pu-x2 { color: #2b1630; text-shadow: none; }
      .look-carnival .hud-text { display: inline-flex; align-items: baseline; font-weight: 600; font-size: clamp(18px, 3.8vh, 26px); padding: 5px 14px 6px; background: rgba(253, 240, 224, 0.94); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 2px solid #3b1f3f; border-radius: 12px; box-shadow: 0 4px 14px rgba(34, 14, 42, 0.18), 2px 3px 0 #3b1f3f; letter-spacing: 0; }
      .look-carnival #hud-combo { gap: 6px; font-size: clamp(16px, 3.2vh, 22px); padding: 4px 12px 5px; }
      .look-carnival #hud-swatch { display: flex; align-items: center; justify-content: center; color: #fdf0e0; font-size: 14px; font-weight: 600; text-shadow: 0 1px 2px rgba(28, 10, 32, 0.72); }
      .look-carnival .overlay-card { max-width: 368px; padding: clamp(18px, 3.6vh, 30px) clamp(20px, 4vw, 30px); border: 2.5px solid rgba(59, 31, 63, 0.9); border-radius: 20px; background: rgba(253, 240, 224, 0.92); backdrop-filter: blur(14px) saturate(135%); -webkit-backdrop-filter: blur(14px) saturate(135%); box-shadow: 0 18px 42px rgba(22, 10, 30, 0.34), 0 4px 0 #3b1f3f; -webkit-mask: none; mask: none; }
      .look-carnival .overlay-card h1 { font-family: var(--font-ui); font-weight: 600; font-size: clamp(30px, 7vh, 46px) !important; letter-spacing: 0.04em; -webkit-text-stroke: 0 !important; text-shadow: 0 2px 0 rgba(59, 31, 63, 0.18) !important; margin: 0 0 8px !important; }
      .look-carnival .btn { font-weight: 600; font-size: clamp(16px, 2.8vh, 20px); letter-spacing: 0.05em; padding: 11px 32px; min-height: 44px; border-width: 2.5px; border-radius: 999px; box-shadow: 0 4px 0 #3b1f3f, 0 10px 20px rgba(59, 31, 63, 0.24); text-shadow: 0 1px 1px rgba(42, 16, 46, 0.35); }
      .look-carnival .btn-gold { color: #3b1f3f; text-shadow: none; }
      .look-carnival .toggle { font-weight: 500; font-size: 12px; min-height: 36px; padding: 7px 13px; border-width: 1.5px; }
      .look-carnival .hint { font-weight: 500; font-size: 12px; line-height: 1.4; opacity: 0.78; margin: 10px 0 0; }
      .look-carnival #final-stats { font-weight: 500; font-size: 13px; font-variant-numeric: tabular-nums; margin: 0 0 14px; }
      .look-carnival #splash-best { font-family: var(--font-ui); font-weight: 600; font-size: 15px; margin: 0 0 10px; min-height: 20px; }
      .splash-copy { font-size: 14px !important; font-weight: 500 !important; line-height: 1.45 !important; color: #3b1f3f !important; margin: 0 0 10px !important; }
      .splash-legend { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin: 6px 0 2px; }
      .legend-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px; background: rgba(59, 31, 63, 0.08); border: 1px solid rgba(59, 31, 63, 0.2); font-size: 12px; font-weight: 500; color: #3b1f3f; }
      #steer-cue { position: fixed; left: 50%; bottom: max(108px, calc(var(--a3d-bar-space, 48px) + 58px + env(safe-area-inset-bottom))); transform: translateX(-50%); z-index: 5; pointer-events: none; display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; background: rgba(253, 240, 224, 0.9); border: 1.5px solid rgba(59, 31, 63, 0.65); box-shadow: 0 6px 18px rgba(24, 10, 30, 0.2); color: #3b1f3f; font-family: var(--font-ui); font-size: 12px; font-weight: 600; font-variant-caps: all-small-caps; letter-spacing: 0.05em; transition: opacity 260ms ease, transform 260ms ease; }
      #steer-cue[data-hidden="true"] { opacity: 0; transform: translateX(-50%) translateY(8px); }
      @media (pointer: coarse), (max-width: 760px) {
        .toggle, .btn, .icon-btn { min-height: 44px; min-width: 44px; touch-action: manipulation; }
        .icon-btn { bottom: max(60px, calc(var(--a3d-bar-space, 48px) + 12px + env(safe-area-inset-bottom))); }
        #hud-powerups { bottom: max(116px, calc(var(--a3d-bar-space, 48px) + 66px + env(safe-area-inset-bottom))) !important; }
      }
      @media (prefers-reduced-motion: reduce) { #steer-cue { transition: none; } }
    `;
    document.head.appendChild(style);
  }
  const pauseBtn = document.getElementById("btn-pause");
  if (pauseBtn && !pauseBtn.querySelector("svg")) pauseBtn.innerHTML = ICON_PAUSE;
  const splashCopy = document.querySelector("#splash-screen .overlay-card > p");
  if (splashCopy && !splashCopy.querySelector("svg")) {
    splashCopy.className = "splash-copy";
    splashCopy.innerHTML =
      "Drag across lanes to match glossy pigment gates &amp; chain streak multipliers." +
      `<span class="splash-legend">` +
      `<span class="legend-chip">${ICON_RAINBOW}Rainbow</span>` +
      `<span class="legend-chip">${ICON_SHIELD}Shield</span>` +
      `<span class="legend-chip">${ICON_X2}2&times; Score</span>` +
      `<span class="legend-chip">${ICON_SWITCH}Switch</span>` +
      `</span>`;
  }
  if (!document.getElementById("steer-cue")) {
    const cue = document.createElement("div");
    cue.id = "steer-cue";
    cue.className = "paint-only";
    cue.setAttribute("aria-hidden", "true");
    cue.setAttribute("data-hidden", "true");
    cue.innerHTML = `${ICON_STEER_ARROWS}<span>Drag left or right to steer</span>`;
    document.body.appendChild(cue);
  }
}
