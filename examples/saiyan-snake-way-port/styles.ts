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
    id: "ember", name: "EMBER", tagline: "Orange suit, red surge. The classic look.",
    gi: 0xc4551d, giDark: 0x8f3a12, skin: 0xf0c08a, hair: 0x1d1620, belt: 0x1f7a72, boot: 0x2c3470, sash: 0x2fc8b4,
    auraCore: 0xfff5d0, auraLit: 0xffc4a0, aura: 0xff5a1a, tint: [0.62, 0.36, 0.16], wash: [1, 0.42, 0.1]
  },
  {
    id: "violet", name: "VIOLET", tagline: "Indigo suit, violet surge. Cool and sharp.",
    gi: 0x3b3fa0, giDark: 0x232766, skin: 0xf0c08a, hair: 0x15101e, belt: 0xe8b64a, boot: 0x1b1e4a, sash: 0xb26bff,
    auraCore: 0xf4e8ff, auraLit: 0xcfa4ff, aura: 0x8a4dff, tint: [0.3, 0.32, 0.62], wash: [0.35, 0.3, 1]
  },
  {
    id: "verdant", name: "VERDANT", tagline: "Moss tunic, green surge. Light on its feet.",
    gi: 0x3f8f4a, giDark: 0x28603a, skin: 0xe0b078, hair: 0xeadfc8, belt: 0xd8b45a, boot: 0x3a2a1e, sash: 0xffd36e,
    auraCore: 0xf6ffd8, auraLit: 0xbcf27e, aura: 0x5ed04a, tint: [0.55, 0.8, 0.5], wash: [0.2, 0.8, 0.25]
  }
];

export const hexCss = (hex: number): string => `#${hex.toString(16).padStart(6, "0")}`;
