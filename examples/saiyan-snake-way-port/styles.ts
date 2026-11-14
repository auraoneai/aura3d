import type { LookMode } from "./art/colorScript";

/**
 * Runner looks for the select card: colours only (suit, hair, belt, sash and the surge shell). The
 * simulation is identical for every runner, so replays and scores are comparable across them.
 */
export interface RunnerStyle {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly gi: number;
  readonly giDark: number;
  readonly skin: number;
  readonly hair: number;
  readonly belt: number;
  readonly boot: number;
  readonly sash: number;
  readonly auraCore: number;
  readonly auraLit: number;
  readonly aura: number;
  /** Multiplier on the rigged model's base colour (the catalog model is tinted per colourway). */
  readonly tint: readonly [number, number, number];
  /** Emissive wash that pushes the model's outfit towards the colourway (base colour multiplication alone cannot turn green into orange). */
  readonly wash: readonly [number, number, number];
}

export const RUNNER_STYLES: readonly RunnerStyle[] = [
  {
    id: "tide", name: "TIDE", tagline: "Red lacquer robe, cyan surge. Calm and quick.",
    gi: 0xc22630, giDark: 0x8e1923, skin: 0xeab896, hair: 0x1b1622, belt: 0xefe6d8, boot: 0x242234, sash: 0xebe1d2,
    auraCore: 0xe6ffff, auraLit: 0x9be8f0, aura: 0x2bb8d8, tint: [1, 0.97, 0.95], wash: [0.12, 0.03, 0.02]
  },
  {
    id: "violet", name: "VIOLET", tagline: "Indigo suit, violet surge. Cool and sharp.",
    gi: 0xa81f34, giDark: 0x7c1628, skin: 0xe6b592, hair: 0x191521, belt: 0xeee5d6, boot: 0x262236, sash: 0xeae0d0,
    auraCore: 0xf4e8ff, auraLit: 0xcfa4ff, aura: 0x8a4dff, tint: [1.15, 0.85, 1.25], wash: [0.18, 0.1, 0.35]
  },
  {
    id: "verdant", name: "VERDANT", tagline: "Moss tunic, green surge. Light on its feet.",
    gi: 0x3f8f4a, giDark: 0x28603a, skin: 0xe0b078, hair: 0x241d18, belt: 0xefe5d2, boot: 0x2e241e, sash: 0xf0e4cd,
    auraCore: 0xf6ffd8, auraLit: 0xbcf27e, aura: 0x5ed04a, tint: [0.8, 1.15, 0.7], wash: [0.08, 0.3, 0.1]
  }
];

/** The pre-GU47 TIDE uses the teal atlas and its original card text and material wash. */
export const ORIGINAL_RUNNER_STYLES: readonly RunnerStyle[] = [
  {
    ...RUNNER_STYLES[0]!,
    tagline: "Teal suit, cyan surge. Calm and quick.",
    tint: [0.9, 0.95, 0.95],
    wash: [0.05, 0.2, 0.22]
  },
  ...RUNNER_STYLES.slice(1)
];

export function runnerStylesForLook(mode: LookMode): readonly RunnerStyle[] {
  return mode === "original" ? ORIGINAL_RUNNER_STYLES : RUNNER_STYLES;
}

/** Stored selections win in either look; only a first visit uses the mode's default. */
export function runnerIndexForLook(mode: LookMode, stored: string | null): number {
  const styles = runnerStylesForLook(mode);
  const fallback = mode === "script" ? Math.max(0, styles.findIndex((style) => style.id === "violet")) : 0;
  if (stored === null || stored === "" || !Number.isFinite(Number(stored))) return fallback;
  return Math.max(0, Math.min(styles.length - 1, Math.trunc(Number(stored))));
}

export const hexCss = (hex: number): string => `#${hex.toString(16).padStart(6, "0")}`;
