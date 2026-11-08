/**
 * Game event -> screen flash mapping over the kit's ScreenFx (DOM only; the sim never sees any of it).
 * Reduced motion caps every flash at 0.1 and drops the vignette; the burst reveal fills instantly.
 */
import { ScreenFx, flashStrength } from "../../../examples/shared/runner-kit/index";
import { LOOK } from "./look";
import type { CueName } from "./audio";

export interface Flash { color: string; strength: number }

/** Pure mapping (unit-tested through the audio diff): one flash per cue, null for silent cues. */
export function eventFlash(cue: CueName, shapeColor: string): Flash | null {
  switch (cue) {
    case "match": return { color: "#7de8c3", strength: 0.12 };
    case "perfect": return { color: "#ffd76a", strength: 0.22 };
    case "morph": return { color: shapeColor, strength: 0.3 };
    case "hit": return { color: "#ff5a4e", strength: 0.34 };
    case "shield": return { color: "#6fe8c9", strength: 0.18 };
    case "wildcard": return { color: "#cf8ef2", strength: 0.24 };
    case "x2": return { color: "#ffd76a", strength: 0.18 };
    case "milestone": return { color: "#ffe9a8", strength: 0.3 };
    case "gameover": return null; // the burst uses the reveal, not a flash
  }
}

/** "#rrggbb" -> "rgba(r,g,b,a)" (presentation only). */
function translucent(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export class Fx {
  private readonly fx: ScreenFx;
  constructor(host?: HTMLElement) {
    this.fx = new ScreenFx(host);
  }
  cue(cue: CueName, shapeColor: string, reducedMotion: boolean): void {
    if (cue === "gameover") {
      // Translucent wipe so the Toybox Skyway world stays visible behind the results card.
      this.fx.reveal(translucent(shapeColor, 0.42), reducedMotion);
      return;
    }
    const flash = eventFlash(cue, shapeColor);
    if (flash) this.fx.flash(flash.color, flashStrength(flash.strength, reducedMotion));
  }
  vignette(multiplier: number, boost: boolean, seconds: number, reducedMotion: boolean): void {
    this.fx.vignette(multiplier, boost, LOOK.accent, seconds, reducedMotion);
  }
  clearReveal(): void {
    this.fx.clearReveal();
  }
}