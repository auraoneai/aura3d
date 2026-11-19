// Aura FC 3D — venue transition card.
//
// A venue change rebuilds the whole scene (main.ts rebuildForVenue: new scene graph, look, IBL, every model remounted)
// and the new programs and textures take a second or two to settle. Rendered straight away, those frames were near
// black (owner QA: a ~2 s dark frame on every autoplay venue switch). The switch is now covered by a styled broadcast
// card in the new venue's colours: it cuts in on the switch frame, holds while warmPrograms settles the new venue
// (and at least VENUE_CARD_MIN_S so it never blinks), then fades out over a warm scene. The match clock holds while
// the card is up so the kickoff is not played under it. DOM-free so it is unit-tested; main.ts drives the element.

import type { VenueSpec } from "./content";

/** The card stays up at least this long, so a fast warm-up does not flash it. */
export const VENUE_CARD_MIN_S = 0.9;
/** Fade-out once the new venue is warm. */
export const VENUE_CARD_FADE_S = 0.35;
/** Upper bound: a warm-up that never settles (lost context, a stuck upload) cannot leave the card up for ever. */
export const VENUE_CARD_MAX_S = 9;

export interface VenueTransition {
  /** The venue rebuild starts (seconds, any monotonic clock). */
  begin(now: number): void;
  /** The new venue's warm-up settled. */
  warmed(now: number): void;
  /** Card opacity at `now`: 1 while covering, easing to 0, then 0. */
  opacity(now: number): number;
  /** True while the scene under the card is not ready to be watched (the sim holds). */
  holding(now: number): boolean;
  readonly active: boolean;
}

export function createVenueTransition(): VenueTransition {
  let startAt = -1;
  let warmAt = -1;
  /** When the fade-out starts: min hold after begin, and only once warm (or the safety cap). */
  const fadeStart = (): number => {
    if (startAt < 0) return -Infinity;
    const cap = startAt + VENUE_CARD_MAX_S;
    return warmAt < 0 ? cap : Math.min(cap, Math.max(warmAt, startAt + VENUE_CARD_MIN_S));
  };
  return {
    begin(now) { startAt = now; warmAt = -1; },
    warmed(now) { if (startAt >= 0 && warmAt < 0) warmAt = Math.max(now, startAt); },
    opacity(now) {
      if (startAt < 0) return 0;
      const f = fadeStart();
      if (now < f) return 1;
      const t = (now - f) / VENUE_CARD_FADE_S;
      return t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
    },
    holding(now) { return startAt >= 0 && now < fadeStart(); },
    get active() { return startAt >= 0; }
  };
}

/* ------------------------------ card look ------------------------------ */

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb: readonly number[]): string =>
  `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: string, b: string, t: number): string => {
  const x = hex(a), y = hex(b);
  return toHex(x.map((v, i) => v + (y[i]! - v) * t));
};

/** sRGB luma 0..1 (Rec. 709 weights on the gamma-encoded channels: what a frame-luminance probe measures). */
export function cardLuma(color: string): number {
  const [r, g, b] = hex(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export interface VenueCardColors {
  /** Gradient stops, top-left → bottom-right. */
  readonly top: string;
  readonly bottom: string;
  /** Mow-stripe overlay colour. */
  readonly stripe: string;
  readonly accent: string;
  /** Text on the card. */
  readonly ink: string;
}

/**
 * The card is the venue's pitch, lifted toward the broadcast cream so even the night venues (Kyoto's pitch is a dark
 * navy) read as a lit title card, never a dark frame.
 */
export function venueCardColors(v: VenueSpec): VenueCardColors {
  const cream = "#f3f0dc";
  const top = mix(v.pitch, cream, 0.55);
  const bottom = mix(v.pitchAlt, cream, 0.3);
  return {
    top, bottom,
    stripe: mix(v.pitchAlt, cream, 0.42),
    accent: v.accent,
    ink: "#0b1f1c"
  };
}
