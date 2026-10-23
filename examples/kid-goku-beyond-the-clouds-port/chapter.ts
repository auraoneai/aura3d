/**
 * Chapter data for "Kid Goku: Beyond the Clouds", transcribed by hand from the captured original
 * (tests/fixtures/crayon/kid-goku-beyond-the-clouds/game.js, chapter 0 "Mount Paozu"). Numbers are the
 * original's tuning; names, art and text belong to the original and are not reused beyond labels.
 */
export interface Span { readonly start: number; readonly end: number; readonly bridge?: boolean }
export interface Creature {
  readonly type: "pteranodon" | "trex";
  readonly s: number;
  readonly until?: number;
  readonly bites?: readonly number[];
  readonly swipes?: readonly number[];
}
export interface DragonBall { readonly star: number; readonly s: number; readonly lane: number; readonly height: number }
export interface Meat { readonly s: number; readonly lane: number; readonly height?: number }
export interface Chapter {
  readonly name: string;
  readonly kind: "journey";
  readonly length: number;
  readonly speed: number;
  readonly log: number;
  readonly poles: readonly Span[];
  readonly gaps: readonly Span[];
  readonly walls: readonly Span[];
  readonly waters: readonly Span[];
  readonly checkpoints: readonly number[];
  readonly creatures: readonly Creature[];
  readonly boulders: readonly { readonly s: number }[];
  readonly rocks: readonly { readonly s: number; readonly lane: number }[];
  readonly balls: readonly DragonBall[];
  readonly meat: readonly Meat[];
  readonly home: { readonly s: number; readonly star: number };
}

export const MOUNT_PAOZU: Chapter = {
  name: "Mount Paozu",
  kind: "journey",
  length: 1960,
  speed: 14.5,
  log: 93,
  poles: [{ start: 440, end: 500 }, { start: 680, end: 742 }, { start: 1262, end: 1325 }, { start: 1650, end: 1712 }],
  gaps: [{ start: 150, end: 160, bridge: true }, { start: 845, end: 855 }, { start: 1565, end: 1575 }, { start: 1830, end: 1839, bridge: true }],
  walls: [{ start: 540, end: 625 }],
  waters: [{ start: 1350, end: 1480 }],
  checkpoints: [0, 172, 425, 640, 760, 905, 1030, 1255, 1340, 1500, 1640, 1850],
  creatures: [
    { type: "pteranodon", s: 380 },
    { type: "pteranodon", s: 965 },
    { type: "trex", s: 1040, until: 1250, bites: [1095, 1155, 1210], swipes: [1125, 1185] },
    { type: "pteranodon", s: 1555 }
  ],
  boulders: [{ s: 215 }, { s: 265 }, { s: 795 }, { s: 880 }, { s: 1790 }],
  rocks: [{ s: 45, lane: 2.6 }, { s: 76, lane: -2.6 }],
  balls: [
    { star: 1, s: 155, lane: 0, height: 4.4 },
    { star: 2, s: 506, lane: 0, height: 4.4 },
    { star: 3, s: 585, lane: -3.6, height: 1.2 },
    { star: 5, s: 1170, lane: -3.4, height: 1.2 },
    { star: 6, s: 1420, lane: 3.8, height: 1.1 },
    { star: 7, s: 1718, lane: 0, height: 4.4 }
  ],
  meat: [{ s: 318, lane: 2.4 }, { s: 897, lane: -2.4 }, { s: 1372, lane: -2.2 }, { s: 1594, lane: 2.4 }],
  home: { s: 1992, star: 4 }
};

/** Original `Qf` constants (nimbus tuning). */
export const NIMBUS = {
  call: 0.26, rescueCall: 0.16, ride: 7, rescueRide: 2.4, speed: 1.5, height: 3.2, lift: 1.5, cloudHop: 10.5, hop: 6.5,
  grace: 1.6, magnet: 4.2, minRide: 25,
  gain: { orb: 0.01, ball: 0.15, dodge: 0.06, close: 0.04, perfect: 0.12, launch: 0.03, flow: 0.05, strike: 0.1 } as Record<string, number>,
  setPiece: 0.45, hold: 0.9
} as const;
