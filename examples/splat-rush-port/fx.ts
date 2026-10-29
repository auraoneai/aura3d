/**
 * Screen-space effects for the Splat Rush port: a colour flash on events (`mix-blend-mode: screen`), a circular colour
 * reveal when the ball bursts, and a speed vignette that grows with the combo multiplier. DOM only, driven by the
 * renderer from state changes (see `audio.ts` `diffSounds`); the simulation never sees any of it.
 */
import type { GameSound } from "./audio";
import { COLORS } from "./sim";

export interface FxEvent { sound: GameSound; level: number }

/** Colour and strength of the flash for each event (strength is the overlay's peak opacity). */
export function flashFor(event: FxEvent, playerColorIndex: number): { color: string; strength: number } | null {
  const own = COLORS[playerColorIndex] ?? "#ffffff";
  switch (event.sound) {
    case "match": return { color: own, strength: 0.22 };
    case "perfect": return { color: own, strength: 0.42 };
    case "hit": return { color: "#f0433a", strength: 0.4 };
    case "block": return { color: "#5ecaf0", strength: 0.35 };
    case "pickup": return { color: own, strength: 0.38 };
    case "switch": return { color: own, strength: 0.32 };
    case "burst": return { color: own, strength: 0.7 };
    case "milestone": return { color: "#f9c647", strength: 0.5 };
    default: return null;
  }
}

/** Peak flash opacity when the player asked for reduced motion (C8). */
export const REDUCED_FLASH_CAP = 0.1;

/** Flash strength after the reduced-motion cap. */
export function flashStrength(strength: number, reducedMotion: boolean): number {
  return reducedMotion ? Math.min(REDUCED_FLASH_CAP, strength) : strength;
}

/** Vignette opacity for a combo multiplier (0 below x2, then a gentle pulse that grows up to a cap). */
export function vignetteOpacity(multiplier: number, rainbow: boolean, seconds: number): number {
  if (!rainbow && multiplier < 2) return 0;
  const level = rainbow ? 4 : multiplier;
  return Math.min(0.5, 0.14 * (level - 2) + 0.1 + 0.05 * Math.sin(seconds * 7));
}

export class ScreenFx {
  private readonly flashEl: HTMLDivElement;
  private readonly vignetteEl: HTMLDivElement;
  private readonly revealEl: HTMLDivElement;

  constructor(host: HTMLElement = document.body) {
    const layer = (z: number, css: string): HTMLDivElement => {
      const el = document.createElement("div");
      el.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${z};opacity:0;${css}`;
      host.appendChild(el);
      return el;
    };
    this.vignetteEl = layer(7, "transition:opacity 0.25s;");
    this.flashEl = layer(8, "mix-blend-mode:screen;transition:opacity 0.35s ease-out;");
    this.revealEl = layer(9, "background:#f0433a;clip-path:circle(0% at 50% 62%);");
  }

  flash(color: string, strength: number): void {
    this.flashEl.style.transition = "none";
    this.flashEl.style.background = color;
    this.flashEl.style.opacity = String(strength);
    requestAnimationFrame(() => {
      this.flashEl.style.transition = "opacity 0.35s ease-out";
      this.flashEl.style.opacity = "0";
    });
  }

  /** A colour disc that grows from the ball's screen position over the whole frame (the burst). */
  /** `instant` (reduced motion) fills the frame with a short fade instead of the growing disc. */
  reveal(color: string, instant = false): void {
    if (instant) {
      this.revealEl.style.transition = "opacity 0.3s ease";
      this.revealEl.style.background = color;
      this.revealEl.style.clipPath = "none";
      this.revealEl.style.opacity = "1";
      return;
    }
    this.revealEl.style.transition = "none";
    this.revealEl.style.background = color;
    this.revealEl.style.opacity = "1";
    this.revealEl.style.clipPath = "circle(0% at 50% 62%)";
    requestAnimationFrame(() => {
      this.revealEl.style.transition = "clip-path 0.65s cubic-bezier(0.45,0,0.2,1)";
      this.revealEl.style.clipPath = "circle(150% at 50% 62%)";
    });
  }

  clearReveal(): void {
    this.revealEl.style.transition = "opacity 0.4s ease";
    this.revealEl.style.opacity = "0";
  }

  /** `steady` (reduced motion) drops the pulse and the vignette altogether. */
  vignette(multiplier: number, rainbow: boolean, color: string, seconds: number, steady = false): void {
    const o = steady ? 0 : vignetteOpacity(multiplier, rainbow, seconds);
    this.vignetteEl.style.background = `radial-gradient(ellipse at center, transparent 52%, ${color} 135%)`;
    this.vignetteEl.style.opacity = String(o);
  }
}
