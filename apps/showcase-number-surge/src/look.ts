/**
 * Number Surge look table (§6.3): neon-arcade dusk. Deep indigo sky, cyan/magenta
 * gates, gold smash geyser. Presentation only — the sim never reads this file.
 */
import { hexToLinear, sunDirection, type Rgb } from "../../../examples/shared/runner-kit/index";
import type { SkyStop } from "../../../examples/shared/runner-kit/index";

export const PALETTE = {
  skyZenith: "#0d0b2e",
  skyUpper: "#1b1450",
  skyMid: "#33206b",
  skyHorizon: "#7a2f86",
  road: "#221d4e",
  roadStripe: "#3ef2ff",
  roadEdge: "#ff4fd8",
  gateGood: "#3ef2ff",
  gateBad: "#ff4fd8",
  gateFrame: "#eaf6ff",
  ball: "#3ef2ff",
  ballInk: "#10102e",
  wall: "#5a2d91",
  wallTrim: "#ff4fd8",
  shard: "#8a5cf5",
  powerup: "#ffd84d",
  shield: "#7dff9e",
  geyser: "#ffd84d",
  danger: "#ff4f6d"
} as const;

export const SKY_STOPS: readonly SkyStop[] = [
  { t: 0, hex: PALETTE.skyZenith },
  { t: 0.42, hex: PALETTE.skyUpper },
  { t: 0.62, hex: PALETTE.skyMid },
  { t: 0.8, hex: PALETTE.skyHorizon },
  { t: 1, hex: "#2a1748" }
];

export interface NumberSurgeLook {
  readonly id: "number-surge";
  readonly palette: typeof PALETTE;
  readonly skyStops: readonly SkyStop[];
  /** Unit vector towards the key light (low dusk sun off the left shoulder). */
  readonly sunDir: Rgb;
  readonly background: string;
  readonly fog: { readonly color: string; readonly density: number };
  readonly fx: {
    readonly pickGoodFlash: { readonly color: string; readonly strength: number };
    readonly pickBadFlash: { readonly color: string; readonly strength: number };
    readonly smashFlash: { readonly color: string; readonly strength: number };
    readonly wallFailFlash: { readonly color: string; readonly strength: number };
    readonly powerupFlash: { readonly color: string; readonly strength: number };
    readonly milestoneFlash: { readonly color: string; readonly strength: number };
    readonly shakeOnFail: number;
    readonly shakeOnSmash: number;
    readonly fovPunchDeg: number;
  };
  readonly camera: {
    readonly height: number;
    readonly back: number;
    readonly lookAheadZ: number;
    readonly fovDeg: number;
    readonly lerp: number;
  };
}

export const LOOK: NumberSurgeLook = {
  id: "number-surge",
  palette: PALETTE,
  skyStops: SKY_STOPS,
  sunDir: sunDirection(24, -28),
  background: PALETTE.skyZenith,
  fog: { color: PALETTE.skyMid, density: 0.0075 },
  fx: {
    pickGoodFlash: { color: PALETTE.gateGood, strength: 0.12 },
    pickBadFlash: { color: PALETTE.gateBad, strength: 0.16 },
    smashFlash: { color: PALETTE.geyser, strength: 0.3 },
    wallFailFlash: { color: PALETTE.danger, strength: 0.34 },
    powerupFlash: { color: PALETTE.powerup, strength: 0.14 },
    milestoneFlash: { color: PALETTE.geyser, strength: 0.2 },
    shakeOnFail: 0.5,
    shakeOnSmash: 0.3,
    fovPunchDeg: 4
  },
  camera: { height: 4.6, back: 7.5, lookAheadZ: -10, fovDeg: 58, lerp: 0.1 }
};

/** Linear-RGB palette entries for material specs and batch tones. */
export const LINEAR = {
  road: hexToLinear(PALETTE.road),
  roadStripe: hexToLinear(PALETTE.roadStripe),
  roadEdge: hexToLinear(PALETTE.roadEdge),
  gateGood: hexToLinear(PALETTE.gateGood),
  gateBad: hexToLinear(PALETTE.gateBad),
  gateFrame: hexToLinear(PALETTE.gateFrame),
  ball: hexToLinear(PALETTE.ball),
  wall: hexToLinear(PALETTE.wall),
  wallTrim: hexToLinear(PALETTE.wallTrim),
  shard: hexToLinear(PALETTE.shard),
  powerup: hexToLinear(PALETTE.powerup),
  shield: hexToLinear(PALETTE.shield),
  white: hexToLinear("#ffffff")
} as const;